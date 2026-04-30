import { parseMessage } from "../parser/parseMessage";
import { executeActions } from "../orchestrator/executeActions";
import { generateResponse } from "../response/generateResponse";
import { validateParseResult } from "../validation/validateParseResult";
import type { ParseMessageResult, SupportedAction } from "../types/parser";

export interface RunCrmAgentResult {
  parsed: ParseMessageResult;
  validActions: SupportedAction[];
  response: string;
}

export async function runCrmAgent(input: string): Promise<RunCrmAgentResult> {
  const parsed = await parseMessage(input);
  const validation = validateParseResult(parsed);

  if (validation.clarification_questions.length > 0) {
    return {
      parsed,
      validActions: validation.validActions,
      response: generateResponse({
        executedActions: [],
        clarificationQuestions: validation.clarification_questions
      })
    };
  }

  executeActions(validation.validActions);
  return {
    parsed,
    validActions: validation.validActions,
    response: generateResponse({
      executedActions: validation.validActions,
      clarificationQuestions: []
    })
  };
}
