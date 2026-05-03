import type { ActionExecutionResult } from "../orchestrator/executeActions";
import type { ClientPreferences, SupportedAction } from "../types/parser";

function rolePhrase(role?: "buyer" | "owner" | "unknown"): string {
  if (role === "buyer") {
    return " כרוכש";
  }
  if (role === "owner") {
    return " כבעל נכס";
  }
  return "";
}

function joinWithVe(parts: string[]): string {
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  if (parts.length === 2) {
    return `${parts[0]} ו${parts[1]}`;
  }
  const head = parts.slice(0, -1).join(", ");
  return `${head} ו${parts[parts.length - 1]}`;
}

function preferencesPatchSummary(patch?: ClientPreferences): string[] {
  if (!patch) {
    return [];
  }

  const bits: string[] = [];

  if (patch.areas && patch.areas.length > 0) {
    bits.push(`אזורי חיפוש: ${joinWithVe(patch.areas)}`);
  } else if (patch.city) {
    bits.push(`עיר מועדפת: ${patch.city}`);
  }

  if (patch.budget !== undefined) {
    bits.push(`תקציב עד ${patch.budget.toLocaleString("he-IL")} ₪`);
  }

  if (patch.flexible_entry) {
    bits.push(`גמישות כניסה: ${patch.flexible_entry}`);
  }

  if (patch.features && patch.features.length > 0) {
    bits.push(`דרישות: ${joinWithVe(patch.features)}`);
  }

  if (patch.property_type) {
    bits.push(`סוג נכס: ${patch.property_type}`);
  }

  return bits;
}

function preferencesSnapshotSummary(prefs?: ClientPreferences): string[] {
  if (!prefs) {
    return [];
  }

  const bits: string[] = [];

  if (prefs.areas && prefs.areas.length > 0) {
    bits.push(`חיפוש באזורים ${joinWithVe(prefs.areas)}`);
  } else if (prefs.city) {
    bits.push(`חיפוש ב${prefs.city}`);
  }

  if (prefs.budget !== undefined) {
    bits.push(`תקציב עד ${prefs.budget.toLocaleString("he-IL")} ₪`);
  }

  if (prefs.flexible_entry) {
    bits.push(`גמישות כניסה: ${prefs.flexible_entry}`);
  }

  if (prefs.features && prefs.features.length > 0) {
    bits.push(`דרישות: ${joinWithVe(prefs.features)}`);
  }

  return bits;
}

function touchedSnapshotSummary(
  patch: ClientPreferences | undefined,
  snapshot: ClientPreferences | undefined
): string[] {
  if (!patch || !snapshot) {
    return [];
  }

  const bits: string[] = [];

  if (patch.areas || patch.city) {
    if (snapshot.areas && snapshot.areas.length > 0) {
      bits.push(`אזורי חיפוש: ${joinWithVe(snapshot.areas)}`);
    } else if (snapshot.city) {
      bits.push(`אזור חיפוש: ${snapshot.city}`);
    }
  }

  if (patch.budget !== undefined && snapshot.budget !== undefined) {
    bits.push(`תקציב עד ${snapshot.budget.toLocaleString("he-IL")} ₪`);
  }
  if (patch.flexible_entry && snapshot.flexible_entry) {
    bits.push(`גמישות כניסה: ${snapshot.flexible_entry}`);
  }
  if (patch.features && patch.features.length > 0 && snapshot.features && snapshot.features.length > 0) {
    bits.push(`דרישות: ${joinWithVe(snapshot.features)}`);
  }
  if (patch.property_type && snapshot.property_type) {
    bits.push(`סוג נכס: ${snapshot.property_type}`);
  }

  return bits;
}

const SUB = "  – ";

function formatClientSentence(
  action: Extract<SupportedAction, { type: "create_or_update_client" }>,
  execution: ActionExecutionResult | undefined
): string {
  const name = action.data.name;
  const roleText = rolePhrase(action.data.role);

  const operation =
    execution?.clientOperation ??
    /* fallback if execution metadata missing */ ("updated" as const);

  const verb =
    operation === "created"
      ? `יצרתי כרטיס לקוח עבור ${name}${roleText}`
      : `עדכנתי את פרטי הלקוח ${name}${roleText}`;

  const patchBits = preferencesPatchSummary(action.data.preferences);
  const snapshotPrefs =
    execution?.clientSnapshot?.preferences ?? action.data.preferences;
  const snapshotBits =
    operation === "updated"
      ? touchedSnapshotSummary(action.data.preferences, snapshotPrefs)
      : preferencesSnapshotSummary(snapshotPrefs);

  const lines: string[] = [verb];

  if (action.data.interactions && action.data.interactions.length > 0) {
    const n = action.data.interactions.length;
    const label = n === 1 ? "סיכום ביקור" : `סיכום ביקורים (${n})`;
    const body = action.data.interactions
      .map((i) => {
        const tag = i.kind?.trim() ? `[${i.kind.trim()}] ` : "";
        return `${tag}${i.summary}`.trim();
      })
      .join(" · ");
    lines.push(`${SUB}${label}: ${body}`);
  }

  if (patchBits.length > 0 && operation === "updated") {
    lines.push(`${SUB}עדכון הפעם: ${patchBits.join("; ")}`);
  }

  if (snapshotBits.length > 0) {
    lines.push(`${SUB}פרטים בכרטיס: ${snapshotBits.join("; ")}`);
  }

  const leadParts: string[] = [];
  if (action.data.lead_source) {
    leadParts.push(`מקור: ${action.data.lead_source}`);
  }
  if (action.data.lead_temperature && action.data.lead_temperature !== "unknown") {
    const heat =
      action.data.lead_temperature === "hot"
        ? "חם"
        : action.data.lead_temperature === "warm"
          ? "חמים"
          : action.data.lead_temperature === "cold"
            ? "קר"
            : "";
    if (heat) {
      leadParts.push(`רמת עניין: ${heat}`);
    }
  }

  if (leadParts.length > 0 && operation === "created") {
    lines.push(`${SUB}${leadParts.join(" · ")}`);
  }

  return lines.filter((line) => line.trim().length > 0).join("\n").trim();
}

function formatTaskSentence(action: Extract<SupportedAction, { type: "create_task" }>): string {
  const taskFor = action.data.client_name ? ` עבור ${action.data.client_name}` : "";
  const due = action.data.due_time ? ` ל${action.data.due_time}` : "";
  return `יצרתי משימה${taskFor}${due}: ${action.data.title}`;
}

function formatPropertySentence(action: Extract<SupportedAction, { type: "create_or_update_property" }>): string {
  const owner = action.data.owner_client_name;
  const intro = owner
    ? `יצרתי כרטיס נכס עבור ${owner} בכתובת ${action.data.address}`
    : `יצרתי כרטיס נכס בכתובת ${action.data.address}`;
  const detailBits: string[] = [];
  if (action.data.city) {
    detailBits.push(action.data.city);
  }
  if (action.data.rooms !== undefined) {
    detailBits.push(`${action.data.rooms} חדרים`);
  }
  if (action.data.features && action.data.features.length > 0) {
    detailBits.push(`תכונות: ${joinWithVe(action.data.features)}`);
  }
  if (action.data.asking_price !== undefined) {
    detailBits.push(`מחיר מבוקש כ-${action.data.asking_price.toLocaleString("he-IL")} ₪`);
  }
  if (action.data.price_note) {
    detailBits.push(`הערת מחיר: ${action.data.price_note}`);
  }
  if (action.data.general_notes) {
    detailBits.push(`הערות: ${action.data.general_notes}`);
  }
  if (detailBits.length === 0) {
    return intro;
  }
  return `${intro}\n${SUB}${detailBits.join(" · ")}`;
}

function withActionBullet(block: string): string {
  const parts = block.split("\n");
  if (parts.length === 0) {
    return block;
  }
  parts[0] = `• ${parts[0]}`;
  return parts.join("\n");
}

export function formatExecutedReply(actions: SupportedAction[], results: ActionExecutionResult[]): string {
  const blocks = actions.map((action, index) => {
    const execution = results[index];
    let inner: string;
    if (action.type === "create_task") {
      inner = formatTaskSentence(action);
    } else if (action.type === "create_or_update_property") {
      inner = formatPropertySentence(action);
    } else {
      inner = formatClientSentence(action, execution);
    }
    return withActionBullet(inner);
  });

  return blocks.join("\n\n");
}
