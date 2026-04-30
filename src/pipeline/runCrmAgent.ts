import { parseMessage } from "../parser/parseMessage";
import { executeActions } from "../orchestrator/executeActions";
import { generateResponse } from "../response/generateResponse";
import { validateParseResult } from "../validation/validateParseResult";
import type { ParseMessageResult, SupportedAction } from "../types/parser";
import type { CrmPipelineTrace } from "./trace";

export interface RunCrmAgentResult {
  parsed: ParseMessageResult;
  validActions: SupportedAction[];
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

  const parseStartedAt = Date.now();
  const parsed = await parseMessage(input.pipelineInput, {
    debug: true,
    traceInput: {
      userPrompt: input.pipelineInput
    }
  });
  trace.timing.parseMs = Date.now() - parseStartedAt;
  trace.parser = parsed;
  trace.llm = parsed._debug?.llm;

  const validateStartedAt = Date.now();
  const validation = validateParseResult(parsed);
  trace.timing.validateMs = Date.now() - validateStartedAt;
  trace.validation = {
    validActions: validation.validActions,
    rejectedActions: validation.rejectedActions,
    missingInfo: validation.missing_info,
    clarificationQuestions: validation.clarification_questions
  };

  if (validation.clarification_questions.length > 0) {
    const responseStartedAt = Date.now();
    const generatedResponse = generateResponse({
      executedActions: [],
      clarificationQuestions: validation.clarification_questions
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
  const generatedResponse = generateResponse({
    executedActions: validation.validActions,
    clarificationQuestions: []
  });
  trace.timing.responseMs = Date.now() - responseStartedAt;
  trace.timing.totalMs = Date.now() - startedAt;
  trace.response = {
    generatedResponse,
    formattedReply: generatedResponse,
    replyType: validation.validActions.length > 0 ? "actions" : "fallback"
  };

  return {
    parsed,
    validActions: validation.validActions,
    response: generatedResponse,
    trace
  };
}
