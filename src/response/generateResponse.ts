import type { SupportedAction } from "../types/parser";

interface GenerateResponseInput {
  executedActions: SupportedAction[];
  clarificationQuestions: string[];
}

export function generateResponse(input: GenerateResponseInput): string {
  if (input.clarificationQuestions.length > 0) {
    return input.clarificationQuestions.join(" ");
  }

  if (input.executedActions.length === 0) {
    return "כדי להתקדם אני צריך פרטים נוספים.";
  }

  const clientCount = input.executedActions.filter(
    (action) => action.type === "create_or_update_client"
  ).length;
  const taskCount = input.executedActions.filter((action) => action.type === "create_task").length;

  const parts: string[] = [];
  if (clientCount > 0) {
    parts.push(`יצרתי או עדכנתי ${clientCount} לקוחות`);
  }
  if (taskCount > 0) {
    parts.push(`יצרתי ${taskCount} משימות`);
  }

  return `${parts.join(" ו")}.`;
}
