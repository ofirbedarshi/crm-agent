import type { FakeClient, FakeTask } from "./fakeCrmAdapter";

const MAX_CLIENT_ROWS = 80;
const MAX_TASK_ROWS = 80;

/** Bounded CRM snapshot for parser grounding — SSOT is backend in-memory CRM only. */
export function formatCrmSnapshotForPrompt(state: {
  clients: FakeClient[];
  tasks: FakeTask[];
}): string {
  const lines: string[] = [];

  const clients = state.clients.slice(0, MAX_CLIENT_ROWS);
  lines.push(`לקוחות (${state.clients.length}${state.clients.length > MAX_CLIENT_ROWS ? `, מוצגים ${MAX_CLIENT_ROWS}` : ""}):`);
  if (clients.length === 0) {
    lines.push("(אין לקוחות במערכת)");
  }
  for (const c of clients) {
    lines.push(`- שם מלא (מפתח במערכת): «${c.name}» · מזהה: ${c.id}`);
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

  return lines.join("\n");
}
