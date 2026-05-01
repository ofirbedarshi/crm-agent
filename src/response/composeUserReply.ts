import type { ActionExecutionResult } from "../orchestrator/executeActions";
import type { ParseMessageResult, SupportedAction } from "../types/parser";
import type { ValidationResult } from "../validation/validateParseResult";
import { formatExecutedReply } from "./formatExecutedReply";

export function missingInfoToQuestion(missingInfo: string[]): string {
  const key = missingInfo[0];
  if (key === "name") {
    return "חסר לי פרט קטן, מה השם המלא של הלקוח?";
  }
  if (key === "title") {
    return "חסר לי פרט קטן, מה המשימה המדויקת שצריך לבצע?";
  }
  if (key === "due_time") {
    return "חסר לי מתי להזכיר או לבצע את זה — מה היום או החלון הכללי (בוקר/ערב)? שעה מדויקת לא חובה.";
  }
  return "חסר לי פרט קטן כדי להמשיך, אפשר לחדד?";
}

export function composeUserReply(input: {
  parsed: ParseMessageResult;
  validation: ValidationResult;
  executedActions: SupportedAction[];
  executionResults: ActionExecutionResult[];
}): string {
  const { parsed, validation, executedActions, executionResults } = input;

  if (validation.validActions.length === 0 && validation.clarification_questions.length > 0) {
    return validation.clarification_questions.join(" ");
  }

  if (validation.validActions.length > 0) {
    const executedPart = formatExecutedReply(executedActions, executionResults);
    if (validation.clarification_questions.length > 0) {
      return [executedPart, ...validation.clarification_questions].join("\n\n");
    }
    return executedPart;
  }

  if (parsed.clarification_questions.length > 0) {
    return parsed.clarification_questions[0] ?? "אפשר לחדד רגע את הבקשה?";
  }

  if (parsed.missing_info.length > 0) {
    return missingInfoToQuestion(parsed.missing_info);
  }

  if (validation.missing_info.length > 0) {
    return missingInfoToQuestion(validation.missing_info);
  }

  return "לא בטוח שהבנתי עד הסוף, אפשר לחדד?";
}
