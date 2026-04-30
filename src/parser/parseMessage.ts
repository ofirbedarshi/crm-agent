import { PARSER_SYSTEM_PROMPT } from "./systemPrompt";
import type { ParseMessageResult, SupportedAction, SupportedActionType } from "../types/parser";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o-mini";

const SUPPORTED_ACTION_TYPES: SupportedActionType[] = ["create_or_update_client", "create_task"];
type PipelineIntent = "create_client" | "create_task" | "unknown";

interface IntentResult {
  intent: PipelineIntent;
}

interface ExtractedEntities {
  name?: string;
  city?: string;
  property_type?: string;
  budget?: number;
  due_time?: string;
  title?: string;
  client_name?: string;
}

interface ValidationResult {
  isValid: boolean;
  missingFields: string[];
}

interface ParseMessageOptions {
  debug?: boolean;
  traceInput?: {
    userPrompt?: string;
  };
}

interface ParseMessageDebugInfo {
  llm: {
    model: string;
    systemPrompt: string;
    userPrompt: string;
    rawResponseText: string;
    parseStatus: "ok" | "invalid_json";
  };
  intent: IntentResult;
  entities: ExtractedEntities;
  validation: ValidationResult;
  decision: ParseMessageResult;
}

export type ParseMessagePipelineResult = ParseMessageResult & {
  _debug?: ParseMessageDebugInfo;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function normalizeRole(value: unknown): "buyer" | "owner" | "unknown" | undefined {
  if (value === "buyer" || value === "owner" || value === "unknown") {
    return value;
  }
  return undefined;
}

function normalizeClientAction(data: Record<string, unknown>): SupportedAction | null {
  const name = asNonEmptyString(data.name) ?? asNonEmptyString(data.full_name);
  if (!name) {
    return null;
  }

  const nestedPreferences = isRecord(data.preferences) ? data.preferences : {};
  const city =
    asNonEmptyString(nestedPreferences.city) ??
    asNonEmptyString(data.city) ??
    asNonEmptyString(data.location);
  const propertyType =
    asNonEmptyString(nestedPreferences.property_type) ??
    asNonEmptyString(data.property_type) ??
    asNonEmptyString(data.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(data.budget);
  const entryDate = asNonEmptyString(nestedPreferences.entry_date) ?? asNonEmptyString(data.entry_date);

  const preferences: Record<string, unknown> = {};
  if (city) preferences.city = city;
  if (propertyType) preferences.property_type = propertyType;
  if (budget !== undefined) preferences.budget = budget;
  if (entryDate) preferences.entry_date = entryDate;

  const role = normalizeRole(data.role);
  return {
    type: "create_or_update_client",
    data: {
      name,
      ...(role ? { role } : {}),
      ...(Object.keys(preferences).length > 0 ? { preferences } : {})
    }
  };
}

function normalizeTaskAction(data: Record<string, unknown>): SupportedAction | null {
  const title =
    asNonEmptyString(data.title) ??
    asNonEmptyString(data.description) ??
    asNonEmptyString(data.task) ??
    asNonEmptyString(data.task_description);

  if (!title) {
    return null;
  }

  const dueTime = asNonEmptyString(data.due_time) ?? asNonEmptyString(data.due_date);
  const clientName = asNonEmptyString(data.client_name) ?? asNonEmptyString(data.name);

  return {
    type: "create_task",
    data: {
      title,
      ...(dueTime ? { due_time: dueTime } : {}),
      ...(clientName ? { client_name: clientName } : {})
    }
  };
}

function normalizeAction(action: unknown): { action: SupportedAction | null; clarification?: string } {
  if (!isRecord(action)) {
    return { action: null };
  }

  const type = action.type;
  const data = action.data;

  if (typeof type !== "string" || !SUPPORTED_ACTION_TYPES.includes(type as SupportedActionType)) {
    return { action: null };
  }

  if (!isRecord(data)) {
    return { action: null };
  }

  if (type === "create_or_update_client") {
    const normalized = normalizeClientAction(data);
    if (!normalized) {
      return {
        action: null,
        clarification: "מה השם המלא של הלקוח כדי שאוכל ליצור או לעדכן את כרטיס הלקוח?"
      };
    }
    return { action: normalized };
  }

  const normalized = normalizeTaskAction(data);
  if (!normalized) {
    return {
      action: null,
      clarification: "מה בדיוק צריך לבצע כדי שאוכל ליצור את המשימה שביקשת?"
    };
  }
  return { action: normalized };
}

function findFirstActionData(
  rawModelJson: Record<string, unknown>,
  type: SupportedActionType
): Record<string, unknown> | null {
  if (!Array.isArray(rawModelJson.actions)) {
    return null;
  }

  for (const action of rawModelJson.actions) {
    if (!isRecord(action) || action.type !== type || !isRecord(action.data)) {
      continue;
    }
    return action.data;
  }

  return null;
}

function detectIntent(rawModelJson: unknown): IntentResult {
  if (!isRecord(rawModelJson) || !Array.isArray(rawModelJson.actions)) {
    return { intent: "unknown" };
  }

  for (const action of rawModelJson.actions) {
    if (!isRecord(action)) {
      continue;
    }

    if (action.type === "create_or_update_client") {
      return { intent: "create_client" };
    }

    if (action.type === "create_task") {
      return { intent: "create_task" };
    }
  }

  return { intent: "unknown" };
}

function extractEntities(rawModelJson: unknown): ExtractedEntities {
  if (!isRecord(rawModelJson)) {
    return {};
  }

  const clientData = findFirstActionData(rawModelJson, "create_or_update_client") ?? {};
  const taskData = findFirstActionData(rawModelJson, "create_task") ?? {};
  const nestedPreferences = isRecord(clientData.preferences) ? clientData.preferences : {};

  const name = asNonEmptyString(clientData.name) ?? asNonEmptyString(clientData.full_name);
  const city =
    asNonEmptyString(nestedPreferences.city) ??
    asNonEmptyString(clientData.city) ??
    asNonEmptyString(clientData.location);
  const propertyType =
    asNonEmptyString(nestedPreferences.property_type) ??
    asNonEmptyString(clientData.property_type) ??
    asNonEmptyString(clientData.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(clientData.budget);
  const dueTime = asNonEmptyString(taskData.due_time) ?? asNonEmptyString(taskData.due_date);
  const title =
    asNonEmptyString(taskData.title) ??
    asNonEmptyString(taskData.description) ??
    asNonEmptyString(taskData.task) ??
    asNonEmptyString(taskData.task_description);
  const clientName = asNonEmptyString(taskData.client_name) ?? asNonEmptyString(taskData.name);

  return {
    ...(name ? { name } : {}),
    ...(city ? { city } : {}),
    ...(propertyType ? { property_type: propertyType } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(dueTime ? { due_time: dueTime } : {}),
    ...(title ? { title } : {}),
    ...(clientName ? { client_name: clientName } : {})
  };
}

function validateRequiredFields(intent: IntentResult, entities: ExtractedEntities): ValidationResult {
  const missingFields: string[] = [];

  if (intent.intent === "create_client" && !entities.name) {
    missingFields.push("name");
  }

  if (intent.intent === "create_task" && !entities.title) {
    missingFields.push("title");
  }

  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}

function clarificationForMissingField(missingField: string): string {
  if (missingField === "name") {
    return "מה השם המלא של הלקוח כדי שאוכל ליצור או לעדכן את כרטיס הלקוח?";
  }
  if (missingField === "title") {
    return "מה בדיוק צריך לבצע כדי שאוכל ליצור את המשימה שביקשת?";
  }
  return "מה חסר בהודעה כדי שאוכל לבצע את הפעולה שביקשת?";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function normalizeParseResult(raw: unknown): ParseMessageResult {
  if (!isRecord(raw)) {
    return { actions: [], missing_info: [], clarification_questions: [] };
  }

  const clarificationQuestions = normalizeStringArray(raw.clarification_questions);
  const mappedActions = Array.isArray(raw.actions) ? raw.actions.map(normalizeAction) : [];
  const actions = mappedActions
    .map((item) => item.action)
    .filter((action): action is SupportedAction => action !== null);
  const normalizationClarifications = mappedActions
    .map((item) => item.clarification)
    .filter((item): item is string => typeof item === "string");

  const finalClarificationQuestions = Array.from(
    new Set([...clarificationQuestions, ...normalizationClarifications])
  );

  if (actions.length === 0 && finalClarificationQuestions.length === 0) {
    finalClarificationQuestions.push("מה חסר בהודעה כדי שאוכל לבצע את הפעולה שביקשת?");
  }

  return {
    actions,
    missing_info: normalizeStringArray(raw.missing_info),
    clarification_questions: finalClarificationQuestions
  };
}

function decideOutput(
  rawModelJson: unknown,
  intent: IntentResult,
  validation: ValidationResult
): ParseMessageResult {
  const result = normalizeParseResult(rawModelJson);

  if (intent.intent === "unknown") {
    if (result.clarification_questions.length === 0) {
      result.clarification_questions.push("מה חסר בהודעה כדי שאוכל לבצע את הפעולה שביקשת?");
    }
    return result;
  }

  if (!validation.isValid) {
    const missingInfo = Array.from(new Set([...result.missing_info, ...validation.missingFields]));
    const missingClarifications = validation.missingFields.map(clarificationForMissingField);
    const clarificationQuestions = Array.from(
      new Set([...result.clarification_questions, ...missingClarifications])
    );

    return {
      actions: [],
      missing_info: missingInfo,
      clarification_questions: clarificationQuestions
    };
  }

  return result;
}

export async function parseMessage(
  input: string,
  options: ParseMessageOptions = {}
): Promise<ParseMessagePipelineResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const userPrompt = options.traceInput?.userPrompt ?? input;
  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PARSER_SYSTEM_PROMPT },
        { role: "user", content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response did not include JSON content");
  }

  let rawModelJson: unknown;
  let parseStatus: "ok" | "invalid_json" = "ok";
  try {
    rawModelJson = JSON.parse(content);
  } catch {
    parseStatus = "invalid_json";
    throw new Error("OpenAI response content is not valid JSON");
  }

  const intent = detectIntent(rawModelJson);
  console.log("STEP 1 - Intent:", intent);

  const entities = extractEntities(rawModelJson);
  console.log("STEP 2 - Entities:", entities);

  const validation = validateRequiredFields(intent, entities);
  console.log("STEP 3 - Validation:", validation);

  const result = decideOutput(rawModelJson, intent, validation);
  console.log("STEP 4 - Decision:", result);

  if (!options.debug) {
    return result;
  }

  return {
    ...result,
    _debug: {
      intent,
      entities,
      validation,
      decision: result,
      llm: {
        model: DEFAULT_MODEL,
        systemPrompt: PARSER_SYSTEM_PROMPT,
        userPrompt,
        rawResponseText: content,
        parseStatus
      }
    }
  };
}
