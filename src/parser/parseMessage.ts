import { PARSER_SYSTEM_PROMPT } from "./systemPrompt";
import type {
  ClientInteractionPatch,
  ParseMessageResult,
  SupportedAction,
  SupportedActionType
} from "../types/parser";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MODEL = "gpt-4o";

const SUPPORTED_ACTION_TYPES: SupportedActionType[] = [
  "create_or_update_client",
  "create_task",
  "create_or_update_property"
];
type PipelineIntent = "create_client" | "create_task" | "create_property" | "unknown";

interface IntentResult {
  intent: PipelineIntent;
}

interface ExtractedEntities {
  name?: string;
  city?: string;
  areas?: string[];
  property_type?: string;
  budget?: number;
  features?: string[];
  lead_source?: string;
  lead_temperature?: "hot" | "warm" | "cold" | "unknown";
  flexible_entry?: string;
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

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (normalized.length === 0) {
    return undefined;
  }

  return Array.from(new Set(normalized));
}

function normalizeRole(value: unknown): "buyer" | "owner" | "unknown" | undefined {
  if (value === "buyer" || value === "owner" || value === "unknown") {
    return value;
  }
  return undefined;
}

function normalizeLeadTemperature(value: unknown): "hot" | "warm" | "cold" | "unknown" | undefined {
  if (value === "hot" || value === "warm" || value === "cold" || value === "unknown") {
    return value;
  }
  return undefined;
}

function normalizeClientInteractionPatches(data: Record<string, unknown>): ClientInteractionPatch[] | undefined {
  const raw = data.interactions;
  if (!Array.isArray(raw)) {
    return undefined;
  }
  const out: ClientInteractionPatch[] = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const summary =
      asNonEmptyString(item.summary) ??
      asNonEmptyString(item.description) ??
      asNonEmptyString(item.note);
    if (!summary) {
      continue;
    }
    const property_address =
      asNonEmptyString(item.property_address) ?? asNonEmptyString(item.property);
    const kind =
      asNonEmptyString(item.kind) ??
      asNonEmptyString(item.type) ??
      asNonEmptyString(item.interaction_type);
    const extraProps = asStringArray(item.property_addresses);
    out.push({
      summary,
      ...(property_address ? { property_address } : {}),
      ...(extraProps ? { property_addresses: extraProps } : {}),
      ...(kind ? { kind } : {})
    });
  }
  return out.length > 0 ? out : undefined;
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
  const areas = asStringArray(nestedPreferences.areas) ?? asStringArray(data.areas);
  const propertyType =
    asNonEmptyString(nestedPreferences.property_type) ??
    asNonEmptyString(data.property_type) ??
    asNonEmptyString(data.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(data.budget);
  const entryDate = asNonEmptyString(nestedPreferences.entry_date) ?? asNonEmptyString(data.entry_date);
  const features = asStringArray(nestedPreferences.features) ?? asStringArray(data.features);
  const flexibleEntry =
    asNonEmptyString(nestedPreferences.flexible_entry) ?? asNonEmptyString(data.flexible_entry);

  const preferences: Record<string, unknown> = {};
  if (city) preferences.city = city;
  if (areas) preferences.areas = areas;
  if (propertyType) preferences.property_type = propertyType;
  if (budget !== undefined) preferences.budget = budget;
  if (entryDate) preferences.entry_date = entryDate;
  if (features) preferences.features = features;
  if (flexibleEntry) preferences.flexible_entry = flexibleEntry;

  const role = normalizeRole(data.role);
  const leadSource = asNonEmptyString(data.lead_source);
  const leadTemperature = normalizeLeadTemperature(data.lead_temperature);
  const interactions = normalizeClientInteractionPatches(data);
  return {
    type: "create_or_update_client",
    data: {
      name,
      ...(role ? { role } : {}),
      ...(leadSource ? { lead_source: leadSource } : {}),
      ...(leadTemperature ? { lead_temperature: leadTemperature } : {}),
      ...(Object.keys(preferences).length > 0 ? { preferences } : {}),
      ...(interactions ? { interactions } : {})
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

function propertyAddressFromData(data: Record<string, unknown>): string | undefined {
  return (
    asNonEmptyString(data.address) ??
    asNonEmptyString(data.full_address) ??
    asNonEmptyString(data.property_address)
  );
}

function normalizePropertyAction(data: Record<string, unknown>): SupportedAction | null {
  const address = propertyAddressFromData(data);
  if (!address) {
    return null;
  }

  const city = asNonEmptyString(data.city);
  const rooms = asNumber(data.rooms);
  const features = asStringArray(data.features);
  const askingPrice = asNumber(data.asking_price);
  const priceNote = asNonEmptyString(data.price_note);
  const generalNotes = asNonEmptyString(data.general_notes);
  const ownerClientName = asNonEmptyString(data.owner_client_name);

  return {
    type: "create_or_update_property",
    data: {
      address,
      ...(city ? { city } : {}),
      ...(rooms !== undefined ? { rooms } : {}),
      ...(features ? { features } : {}),
      ...(askingPrice !== undefined ? { asking_price: askingPrice } : {}),
      ...(priceNote ? { price_note: priceNote } : {}),
      ...(generalNotes ? { general_notes: generalNotes } : {}),
      ...(ownerClientName ? { owner_client_name: ownerClientName } : {})
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

  if (type === "create_or_update_property") {
    const normalized = normalizePropertyAction(data);
    if (!normalized) {
      return {
        action: null,
        clarification:
          "מהי הכתובת המלאה של הנכס (רחוב ומספר ועיר) כדי שאוכל לפתוח כרטיס נכס?"
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

/**
 * Dominant pipeline intent when several supported actions appear in one model reply.
 * Priority matches CRM semantics and `sortActionsForEntityLinkage` in `runCrmAgent`:
 * person entity (client) → physical asset (property) → todo (task).
 * Order inside `rawModelJson.actions` does not matter.
 */
function detectIntent(rawModelJson: unknown): IntentResult {
  if (!isRecord(rawModelJson) || !Array.isArray(rawModelJson.actions)) {
    return { intent: "unknown" };
  }

  let hasClient = false;
  let hasProperty = false;
  let hasTask = false;

  for (const action of rawModelJson.actions) {
    if (!isRecord(action)) {
      continue;
    }
    const t = action.type;
    if (t === "create_or_update_client") {
      hasClient = true;
    } else if (t === "create_or_update_property") {
      hasProperty = true;
    } else if (t === "create_task") {
      hasTask = true;
    }
  }

  if (hasClient) {
    return { intent: "create_client" };
  }
  if (hasProperty) {
    return { intent: "create_property" };
  }
  if (hasTask) {
    return { intent: "create_task" };
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
  const areas = asStringArray(nestedPreferences.areas) ?? asStringArray(clientData.areas);
  const propertyType =
    asNonEmptyString(nestedPreferences.property_type) ??
    asNonEmptyString(clientData.property_type) ??
    asNonEmptyString(clientData.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(clientData.budget);
  const features = asStringArray(nestedPreferences.features) ?? asStringArray(clientData.features);
  const leadSource = asNonEmptyString(clientData.lead_source);
  const leadTemperature = normalizeLeadTemperature(clientData.lead_temperature);
  const flexibleEntry =
    asNonEmptyString(nestedPreferences.flexible_entry) ?? asNonEmptyString(clientData.flexible_entry);
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
    ...(areas ? { areas } : {}),
    ...(propertyType ? { property_type: propertyType } : {}),
    ...(budget !== undefined ? { budget } : {}),
    ...(features ? { features } : {}),
    ...(leadSource ? { lead_source: leadSource } : {}),
    ...(leadTemperature ? { lead_temperature: leadTemperature } : {}),
    ...(flexibleEntry ? { flexible_entry: flexibleEntry } : {}),
    ...(dueTime ? { due_time: dueTime } : {}),
    ...(title ? { title } : {}),
    ...(clientName ? { client_name: clientName } : {})
  };
}

/** Validates every action in the raw model output (supports mixed batches). */
function collectMissingFieldsFromRawActions(rawModelJson: unknown): string[] {
  const missing: string[] = [];
  if (!isRecord(rawModelJson) || !Array.isArray(rawModelJson.actions)) {
    return missing;
  }

  for (const action of rawModelJson.actions) {
    if (!isRecord(action) || typeof action.type !== "string" || !isRecord(action.data)) {
      continue;
    }
    const data = action.data;
    if (action.type === "create_or_update_client") {
      const name = asNonEmptyString(data.name) ?? asNonEmptyString(data.full_name);
      if (!name) {
        missing.push("name");
      }
    }
    if (action.type === "create_task") {
      const title =
        asNonEmptyString(data.title) ??
        asNonEmptyString(data.description) ??
        asNonEmptyString(data.task) ??
        asNonEmptyString(data.task_description);
      if (!title) {
        missing.push("title");
      }
      const clientRef =
        asNonEmptyString(data.client_name) ?? asNonEmptyString(data.name);
      if (!clientRef) {
        missing.push("task_client_name");
      }
    }
    if (action.type === "create_or_update_property") {
      const addr = propertyAddressFromData(data);
      if (!addr) {
        missing.push("property_address");
      }
    }
  }

  return Array.from(new Set(missing));
}

function validateRequiredFields(rawModelJson: unknown): ValidationResult {
  const missingFields = collectMissingFieldsFromRawActions(rawModelJson);
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
  if (missingField === "property_address") {
    return "מהי הכתובת המלאה של הנכס (רחוב ומספר ועיר) כדי שאוכל לפתוח כרטיס נכס?";
  }
  if (missingField === "task_client_name") {
    return "על איזה לקוח מדובר למשימה? צריך שם מלא כדי לשייך את המשימה לישות במערכת.";
  }
  if (missingField === "property_owner_client_name") {
    return "למי שייך הנכס? צריך שם לקוח מלא זהה לכרטיס הלקוח כדי לקשר את הנכס לישות.";
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

  const rawHasSupportedAction =
    isRecord(rawModelJson) &&
    Array.isArray(rawModelJson.actions) &&
    rawModelJson.actions.some(
      (a) =>
        isRecord(a) &&
        typeof a.type === "string" &&
        SUPPORTED_ACTION_TYPES.includes(a.type as SupportedActionType)
    );

  if (intent.intent === "unknown" && !rawHasSupportedAction) {
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

  const validation = validateRequiredFields(rawModelJson);
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
