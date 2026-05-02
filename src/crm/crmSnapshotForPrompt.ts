import type { FakeClient, FakeProperty, FakeTask } from "./fakeCrmAdapter";

const MAX_CLIENT_ROWS = 80;
const MAX_TASK_ROWS = 80;
const MAX_PROPERTY_ROWS = 40;

/** Bounded CRM snapshot for parser grounding — SSOT is backend in-memory CRM only. */
export function formatCrmSnapshotForPrompt(state: {
  clients: FakeClient[];
  tasks: FakeTask[];
  properties?: FakeProperty[];
}): string {
  const lines: string[] = [];

  const clients = state.clients.slice(0, MAX_CLIENT_ROWS);

  // Build first-name collision map so the snapshot can warn the LLM about ambiguous references
  const firstNameCount: Record<string, string[]> = {};
  for (const c of clients) {
    const first = c.name.trim().split(/\s+/)[0];
    if (first) {
      if (!firstNameCount[first]) firstNameCount[first] = [];
      firstNameCount[first]!.push(c.name);
    }
  }

  lines.push(`לקוחות (${state.clients.length}${state.clients.length > MAX_CLIENT_ROWS ? `, מוצגים ${MAX_CLIENT_ROWS}` : ""}):`);
  if (clients.length === 0) {
    lines.push("(אין לקוחות במערכת)");
  }
  for (const c of clients) {
    const first = c.name.trim().split(/\s+/)[0] ?? "";
    const siblings = (firstNameCount[first] ?? []).filter((n) => n !== c.name);
    const dupeWarning =
      siblings.length > 0
        ? ` · ⚠️ שם פרטי כפול — גם «${siblings.join("», «")}» קיים; אם המשתמש אמר רק «${first}» אל תנחש, בקש הבהרה`
        : "";
    lines.push(`- שם מלא (מפתח במערכת): «${c.name}» · מזהה: ${c.id}${dupeWarning}`);
    if (c.role) {
      lines.push(`  תפקיד (פנימי): ${c.role}`);
    }
    if (c.lead_source) {
      lines.push(`  מקור ליד: ${c.lead_source}`);
    }
    if (c.lead_temperature) {
      lines.push(`  חום ליד (פנימי): ${c.lead_temperature}`);
    }
    if (c.preferences && Object.keys(c.preferences).length > 0) {
      lines.push(`  העדפות נוכחיות: ${JSON.stringify(c.preferences)}`);
    }
  }

  const tasks = state.tasks.slice(0, MAX_TASK_ROWS);
  lines.push("");
  lines.push(`משימות (${state.tasks.length}${state.tasks.length > MAX_TASK_ROWS ? `, מוצגות ${MAX_TASK_ROWS}` : ""}):`);
  if (tasks.length === 0) {
    lines.push("(אין משימות במערכת)");
  }
  for (const t of tasks) {
    const parts = [`כותרת: «${t.title}»`];
    if (t.client_name) {
      parts.push(`לקוח: «${t.client_name}»`);
    }
    if (t.due_time) {
      parts.push(`מתי: ${t.due_time}`);
    }
    lines.push(`- ${parts.join(" · ")}`);
  }

  const props = (state.properties ?? []).slice(0, MAX_PROPERTY_ROWS);
  lines.push("");
  lines.push(
    `נכסים (${(state.properties ?? []).length}${(state.properties ?? []).length > MAX_PROPERTY_ROWS ? `, מוצגים ${MAX_PROPERTY_ROWS}` : ""}):`
  );
  if (props.length === 0) {
    lines.push("(אין נכסים במערכת)");
  }
  for (const p of props) {
    const parts = [`כתובת: «${p.address}»`, `מזהה: ${p.id}`];
    if (p.city) {
      parts.push(`עיר: ${p.city}`);
    }
    if (p.rooms !== undefined) {
      parts.push(`חדרים: ${p.rooms}`);
    }
    if (p.asking_price !== undefined) {
      parts.push(`מחיר מבוקש: ${p.asking_price}`);
    }
    if (p.owner_client_name) {
      parts.push(`בעלים (שם לקוח): «${p.owner_client_name}»`);
    }
    lines.push(`- ${parts.join(" · ")}`);
  }

  return lines.join("\n");
}
