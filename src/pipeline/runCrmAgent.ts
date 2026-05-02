import { formatCrmSnapshotForPrompt } from "../crm/crmSnapshotForPrompt";
import { getFakeCrmState } from "../crm/fakeCrmAdapter";
import { parseMessage } from "../parser/parseMessage";
import { executeActions, type ActionExecutionResult } from "../orchestrator/executeActions";
import { composeUserReply } from "../response/composeUserReply";
import { resolveAndEnrichCrmActions } from "../resolution/resolveAndEnrichCrmActions";
import { validateParseResult, type ValidationResult } from "../validation/validateParseResult";
import type { ParseMessageResult, SupportedAction } from "../types/parser";
import type { CrmPipelineTrace } from "./trace";

export interface RunCrmAgentResult {
  parsed: ParseMessageResult;
  validActions: SupportedAction[];
  executionResults: ActionExecutionResult[];
  response: string;
  trace: CrmPipelineTrace;
}

interface RunCrmAgentInput {
  pipelineInput: string;
  rawMessage: string;
  historyCount?: number;
}

export async function runCrmAgent(input: RunCrmAgentInput): Promise<RunCrmAgentResult> {
  const startedAt = Date.now();
  const trace: CrmPipelineTrace = {
    input: {
      rawMessage: input.rawMessage,
      pipelineInput: input.pipelineInput,
      historyCount: input.historyCount
    },
    timing: {}
  };

  const snapshotText = formatCrmSnapshotForPrompt(getFakeCrmState());
  const augmentedPipelineInput =
    snapshotText.trim().length > 0
      ? `${input.pipelineInput}\n\n### מצב CRM נוכחי (מקור אמת)\n${snapshotText}`
      : input.pipelineInput;

  const parseStartedAt = Date.now();
  const parsed = await parseMessage(augmentedPipelineInput, {
    debug: true,
    traceInput: {
      userPrompt: augmentedPipelineInput
    }
  });
  trace.timing.parseMs = Date.now() - parseStartedAt;
  trace.parser = parsed;
  trace.llm = parsed._debug?.llm;

  const validateStartedAt = Date.now();
  const validationRaw = validateParseResult(parsed);
  trace.timing.validateMs = Date.now() - validateStartedAt;

  const resolveStartedAt = Date.now();
  const resolution = resolveAndEnrichCrmActions(
    validationRaw.validActions,
    getFakeCrmState().clients,
    input.rawMessage
  );
  trace.timing.resolveMs = Date.now() - resolveStartedAt;

  const validation: ValidationResult = {
    ...validationRaw,
    validActions: resolution.validActions,
    clarification_questions: Array.from(
      new Set([...validationRaw.clarification_questions, ...resolution.clarifications])
    ),
    rejectedActions: [...validationRaw.rejectedActions, ...resolution.rejectedActions]
  };

  trace.validation = {
    validActions: validation.validActions,
    rejectedActions: validation.rejectedActions,
    missingInfo: validation.missing_info,
    clarificationQuestions: validation.clarification_questions
  };

  const clarifyOnly =
    validation.validActions.length === 0 && validation.clarification_questions.length > 0;

  if (clarifyOnly) {
    const responseStartedAt = Date.now();
    const generatedResponse = composeUserReply({
      parsed,
      validation,
      executedActions: [],
      executionResults: []
    });
    trace.timing.responseMs = Date.now() - responseStartedAt;
    trace.timing.totalMs = Date.now() - startedAt;
    trace.response = {
      generatedResponse,
      formattedReply: generatedResponse,
      replyType: "clarification"
    };
    return {
      parsed,
      validActions: validation.validActions,
      executionResults: [],
      response: generatedResponse,
      trace
    };
  }

  const executeStartedAt = Date.now();
  const executionResults = executeActions(validation.validActions);
  trace.timing.executeMs = Date.now() - executeStartedAt;
  trace.crm = {
    executionResults
  };

  const responseStartedAt = Date.now();
  const generatedResponse = composeUserReply({
    parsed,
    validation,
    executedActions: validation.validActions,
    executionResults
  });
  trace.timing.responseMs = Date.now() - responseStartedAt;
  trace.timing.totalMs = Date.now() - startedAt;
  const replyType = validation.validActions.length > 0 ? "actions" : "fallback";
  trace.response = {
    generatedResponse,
    formattedReply: generatedResponse,
    replyType
  };

  return {
    parsed,
    validActions: validation.validActions,
    executionResults,
    response: generatedResponse,
    trace
  };
}
