import type {
  ClientInteractionPatch,
  ClientPreferences,
  CreateOrUpdateClientAction,
  CreateOrUpdatePropertyAction,
  CreateTaskAction,
  ParseMessageResult,
  SupportedAction
} from "../types/parser";

export interface ValidationResult {
  validActions: SupportedAction[];
  rejectedActions: Array<{ actionType: string; reason: string }>;
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

function normalizeLeadTemperature(value: unknown): "hot" | "warm" | "cold" | "unknown" | undefined {
  if (value === "hot" || value === "warm" || value === "cold" || value === "unknown") {
    return value;
  }
  return undefined;
}

function normalizePreferences(value: unknown): ClientPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const preferences = value as Record<string, unknown>;
  const normalized: ClientPreferences = {};
  const city = asNonEmptyString(preferences.city);
  const areas = asStringArray(preferences.areas);
  const propertyType = asNonEmptyString(preferences.property_type);
  const budget = asNumber(preferences.budget);
  const entryDate = asNonEmptyString(preferences.entry_date);
  const features = asStringArray(preferences.features);
  const flexibleEntry = asNonEmptyString(preferences.flexible_entry);

  if (city) normalized.city = city;
  if (areas) normalized.areas = areas;
  if (propertyType) normalized.property_type = propertyType;
  if (budget !== undefined) normalized.budget = budget;
  if (entryDate) normalized.entry_date = entryDate;
  if (features) normalized.features = features;
  if (flexibleEntry) normalized.flexible_entry = flexibleEntry;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

/** When the model omits role but preferences look like an active purchase search, default to buyer. */
function preferencesSuggestBuyerSearch(prefs: ClientPreferences | undefined): boolean {
  if (!prefs) {
    return false;
  }
  const hasBudget = prefs.budget !== undefined;
  if (!hasBudget) {
    return false;
  }
  const hasLocation = Boolean(prefs.areas?.length || prefs.city?.trim());
  const pt = prefs.property_type ?? "";
  const looksLikeSearchIntent =
    /חדרים|חדר\s|דירת|דירה\s|penthouse|פנטהאוז|סוג\s+נכס/i.test(pt);
  return hasLocation || looksLikeSearchIntent;
}

function normalizeInteractionPatches(value: unknown): ClientInteractionPatch[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const out: ClientInteractionPatch[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item as Record<string, unknown>;
    const summary =
      asNonEmptyString(rec.summary) ?? asNonEmptyString(rec.description) ?? asNonEmptyString(rec.note);
    if (!summary) {
      continue;
    }
    const property_address = asNonEmptyString(rec.property_address) ?? asNonEmptyString(rec.property);
    const kind =
      asNonEmptyString(rec.kind) ??
      asNonEmptyString(rec.type) ??
      asNonEmptyString(rec.interaction_type);
    const extraProps = asStringArray(rec.property_addresses);
    out.push({
      summary,
      ...(property_address ? { property_address } : {}),
      ...(extraProps ? { property_addresses: extraProps } : {}),
      ...(kind ? { kind } : {})
    });
  }
  return out.length > 0 ? out : undefined;
}

function normalizeClientAction(action: SupportedAction): CreateOrUpdateClientAction | null {
  if (action.type !== "create_or_update_client") {
    return null;
  }

  const name = asNonEmptyString(action.data.name);
  if (!name) {
    return null;
  }

  let role =
    action.data.role === "buyer" || action.data.role === "owner" || action.data.role === "unknown"
      ? action.data.role
      : undefined;

  const preferences = normalizePreferences(action.data.preferences);

  if (!role && preferencesSuggestBuyerSearch(preferences)) {
    role = "buyer";
  }
  const leadSource = asNonEmptyString(action.data.lead_source);
  const leadTemperature = normalizeLeadTemperature(action.data.lead_temperature);
  const interactions = normalizeInteractionPatches(action.data.interactions);

  return {
    type: "create_or_update_client",
    data: {
      name,
      ...(role ? { role } : {}),
      ...(leadSource ? { lead_source: leadSource } : {}),
      ...(leadTemperature ? { lead_temperature: leadTemperature } : {}),
      ...(preferences ? { preferences } : {}),
      ...(interactions ? { interactions } : {})
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

function propertyAddressFrom(data: Record<string, unknown>): string | undefined {
  return (
    asNonEmptyString(data.address) ??
    asNonEmptyString(data.full_address) ??
    asNonEmptyString(data.property_address)
  );
}

function normalizePropertyAction(action: SupportedAction): CreateOrUpdatePropertyAction | null {
  if (action.type !== "create_or_update_property") {
    return null;
  }

  const raw = action.data as Record<string, unknown>;
  const address = propertyAddressFrom(raw);
  if (!address) {
    return null;
  }

  const city = asNonEmptyString(raw.city);
  const rooms = asNumber(raw.rooms);
  const features = asStringArray(raw.features);
  const askingPrice = asNumber(raw.asking_price);
  const priceNote = asNonEmptyString(raw.price_note);
  const generalNotes = asNonEmptyString(raw.general_notes);
  const ownerClientName = asNonEmptyString(raw.owner_client_name);

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

/** Tasks like reminders/follow-ups need *some* timeframe (day or general slot); clock time stays optional. */
function taskLikelyNeedsDueWindow(title: string): boolean {
  return /תזכיר|תזכורת|להזכיר|להיזכר|פולואפ|פולו|לחזור|להתקשר|להשיב|לייעץ|פגישה|פגוש|קבע|זימון|נפגש|דבר עם|שיחה עם|להדבר/i.test(title);
}

export function validateParseResult(result: ParseMessageResult): ValidationResult {
  const validActions: SupportedAction[] = [];
  const rejectedActions: Array<{ actionType: string; reason: string }> = [];
  const clarifications = new Set<string>(result.clarification_questions);
  const missingInfo = new Set<string>(result.missing_info);

  for (const action of result.actions) {
    if (action.type === "create_or_update_client") {
      const normalized = normalizeClientAction(action);
      if (!normalized) {
        missingInfo.add("client_name");
        clarifications.add("מה השם המלא של הלקוח כדי שאוכל ליצור או לעדכן את כרטיס הלקוח?");
        rejectedActions.push({
          actionType: action.type,
          reason: "client name is required"
        });
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
        rejectedActions.push({
          actionType: action.type,
          reason: "task title is required"
        });
      } else if (!normalized.data.client_name?.trim()) {
        missingInfo.add("task_client_name");
        clarifications.add(
          "על איזה לקוח מדובר למשימה? צריך שם מלא כדי לשייך את המשימה לישות (כרטיס לקוח) במערכת."
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name is required"
        });
      } else if (!normalized.data.due_time && taskLikelyNeedsDueWindow(normalized.data.title)) {
        missingInfo.add("due_time");
        clarifications.add(
          "מתי תרצה לבצע את המשימה או לקבל תזכורת? מספיק יום או משבצת כללית (בוקר/ערב); שעה מדויקת לא חובה."
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "due_time required for scheduled tasks"
        });
      } else {
        validActions.push(normalized);
      }
      continue;
    }

    if (action.type === "create_or_update_property") {
      const normalized = normalizePropertyAction(action);
      if (!normalized) {
        missingInfo.add("property_address");
        clarifications.add(
          "מהי הכתובת המלאה של הנכס (רחוב ומספר ועיר, כפי שציינת בשיחה) כדי שאוכל לפתוח כרטיס נכס?"
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "property address is required"
        });
      } else {
        validActions.push(normalized);
      }
    }
  }

  return {
    validActions,
    rejectedActions,
    clarification_questions: Array.from(clarifications),
    missing_info: Array.from(missingInfo)
  };
}
