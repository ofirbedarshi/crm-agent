import type { ActionExecutionResult } from "../orchestrator/executeActions";
import type { ParseMessagePipelineResult } from "../parser/parseMessage";
import type { SupportedAction } from "../types/parser";

/** Voice turn: Whisper transcription + LLM cleanup before the CRM pipeline runs. */
export interface TraceVoiceStage {
  transcriptionModel: string;
  cleanupModel: string;
  transcriptionMs: number;
  cleanupMs: number;
}

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
  /** Present when the user message originated from `/api/voice-chat` (audio → text). */
  voice?: TraceVoiceStage;
  llm?: TraceLlmStage;
  parser?: ParseMessagePipelineResult;
  validation?: TraceValidationStage;
  crm?: {
    executionResults: ActionExecutionResult[];
  };
  response?: TraceResponseStage;
  timing: {
    /** Whisper (or configured) speech-to-text API latency */
    voiceTranscribeMs?: number;
    /** LLM JSON cleanup / correction latency (OPENAI_CLEANUP_MODEL) */
    voiceCleanupMs?: number;
    parseMs?: number;
    validateMs?: number;
    resolveMs?: number;
    executeMs?: number;
    responseMs?: number;
    totalMs?: number;
  };
  error?: {
    stage: string;
    message: string;
  };
}
