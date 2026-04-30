import type {
  ClientPreferences,
  CreateOrUpdateClientAction,
  CreateTaskAction,
  ParseMessageResult,
  SupportedAction
} from "../types/parser";

export interface ValidationResult {
  validActions: SupportedAction[];
  clarification_questions: string[];
  missing_info: string[];
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizePreferences(value: unknown): ClientPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const preferences = value as Record<string, unknown>;
  const normalized: ClientPreferences = {};
  const city = asNonEmptyString(preferences.city);
  const propertyType = asNonEmptyString(preferences.property_type);
  const budget = asNumber(preferences.budget);
  const entryDate = asNonEmptyString(preferences.entry_date);

  if (city) normalized.city = city;
  if (propertyType) normalized.property_type = propertyType;
  if (budget !== undefined) normalized.budget = budget;
  if (entryDate) normalized.entry_date = entryDate;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeClientAction(action: SupportedAction): CreateOrUpdateClientAction | null {
  if (action.type !== "create_or_update_client") {
    return null;
  }

  const name = asNonEmptyString(action.data.name);
  if (!name) {
    return null;
  }

  const role =
    action.data.role === "buyer" || action.data.role === "owner" || action.data.role === "unknown"
      ? action.data.role
      : undefined;

  const preferences = normalizePreferences(action.data.preferences);
  return {
    type: "create_or_update_client",
    data: {
      name,
      ...(role ? { role } : {}),
      ...(preferences ? { preferences } : {})
    }
  };
}

function normalizeTaskAction(action: SupportedAction): CreateTaskAction | null {
  if (action.type !== "create_task") {
    return null;
  }

  const title = asNonEmptyString(action.data.title);
  if (!title) {
    return null;
  }

  const dueTime = asNonEmptyString(action.data.due_time);
  const clientName = asNonEmptyString(action.data.client_name);

  return {
    type: "create_task",
    data: {
      title,
      ...(dueTime ? { due_time: dueTime } : {}),
      ...(clientName ? { client_name: clientName } : {})
    }
  };
}

export function validateParseResult(result: ParseMessageResult): ValidationResult {
  const validActions: SupportedAction[] = [];
  const clarifications = new Set<string>(result.clarification_questions);
  const missingInfo = new Set<string>(result.missing_info);

  for (const action of result.actions) {
    if (action.type === "create_or_update_client") {
      const normalized = normalizeClientAction(action);
      if (!normalized) {
        missingInfo.add("client_name");
        clarifications.add("מה השם המלא של הלקוח כדי שאוכל ליצור או לעדכן את כרטיס הלקוח?");
      } else {
        validActions.push(normalized);
      }
      continue;
    }

    if (action.type === "create_task") {
      const normalized = normalizeTaskAction(action);
      if (!normalized) {
        missingInfo.add("task_title");
        clarifications.add("מה בדיוק צריך לבצע כדי שאוכל ליצור את המשימה שביקשת?");
      } else {
        validActions.push(normalized);
      }
    }
  }

  return {
    validActions,
    clarification_questions: Array.from(clarifications),
    missing_info: Array.from(missingInfo)
  };
}
