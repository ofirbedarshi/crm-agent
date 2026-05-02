import { appendChatTurns, clearChatTranscriptAndRotateSegment, getChatTranscriptSnapshot } from "./chatTranscriptStore";
import { buildPipelineInput } from "../pipeline/buildPipelineInput";
import { runCrmAgent, type RunCrmAgentResult } from "../pipeline/runCrmAgent";

export async function processDemoChatTurn(normalizedMessage: string): Promise<RunCrmAgentResult> {
  const prior = getChatTranscriptSnapshot();
  const pipelineInput = buildPipelineInput(normalizedMessage, prior);
  const result = await runCrmAgent({
    rawMessage: normalizedMessage,
    pipelineInput,
    historyCount: prior.length
  });

  appendChatTurns({ role: "user", text: normalizedMessage }, { role: "bot", text: result.response });

  const crmExecutedSuccessfully =
    result.executionResults.length > 0 && result.executionResults.every((r) => r.success);

  if (crmExecutedSuccessfully) {
    clearChatTranscriptAndRotateSegment();
  }

  return result;
}
