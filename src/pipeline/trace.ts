import type { ActionExecutionResult } from "../orchestrator/executeActions";
import type { ParseMessagePipelineResult } from "../parser/parseMessage";
import type { SupportedAction } from "../types/parser";

export interface TraceInputStage {
  rawMessage: string;
  pipelineInput: string;
  historyCount?: number;
}

export interface TraceLlmStage {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  rawResponseText?: string;
  parseStatus: "ok" | "invalid_json";
}

export interface TraceValidationStage {
  validActions: SupportedAction[];
  rejectedActions: Array<{ actionType: string; reason: string }>;
  missingInfo: string[];
  clarificationQuestions: string[];
}

export interface TraceResponseStage {
  generatedResponse: string;
  formattedReply: string;
  replyType: "clarification" | "actions" | "fallback";
}

export interface CrmPipelineTrace {
  input: TraceInputStage;
  llm?: TraceLlmStage;
  parser?: ParseMessagePipelineResult;
  validation?: TraceValidationStage;
  crm?: {
    executionResults: ActionExecutionResult[];
  };
  response?: TraceResponseStage;
  timing: {
    parseMs?: number;
    validateMs?: number;
    executeMs?: number;
    responseMs?: number;
    totalMs?: number;
  };
  error?: {
    stage: string;
    message: string;
  };
}
