// server/createApp.ts
import { config as loadDotenv } from "dotenv";
import cors from "cors";
import express from "express";
import fs2 from "node:fs";
import os from "node:os";
import multer from "multer";

// src/chat/chatTranscriptStore.ts
import { randomUUID } from "node:crypto";
var messages = [];
var internalSegmentId = randomUUID();
function getChatTranscriptSnapshot() {
  return [...messages];
}
function appendChatTurns(...turns) {
  messages.push(...turns);
}
function clearChatTranscriptAndRotateSegment() {
  messages.length = 0;
  internalSegmentId = randomUUID();
}
function resetChatTranscript() {
  clearChatTranscriptAndRotateSegment();
}
function getInternalChatSegmentId() {
  return internalSegmentId;
}

// src/pipeline/buildPipelineInput.ts
function historyToText(history) {
  return history.map((item) => `${item.role}: ${item.text}`).join("\n");
}
function buildPipelineInput(message, history) {
  const contextText = historyToText(history);
  if (!contextText) {
    return message;
  }
  return `\u05D4\u05E7\u05E9\u05E8 \u05E9\u05D9\u05D7\u05D4 \u05E7\u05D5\u05D3\u05DD:
${contextText}

\u05D4\u05D5\u05D3\u05E2\u05D4 \u05D7\u05D3\u05E9\u05D4:
${message}`;
}

// src/crm/crmSnapshotForPrompt.ts
var MAX_CLIENT_ROWS = 80;
var MAX_TASK_ROWS = 80;
var MAX_PROPERTY_ROWS = 40;
function formatCrmSnapshotForPrompt(state) {
  const lines = [];
  const clients3 = state.clients.slice(0, MAX_CLIENT_ROWS);
  const firstNameCount = {};
  for (const c of clients3) {
    const first = c.name.trim().split(/\s+/)[0];
    if (first) {
      if (!firstNameCount[first]) firstNameCount[first] = [];
      firstNameCount[first].push(c.name);
    }
  }
  lines.push(`\u05DC\u05E7\u05D5\u05D7\u05D5\u05EA (${state.clients.length}${state.clients.length > MAX_CLIENT_ROWS ? `, \u05DE\u05D5\u05E6\u05D2\u05D9\u05DD ${MAX_CLIENT_ROWS}` : ""}):`);
  if (clients3.length === 0) {
    lines.push("(\u05D0\u05D9\u05DF \u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA)");
  }
  for (const c of clients3) {
    const first = c.name.trim().split(/\s+/)[0] ?? "";
    const siblings = (firstNameCount[first] ?? []).filter((n) => n !== c.name);
    const dupeWarning = siblings.length > 0 ? ` \xB7 \u26A0\uFE0F \u05E9\u05DD \u05E4\u05E8\u05D8\u05D9 \u05DB\u05E4\u05D5\u05DC \u2014 \u05D2\u05DD \xAB${siblings.join("\xBB, \xAB")}\xBB \u05E7\u05D9\u05D9\u05DD; \u05D0\u05DD \u05D4\u05DE\u05E9\u05EA\u05DE\u05E9 \u05D0\u05DE\u05E8 \u05E8\u05E7 \xAB${first}\xBB \u05D0\u05DC \u05EA\u05E0\u05D7\u05E9, \u05D1\u05E7\u05E9 \u05D4\u05D1\u05D4\u05E8\u05D4` : "";
    lines.push(`- \u05E9\u05DD \u05DE\u05DC\u05D0 (\u05DE\u05E4\u05EA\u05D7 \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA): \xAB${c.name}\xBB \xB7 \u05DE\u05D6\u05D4\u05D4: ${c.id}${dupeWarning}`);
    if (c.role) {
      lines.push(`  \u05EA\u05E4\u05E7\u05D9\u05D3 (\u05E4\u05E0\u05D9\u05DE\u05D9): ${c.role}`);
    }
    if (c.lead_source) {
      lines.push(`  \u05DE\u05E7\u05D5\u05E8 \u05DC\u05D9\u05D3: ${c.lead_source}`);
    }
    if (c.lead_temperature) {
      lines.push(`  \u05D7\u05D5\u05DD \u05DC\u05D9\u05D3 (\u05E4\u05E0\u05D9\u05DE\u05D9): ${c.lead_temperature}`);
    }
    if (c.preferences && Object.keys(c.preferences).length > 0) {
      lines.push(`  \u05D4\u05E2\u05D3\u05E4\u05D5\u05EA \u05E0\u05D5\u05DB\u05D7\u05D9\u05D5\u05EA: ${JSON.stringify(c.preferences)}`);
    }
  }
  const tasks2 = state.tasks.slice(0, MAX_TASK_ROWS);
  lines.push("");
  lines.push(`\u05DE\u05E9\u05D9\u05DE\u05D5\u05EA (${state.tasks.length}${state.tasks.length > MAX_TASK_ROWS ? `, \u05DE\u05D5\u05E6\u05D2\u05D5\u05EA ${MAX_TASK_ROWS}` : ""}):`);
  if (tasks2.length === 0) {
    lines.push("(\u05D0\u05D9\u05DF \u05DE\u05E9\u05D9\u05DE\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA)");
  }
  for (const t of tasks2) {
    const parts = [`\u05DB\u05D5\u05EA\u05E8\u05EA: \xAB${t.title}\xBB`];
    if (t.client_name) {
      parts.push(`\u05DC\u05E7\u05D5\u05D7: \xAB${t.client_name}\xBB`);
    }
    if (t.due_time) {
      parts.push(`\u05DE\u05EA\u05D9: ${t.due_time}`);
    }
    lines.push(`- ${parts.join(" \xB7 ")}`);
  }
  const props = (state.properties ?? []).slice(0, MAX_PROPERTY_ROWS);
  lines.push("");
  lines.push(
    `\u05E0\u05DB\u05E1\u05D9\u05DD (${(state.properties ?? []).length}${(state.properties ?? []).length > MAX_PROPERTY_ROWS ? `, \u05DE\u05D5\u05E6\u05D2\u05D9\u05DD ${MAX_PROPERTY_ROWS}` : ""}):`
  );
  if (props.length === 0) {
    lines.push("(\u05D0\u05D9\u05DF \u05E0\u05DB\u05E1\u05D9\u05DD \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA)");
  }
  for (const p of props) {
    const parts = [`\u05DB\u05EA\u05D5\u05D1\u05EA: \xAB${p.address}\xBB`, `\u05DE\u05D6\u05D4\u05D4: ${p.id}`];
    if (p.city) {
      parts.push(`\u05E2\u05D9\u05E8: ${p.city}`);
    }
    if (p.rooms !== void 0) {
      parts.push(`\u05D7\u05D3\u05E8\u05D9\u05DD: ${p.rooms}`);
    }
    if (p.asking_price !== void 0) {
      parts.push(`\u05DE\u05D7\u05D9\u05E8 \u05DE\u05D1\u05D5\u05E7\u05E9: ${p.asking_price}`);
    }
    if (p.owner_client_name) {
      parts.push(`\u05D1\u05E2\u05DC\u05D9\u05DD (\u05E9\u05DD \u05DC\u05E7\u05D5\u05D7): \xAB${p.owner_client_name}\xBB`);
    }
    lines.push(`- ${parts.join(" \xB7 ")}`);
  }
  return lines.join("\n");
}

// src/crm/fakeCrmAdapter.ts
import { randomUUID as randomUUID2 } from "node:crypto";

// src/crm/mergeClientPreferences.ts
function mergeClientPreferences(existing, patch) {
  if (!existing && !patch) {
    return void 0;
  }
  if (!existing) {
    return patch;
  }
  if (!patch) {
    return existing;
  }
  const merged = {
    ...existing,
    ...patch
  };
  if (patch.areas === void 0) {
    merged.areas = existing.areas;
  }
  if (patch.features === void 0) {
    merged.features = existing.features;
  }
  if (patch.city === void 0) {
    merged.city = existing.city;
  }
  if (patch.property_type === void 0) {
    merged.property_type = existing.property_type;
  }
  if (patch.budget === void 0) {
    merged.budget = existing.budget;
  }
  if (patch.entry_date === void 0) {
    merged.entry_date = existing.entry_date;
  }
  if (patch.flexible_entry === void 0) {
    merged.flexible_entry = existing.flexible_entry;
  }
  return merged;
}

// src/crm/fakeCrmAdapter.ts
var clients = /* @__PURE__ */ new Map();
var tasks = [];
var properties = [];
var activityLog = [];
var clientCounter = 1;
var taskCounter = 1;
var propertyCounter = 1;
function formatActivityTime() {
  return (/* @__PURE__ */ new Date()).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
function appendActivity(description) {
  activityLog.unshift({
    id: randomUUID2(),
    description,
    time: formatActivityTime()
  });
}
function normalizePropertyAddress(addr) {
  return addr.trim().replace(/\s+/g, " ");
}
function mergePropertyNote(prev, next) {
  const n = next?.trim();
  const p = prev?.trim();
  if (!n) {
    return p;
  }
  if (!p) {
    return n;
  }
  if (p.includes(n)) {
    return p;
  }
  return `${p}
${n}`;
}
function appendClientInteractionRecords(existing, patches) {
  if (!patches?.length) {
    return existing;
  }
  const base = existing ?? [];
  const added = patches.map((p) => ({
    id: randomUUID2(),
    recorded_at: formatActivityTime(),
    summary: p.summary.trim(),
    ...p.property_address?.trim() ? { property_address: p.property_address.trim() } : {},
    ...p.property_addresses && p.property_addresses.length > 0 ? { property_addresses: [...p.property_addresses] } : {},
    ...p.kind?.trim() ? { kind: p.kind.trim() } : {}
  }));
  return [...base, ...added];
}
function nextClientId() {
  const id = `client_${String(clientCounter).padStart(4, "0")}`;
  clientCounter += 1;
  return id;
}
function nextTaskId() {
  const id = `task_${String(taskCounter).padStart(4, "0")}`;
  taskCounter += 1;
  return id;
}
function nextPropertyId() {
  const id = `property_${String(propertyCounter).padStart(4, "0")}`;
  propertyCounter += 1;
  return id;
}
function resetFakeCrm() {
  clients.clear();
  tasks.length = 0;
  properties.length = 0;
  activityLog.length = 0;
  clientCounter = 1;
  taskCounter = 1;
  propertyCounter = 1;
}
function createOrUpdateClient(data) {
  const existing = clients.get(data.name);
  const mergedInteractions = appendClientInteractionRecords(existing?.interactions, data.interactions);
  if (existing) {
    const updated = {
      ...existing,
      role: data.role ?? existing.role,
      lead_source: data.lead_source ?? existing.lead_source,
      lead_temperature: data.lead_temperature ?? existing.lead_temperature,
      preferences: mergeClientPreferences(existing.preferences, data.preferences),
      ...mergedInteractions !== void 0 ? { interactions: mergedInteractions } : {}
    };
    clients.set(data.name, updated);
    appendActivity(`\u05E2\u05D5\u05D3\u05DB\u05DF \u05DC\u05E7\u05D5\u05D7: ${data.name}`);
    if (data.interactions?.length) {
      appendActivity(`\u05E0\u05D5\u05E1\u05E4\u05D4 \u05D0\u05D9\u05E0\u05D8\u05E8\u05E7\u05E6\u05D9\u05D4 \u05DC\u05DC\u05E7\u05D5\u05D7 ${data.name}`);
    }
    return { client: updated, operation: "updated" };
  }
  const created = {
    id: nextClientId(),
    name: data.name,
    ...data.role ? { role: data.role } : {},
    ...data.lead_source ? { lead_source: data.lead_source } : {},
    ...data.lead_temperature ? { lead_temperature: data.lead_temperature } : {},
    ...data.preferences ? { preferences: data.preferences } : {},
    ...mergedInteractions !== void 0 ? { interactions: mergedInteractions } : {}
  };
  clients.set(data.name, created);
  appendActivity(`\u05E0\u05D5\u05E6\u05E8 \u05DC\u05E7\u05D5\u05D7 \u05D7\u05D3\u05E9: ${data.name}`);
  if (data.interactions?.length) {
    appendActivity(`\u05E0\u05D5\u05E1\u05E4\u05D4 \u05D0\u05D9\u05E0\u05D8\u05E8\u05E7\u05E6\u05D9\u05D4 \u05DC\u05DC\u05E7\u05D5\u05D7 ${data.name}`);
  }
  return { client: created, operation: "created" };
}
function createTask(data) {
  const task = {
    id: nextTaskId(),
    title: data.title,
    ...data.due_time ? { due_time: data.due_time } : {},
    ...data.client_name ? { client_name: data.client_name } : {}
  };
  tasks.push(task);
  const clientPart = data.client_name ? ` \u05E2\u05D1\u05D5\u05E8 ${data.client_name}` : "";
  const duePart = data.due_time ? ` (${data.due_time})` : "";
  appendActivity(`\u05E0\u05D5\u05E6\u05E8\u05D4 \u05DE\u05E9\u05D9\u05DE\u05D4${clientPart}: ${data.title}${duePart}`);
  return task;
}
function createOrUpdateProperty(data) {
  const addrNorm = normalizePropertyAddress(data.address);
  const existingIdx = properties.findIndex((p) => normalizePropertyAddress(p.address) === addrNorm);
  if (existingIdx >= 0) {
    const prev = properties[existingIdx];
    const merged = {
      ...prev,
      ...data.city?.trim() ? { city: data.city.trim() } : {},
      ...data.rooms !== void 0 ? { rooms: data.rooms } : {},
      ...data.features && data.features.length > 0 ? { features: [...data.features] } : {},
      ...data.asking_price !== void 0 ? { asking_price: data.asking_price } : {},
      price_note: mergePropertyNote(prev.price_note, data.price_note),
      general_notes: mergePropertyNote(prev.general_notes, data.general_notes),
      ...data.owner_client_name?.trim() ? { owner_client_name: data.owner_client_name.trim() } : {}
    };
    properties[existingIdx] = merged;
    const ownerPart2 = data.owner_client_name ? ` \xB7 \u05D1\u05E2\u05DC\u05D9\u05DD: ${data.owner_client_name}` : "";
    appendActivity(`\u05E2\u05D5\u05D3\u05DB\u05DF \u05E0\u05DB\u05E1: ${data.address.trim()}${ownerPart2}`);
    return merged;
  }
  const prop = {
    id: nextPropertyId(),
    address: data.address.trim(),
    ...data.city ? { city: data.city.trim() } : {},
    ...data.rooms !== void 0 ? { rooms: data.rooms } : {},
    ...data.features && data.features.length > 0 ? { features: [...data.features] } : {},
    ...data.asking_price !== void 0 ? { asking_price: data.asking_price } : {},
    ...data.price_note ? { price_note: data.price_note } : {},
    ...data.general_notes ? { general_notes: data.general_notes } : {},
    ...data.owner_client_name ? { owner_client_name: data.owner_client_name.trim() } : {}
  };
  properties.push(prop);
  const ownerPart = data.owner_client_name ? ` \xB7 \u05D1\u05E2\u05DC\u05D9\u05DD: ${data.owner_client_name}` : "";
  appendActivity(`\u05E0\u05D5\u05E6\u05E8 \u05E0\u05DB\u05E1: ${data.address}${ownerPart}`);
  return prop;
}
function getFakeCrmState() {
  return {
    clients: Array.from(clients.values()),
    tasks: [...tasks],
    properties: properties.map((p) => ({ ...p, ...p.features ? { features: [...p.features] } : {} })),
    activityLog: [...activityLog]
  };
}

// src/parser/systemPrompt.ts
var PARSER_SYSTEM_PROMPT = `
You are a strict CRM parser for Israeli real estate agents.

Your task:
- Convert a single free-text user message (often Hebrew conversational language) into JSON only.

CRM snapshot grounding (critical):
- Sometimes the prompt includes a section titled "### \u05DE\u05E6\u05D1 CRM \u05E0\u05D5\u05DB\u05D7\u05D9 (\u05DE\u05E7\u05D5\u05E8 \u05D0\u05DE\u05EA)" listing existing clients and tasks loaded from the backend in-memory CRM (authoritative facts).
- Treat that snapshot as truth for who already exists and what preferences are already stored when chat history is empty or incomplete.
- When updating preferences for an existing client, output preference lists (especially preferences.areas and preferences.features) as the **full intended state**, incorporating existing values from the snapshot unless the user explicitly removes/replaces them.
- For action fields name / client_name / owner_client_name: output EXACTLY what the user said \u2014 no more, no less. Do NOT look up, expand, or substitute names from this snapshot. The system resolves names against the CRM automatically after parsing.

- Output must be a valid JSON object with exactly these top-level keys:
  - "actions": array
  - "missing_info": array
  - "clarification_questions": array

Action policy:
- Allowed action types ONLY:
  1) "create_or_update_client"
  2) "create_task"
  3) "create_or_update_property"
- Ignore all other action categories.
- For each action, use this shape:
  { "type": "<allowed_type>", "data": { ... } }
- Be conservative: when required data is missing, do NOT create an action.

Required action schemas:
1) create_or_update_client
{
  "type": "create_or_update_client",
  "data": {
    "name": string,                   // required
    "role"?: "buyer" | "owner" | "unknown",
    "lead_source"?: string,
    "lead_temperature"?: "hot" | "warm" | "cold" | "unknown",
    "preferences"?: {
      "city"?: string,
      "areas"?: string[],
      "property_type"?: string,
      "budget"?: number,
      "entry_date"?: string,
      "features"?: string[],
      "flexible_entry"?: string
    },
    "interactions"?: Array<{
      "summary": string,
      "property_address"?: string,
      "property_addresses"?: string[],
      "kind"?: string,
      "type"?: string,
      "interaction_type"?: string
    }>
  }
}

2) create_task
{
  "type": "create_task",
  "data": {
    "title": string,                  // required
    "due_time"?: string,              // required for reminders/follow-ups: any clear timeframe is enough
    "client_name": string             // required for task creation
  }
}

3) create_or_update_property  // listing / \u05E0\u05DB\u05E1 \u05DC\u05DE\u05DB\u05D9\u05E8\u05D4 \u2014 \u05E4\u05E8\u05D8\u05D9\u05DD \u05E4\u05D9\u05D6\u05D9\u05D9\u05DD \u05D5\u05DE\u05D7\u05D9\u05E8, \u05DC\u05D0 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05DC\u05E7\u05D5\u05D7
{
  "type": "create_or_update_property",
  "data": {
    "address": string,                // required \u2014 \u05E8\u05D7\u05D5\u05D1 \u05D5\u05DE\u05E1\u05E4\u05E8 \u05D1\u05D9\u05EA (\u05DB\u05EA\u05D5\u05D1\u05EA \u05DE\u05DC\u05D0\u05D4 \u05DE\u05D5\u05DE\u05DC\u05E6\u05EA)
    "city"?: string,
    "rooms"?: number,                 // e.g. 3.5 for \u05E9\u05DC\u05D5\u05E9 \u05D5\u05D7\u05E6\u05D9 \u05D7\u05D3\u05E8\u05D9\u05DD
    "features"?: string[],            // \u05DE\u05E2\u05DC\u05D9\u05EA, \u05D7\u05E0\u05D9\u05D4, \u05E7\u05D5\u05DE\u05D4, \u05D8\u05D0\u05D1\u05D5, \u05D5\u05DB\u05D5\u05F3 \u2014 \u05E8\u05E9\u05D9\u05DE\u05D4 \u05D7\u05D5\u05E4\u05E9\u05D9\u05EA
    "asking_price"?: number,          // \u05DE\u05D7\u05D9\u05E8 \u05DE\u05D1\u05D5\u05E7\u05E9 \u05D1\u05E9\u05E7\u05DC\u05D9\u05DD (\u05DE\u05E1\u05E4\u05E8)
    "price_note"?: string,            // e.g. \u05E6\u05D5\u05E8\u05DA \u05DC\u05D0\u05DE\u05EA \u05DE\u05D5\u05DC \u05E9\u05D5\u05E7, \u05D8\u05E8\u05DD \u05E1\u05D5\u05E4\u05D9
    "general_notes"?: string,         // \u05D4\u05E7\u05E9\u05E8 \u05DB\u05DC\u05DC\u05D9 (\u05D1\u05DC\u05E2\u05D3\u05D9\u05D5\u05EA, \u05E9\u05D9\u05D7\u05D4 \u05E2\u05DD \u05D4\u05E1\u05D5\u05DB\u05DF\u2026)
    "owner_client_name"?: string       // when the seller/owner is known \u2014 full name matching that seller client card; omit when unknown (buyer-side visit notes only is allowed in the demo)
  }
}

Entity linkage (critical \u2014 CRM demo rules):
- Every create_task MUST include client_name: use the EXACT name the user stated for that person.
  - If the user said a full name (\u22652 words): write that full name exactly \u2014 do NOT substitute a different CRM name. "\u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9" \u2192 "\u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9", never "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF".
  - If the user said only a first name (1 word): write only that first name \u2014 do NOT expand to a CRM full name. "\u05D9\u05D5\u05E1\u05D9" \u2192 "\u05D9\u05D5\u05E1\u05D9", never "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" or "\u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9".
- When the seller/owner is known: create_or_update_property MUST include owner_client_name identical to that seller client card name.
- When the seller/owner is NOT known (e.g. showing feedback without the seller named): emit create_or_update_property with address + notes/price_note from the visit, and omit owner_client_name \u2014 do not invent an owner.
- When opening both a seller client card and their listing + tasks in one message: emit actions in order \u2014 create_or_update_client (seller, role owner) FIRST, then create_or_update_property (with owner_client_name), then create_task(s) with client_name.
- If you cannot confidently tie a task to a named client from the text, use clarification_questions instead of partially-filled actions.

Data extraction rules:
- Do not invent critical facts.
- If required or important information is missing or ambiguous, add clear items to "missing_info" and ask Hebrew follow-up questions in "clarification_questions".
- Keep extracted data conservative and grounded in the user text.
- If multiple areas/cities are mentioned (e.g. "\u05D2\u05D1\u05E2\u05EA\u05D9\u05D9\u05DD \u05D0\u05D5 \u05E8\u05DE\u05EA \u05D2\u05DF"), put all of them in preferences.areas.
- If only one city is mentioned, you may put it in preferences.city (and optionally in preferences.areas with one value).
- Put amenity preferences like \u05DE\u05E2\u05DC\u05D9\u05EA/\u05D7\u05E0\u05D9\u05D4/\u05DE\u05E8\u05E4\u05E1\u05EA under preferences.features as an array (for buyers).
- After visits/calls/meetings, append concise rows under create_or_update_client.data.interactions (each entry needs summary text; tie to property_address when the touch references a concrete listing).
- Optionally set interactions[].kind (aliases: type, interaction_type) to the touch modality \u2014 e.g. \u05E4\u05D2\u05D9\u05E9\u05D4 \u05E4\u05E0\u05D9\u05DD \u05D0\u05DC \u05E4\u05E0\u05D9\u05DD, \u05E9\u05D9\u05D7\u05EA \u05D8\u05DC\u05E4\u05D5\u05DF, \u05D4\u05D5\u05D3\u05E2\u05D4.
- When several listings appear in one touch, list extras under interactions[].property_addresses (still use property_address for the primary listing when there is one).
- Put entry flexibility expressions like "\u05D2\u05DE\u05D9\u05E9 \u05D1\u05DB\u05E0\u05D9\u05E1\u05D4 \u05E2\u05D3 \u05D7\u05E6\u05D9 \u05E9\u05E0\u05D4" in preferences.flexible_entry (for buyers).
- Seller / \u05DE\u05D5\u05DB\u05E8 (role "owner"): put ONLY the asking price under preferences.budget (sale expectation in \u20AA). Do NOT stuff listing facts (rooms, elevator, parking, address) into client preferences \u2014 those belong exclusively in create_or_update_property for that listing.
- When the user describes a concrete property for sale (\u05DB\u05EA\u05D5\u05D1\u05EA, \u05D7\u05D3\u05E8\u05D9\u05DD, \u05E7\u05D5\u05DE\u05D4, \u05DE\u05E2\u05DC\u05D9\u05EA, \u05D7\u05E0\u05D9\u05D4, \u05D8\u05D0\u05D1\u05D5, \u05DE\u05D7\u05D9\u05E8 \u05DE\u05D1\u05D5\u05E7\u05E9), emit create_or_update_property with address + rooms + features + asking_price + notes as appropriate; link owner_client_name to the seller when known.
- Map lead maturity terms:
  - "\u05DC\u05D9\u05D3 \u05D7\u05DD", "\u05E0\u05E9\u05DE\u05E2 \u05E8\u05E6\u05D9\u05E0\u05D9 \u05DE\u05D0\u05D5\u05D3", "\u05DE\u05D5\u05DB\u05DF \u05DC\u05D4\u05EA\u05E7\u05D3\u05DD" -> "hot"
  - partial interest -> "warm"
  - weak/low readiness -> "cold"
- If lead source is explicitly mentioned (e.g. "\u05DE\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7"), put it in lead_source.
- If a client name is missing, do not create create_or_update_client.
- If a task title cannot be formed, do not create create_task.
- If task target client_name is missing or indirect, do not create create_task.
- If the message includes multiple explicit commitments/actions, create one create_task action per commitment.
- If different due times are tied to different commitments (for example "\u05D4\u05D9\u05D5\u05DD \u05D1\u05E2\u05E8\u05D1" and "\u05DE\u05D7\u05E8 \u05D1-11"), split into separate tasks with matching due_time.
- Task time policy (critical):
  - For reminders, follow-ups, callbacks, meetings, or "call back" style tasks, include a due_time whenever the user gave *any* timeframe: a day ("\u05D9\u05D5\u05DD \u05E9\u05E0\u05D9"), a date, a relative window ("\u05DE\u05D7\u05E8", "\u05D1\u05E9\u05D1\u05D5\u05E2 \u05D4\u05D1\u05D0"), or a coarse part of day ("\u05D1\u05D5\u05E7\u05E8", "\u05D1\u05E2\u05E8\u05D1", "\u05D1\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD").
  - Exact clock time is optional. Do NOT insist the user specifies an exact hour or minute.
  - If the user asks for a reminder/follow-up but gives no timeframe at all, do not create create_task; ask in clarification_questions for the day or general slot (morning/evening), explicitly saying exact time is optional.
- Normalize all task text into "title" only.
- Buyer search wishes \u2192 data.preferences on create_or_update_client. Seller listing facts \u2192 create_or_update_property only (except asking price on the seller client card via preferences.budget).
- If intent exists but details are incomplete, prefer clarification_questions over partial actions.
- actions = [] is acceptable when required data is missing.

Post-showing updates (critical):
- If the agent describes a visit/showing at a concrete address (phrases like "\u05D4\u05D9\u05D9\u05EA\u05D9 \u2026 \u05D1\u05D3\u05D9\u05E8\u05D4", "\u05D1\u05D9\u05E7\u05D5\u05E8 \u05D1\u05D3\u05D9\u05E8\u05D4") and names a buyer, emit create_or_update_client for that person: if they appear in the CRM snapshot, update that row; if the snapshot is empty or they are new, create them with role "buyer" and lead_temperature matching readiness (for hesitation such as "\u05DE\u05EA\u05E2\u05E0\u05D9\u05D9\u05DF \u05D0\u05D1\u05DC \u05DE\u05EA\u05DC\u05D1\u05D8" use "warm").
- Include data.interactions with at least one object: interactions[].summary must capture the positives, objections, and hesitation the user quoted; include specific money figures when the user gives them (for example keep "\u05DB\u05BE150 \u05D0\u05DC\u05E3" / "150 \u05D0\u05DC\u05E3 \u20AA" in the summary text \u2014 do not drop the number).
- Set interactions[].property_address to the street listing from the message (e.g. "\u05D4\u05D9\u05E8\u05D3\u05DF 12") when it is identifiable.
- Showing feedback (likes, objections, price reactions, hesitation) belongs ONLY in create_or_update_client.interactions[].summary \u2014 do NOT duplicate visit narrative into create_or_update_property price_note or general_notes unless the user explicitly states new factual listing attributes (rooms, asking price, structural defects as listing facts). Prefer omitting create_or_update_property for buyer-only visits when the CRM snapshot is empty; linkage may still create a bare listing row without notes.
- If the snapshot already contains a property row for that address (same street + number), you MAY emit create_or_update_property with only address + owner_client_name from the snapshot for linkage \u2014 still no visit prose on the listing card unless the user gave distinct listing facts as above.
- For follow-ups ("\u05DC\u05D7\u05D6\u05D5\u05E8 \u05D0\u05DC\u05D9\u05D5 \u2026 \u05DE\u05D7\u05E8 \u05D1\u05E2\u05E8\u05D1"), prefer one create_task; title should name that buyer; client_name must match the buyer client name used in create_or_update_client in the same response.

Clarification question quality rules (critical):
- Questions must be specific, contextual, and actionable.
- Every clarification question must include BOTH:
  1) The missing information needed to proceed.
  2) The user's intent from the original input (for example: call back, follow-up, schedule, update client).
- Do not ask generic questions like "\u05DE\u05D4 \u05E9\u05DD \u05D4\u05DC\u05E7\u05D5\u05D7?" or "\u05D0\u05D9\u05D6\u05D5 \u05E4\u05E2\u05D5\u05DC\u05D4 \u05EA\u05E8\u05E6\u05D4 \u05E9\u05D0\u05D1\u05E6\u05E2?".
- Prefer intent-tied wording such as:
  - "\u05E2\u05DD \u05DE\u05D9 \u05DC\u05D3\u05D1\u05E8 \u05DE\u05D7\u05E8 \u05DC\u05D2\u05D1\u05D9 \u05D4\u05D4\u05E6\u05E2\u05D4?"
  - "\u05DE\u05D4 \u05D4\u05E9\u05DD \u05E9\u05DC \u05D4\u05DC\u05E7\u05D5\u05D7\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05E7\u05D1\u05E2 \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA \u05DC\u05D7\u05D6\u05D5\u05E8 \u05D0\u05DC\u05D9\u05D4 \u05D1\u05E2\u05D5\u05D3 \u05E9\u05D1\u05D5\u05E2?"
  - "\u05E2\u05DC \u05D0\u05D9\u05D6\u05D4 \u05DC\u05E7\u05D5\u05D7 \u05DE\u05D3\u05D5\u05D1\u05E8 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D9\u05E6\u05D5\u05E8 \u05E4\u05D5\u05DC\u05D5\u05D0\u05E4 \u05D3\u05D7\u05D5\u05E3?"

CLIENT NAME EXTRACTION (critical \u2014 overrides CRM snapshot name preferences):
- If the user provides a full name (two or more words), you MUST return it EXACTLY as written. NEVER replace it with a different name from the CRM snapshot.
  - CORRECT: "\u05D3\u05D9\u05D1\u05E8\u05EA\u05D9 \u05E2\u05DD \u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" \u2192 "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF"
  - WRONG: "\u05D3\u05D9\u05D1\u05E8\u05EA\u05D9 \u05E2\u05DD \u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" \u2192 "\u05D9\u05D5\u05E1\u05D9" \u274C
  - WRONG: "\u05D3\u05D9\u05D1\u05E8\u05EA\u05D9 \u05E2\u05DD \u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9" \u2192 "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" \u274C (even if CRM has "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF"; the user said \u05DC\u05D5\u05D9, not \u05DB\u05D4\u05DF)
- If the user gives only a first name (one word), output ONLY that first name. Do NOT append a last name from the CRM snapshot.
  - CORRECT: "\u05EA\u05E2\u05D3\u05DB\u05DF \u05D0\u05EA \u05D9\u05D5\u05E1\u05D9" \u2192 "\u05D9\u05D5\u05E1\u05D9"
  - WRONG: "\u05EA\u05E2\u05D3\u05DB\u05DF \u05D0\u05EA \u05D9\u05D5\u05E1\u05D9" \u2192 "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" \u274C (even if CRM snapshot shows "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF")
- The CRM snapshot "prefer exact full names" instruction applies ONLY to confirm spelling of a name the user already wrote verbatim. It NEVER authorizes substituting a different last name.

Indirect references rule (critical):
- If the person is referenced indirectly (for example pronouns or generic references like "\u05D4\u05DC\u05E7\u05D5\u05D7\u05D4", "\u05D4\u05D5\u05D0", "\u05D0\u05D9\u05EA\u05D5", "\u05DE\u05E9\u05E4\u05D7\u05D4"), do NOT guess identity. Ask a clarification question asking for the full name.
- If the user mentions only a first name (one word) AND two or more CRM clients share that first name: do NOT pick one, do NOT create the action. Instead, add a clarification question asking which client they meant and list both full names. Example: user says "\u05D9\u05D5\u05E1\u05D9", CRM has "\u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF" and "\u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9" \u2192 ask "\u05E2\u05DC \u05D0\u05D9\u05D6\u05D4 \u05D9\u05D5\u05E1\u05D9 \u05DE\u05D3\u05D5\u05D1\u05E8 \u2014 \u05D9\u05D5\u05E1\u05D9 \u05DB\u05D4\u05DF \u05D0\u05D5 \u05D9\u05D5\u05E1\u05D9 \u05DC\u05D5\u05D9?"

Time extraction rule:
- If time is mentioned (for example "\u05DE\u05D7\u05E8", "\u05E2\u05D5\u05D3 \u05E9\u05D1\u05D5\u05E2"), put it in due_time only when the task is otherwise valid (has clear title and explicit client_name).
- Coarse phrases like "\u05D1\u05D5\u05E7\u05E8", "\u05D0\u05D7\u05E8 \u05D4\u05E6\u05D4\u05E8\u05D9\u05D9\u05DD", or weekday without hour belong in due_time (they are complete enough).
- Do not create a task based on time mention alone.

Forbidden fields (do not output):
- description
- task
- task_description
- search_type
- property_type outside data.preferences (buyers only)
- Listing address / rooms / elevator / parking / asking price ONLY as fields under create_or_update_property.data \u2014 never duplicate those as seller preferences.features unless they reflect personal constraints unrelated to the listing card (rare).

Language rules:
- User can write in Hebrew.
- clarification_questions should be in Hebrew.
- missing_info can be Hebrew or concise machine-readable strings.
- Prefer over-clarification instead of incorrect assumptions.

Output rules:
- Return JSON only, no markdown, no explanation, no code fences.
- Ensure the JSON parses successfully.
`.trim();

// src/parser/parseMessage.ts
var OPENAI_URL = "https://api.openai.com/v1/chat/completions";
var DEFAULT_MODEL = "gpt-4o";
var SUPPORTED_ACTION_TYPES = [
  "create_or_update_client",
  "create_task",
  "create_or_update_property"
];
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function asNonEmptyString(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function asNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asStringArray(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const normalized = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
  if (normalized.length === 0) {
    return void 0;
  }
  return Array.from(new Set(normalized));
}
function normalizeRole(value) {
  if (value === "buyer" || value === "owner" || value === "unknown") {
    return value;
  }
  return void 0;
}
function normalizeLeadTemperature(value) {
  if (value === "hot" || value === "warm" || value === "cold" || value === "unknown") {
    return value;
  }
  return void 0;
}
function normalizeClientInteractionPatches(data) {
  const raw = data.interactions;
  if (!Array.isArray(raw)) {
    return void 0;
  }
  const out = [];
  for (const item of raw) {
    if (!isRecord(item)) {
      continue;
    }
    const summary = asNonEmptyString(item.summary) ?? asNonEmptyString(item.description) ?? asNonEmptyString(item.note);
    if (!summary) {
      continue;
    }
    const property_address = asNonEmptyString(item.property_address) ?? asNonEmptyString(item.property);
    const kind = asNonEmptyString(item.kind) ?? asNonEmptyString(item.type) ?? asNonEmptyString(item.interaction_type);
    const extraProps = asStringArray(item.property_addresses);
    out.push({
      summary,
      ...property_address ? { property_address } : {},
      ...extraProps ? { property_addresses: extraProps } : {},
      ...kind ? { kind } : {}
    });
  }
  return out.length > 0 ? out : void 0;
}
function normalizeClientAction(data) {
  const name = asNonEmptyString(data.name) ?? asNonEmptyString(data.full_name);
  if (!name) {
    return null;
  }
  const nestedPreferences = isRecord(data.preferences) ? data.preferences : {};
  const city = asNonEmptyString(nestedPreferences.city) ?? asNonEmptyString(data.city) ?? asNonEmptyString(data.location);
  const areas = asStringArray(nestedPreferences.areas) ?? asStringArray(data.areas);
  const propertyType = asNonEmptyString(nestedPreferences.property_type) ?? asNonEmptyString(data.property_type) ?? asNonEmptyString(data.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(data.budget);
  const entryDate = asNonEmptyString(nestedPreferences.entry_date) ?? asNonEmptyString(data.entry_date);
  const features = asStringArray(nestedPreferences.features) ?? asStringArray(data.features);
  const flexibleEntry = asNonEmptyString(nestedPreferences.flexible_entry) ?? asNonEmptyString(data.flexible_entry);
  const preferences = {};
  if (city) preferences.city = city;
  if (areas) preferences.areas = areas;
  if (propertyType) preferences.property_type = propertyType;
  if (budget !== void 0) preferences.budget = budget;
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
      ...role ? { role } : {},
      ...leadSource ? { lead_source: leadSource } : {},
      ...leadTemperature ? { lead_temperature: leadTemperature } : {},
      ...Object.keys(preferences).length > 0 ? { preferences } : {},
      ...interactions ? { interactions } : {}
    }
  };
}
function normalizeTaskAction(data) {
  const title = asNonEmptyString(data.title) ?? asNonEmptyString(data.description) ?? asNonEmptyString(data.task) ?? asNonEmptyString(data.task_description);
  if (!title) {
    return null;
  }
  const dueTime = asNonEmptyString(data.due_time) ?? asNonEmptyString(data.due_date);
  const clientName = asNonEmptyString(data.client_name) ?? asNonEmptyString(data.name);
  return {
    type: "create_task",
    data: {
      title,
      ...dueTime ? { due_time: dueTime } : {},
      ...clientName ? { client_name: clientName } : {}
    }
  };
}
function propertyAddressFromData(data) {
  return asNonEmptyString(data.address) ?? asNonEmptyString(data.full_address) ?? asNonEmptyString(data.property_address);
}
function normalizePropertyAction(data) {
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
      ...city ? { city } : {},
      ...rooms !== void 0 ? { rooms } : {},
      ...features ? { features } : {},
      ...askingPrice !== void 0 ? { asking_price: askingPrice } : {},
      ...priceNote ? { price_note: priceNote } : {},
      ...generalNotes ? { general_notes: generalNotes } : {},
      ...ownerClientName ? { owner_client_name: ownerClientName } : {}
    }
  };
}
function normalizeAction(action) {
  if (!isRecord(action)) {
    return { action: null };
  }
  const type = action.type;
  const data = action.data;
  if (typeof type !== "string" || !SUPPORTED_ACTION_TYPES.includes(type)) {
    return { action: null };
  }
  if (!isRecord(data)) {
    return { action: null };
  }
  if (type === "create_or_update_client") {
    const normalized2 = normalizeClientAction(data);
    if (!normalized2) {
      return {
        action: null,
        clarification: "\u05DE\u05D4 \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC \u05D4\u05DC\u05E7\u05D5\u05D7 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05D5 \u05DC\u05E2\u05D3\u05DB\u05DF \u05D0\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DC\u05E7\u05D5\u05D7?"
      };
    }
    return { action: normalized2 };
  }
  if (type === "create_or_update_property") {
    const normalized2 = normalizePropertyAction(data);
    if (!normalized2) {
      return {
        action: null,
        clarification: "\u05DE\u05D4\u05D9 \u05D4\u05DB\u05EA\u05D5\u05D1\u05EA \u05D4\u05DE\u05DC\u05D0\u05D4 \u05E9\u05DC \u05D4\u05E0\u05DB\u05E1 (\u05E8\u05D7\u05D5\u05D1 \u05D5\u05DE\u05E1\u05E4\u05E8 \u05D5\u05E2\u05D9\u05E8) \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05E4\u05EA\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E0\u05DB\u05E1?"
      };
    }
    return { action: normalized2 };
  }
  const normalized = normalizeTaskAction(data);
  if (!normalized) {
    return {
      action: null,
      clarification: "\u05DE\u05D4 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D1\u05E6\u05E2 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?"
    };
  }
  return { action: normalized };
}
function findFirstActionData(rawModelJson, type) {
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
function detectIntent(rawModelJson) {
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
function extractEntities(rawModelJson) {
  if (!isRecord(rawModelJson)) {
    return {};
  }
  const clientData = findFirstActionData(rawModelJson, "create_or_update_client") ?? {};
  const taskData = findFirstActionData(rawModelJson, "create_task") ?? {};
  const nestedPreferences = isRecord(clientData.preferences) ? clientData.preferences : {};
  const name = asNonEmptyString(clientData.name) ?? asNonEmptyString(clientData.full_name);
  const city = asNonEmptyString(nestedPreferences.city) ?? asNonEmptyString(clientData.city) ?? asNonEmptyString(clientData.location);
  const areas = asStringArray(nestedPreferences.areas) ?? asStringArray(clientData.areas);
  const propertyType = asNonEmptyString(nestedPreferences.property_type) ?? asNonEmptyString(clientData.property_type) ?? asNonEmptyString(clientData.search_type);
  const budget = asNumber(nestedPreferences.budget) ?? asNumber(clientData.budget);
  const features = asStringArray(nestedPreferences.features) ?? asStringArray(clientData.features);
  const leadSource = asNonEmptyString(clientData.lead_source);
  const leadTemperature = normalizeLeadTemperature(clientData.lead_temperature);
  const flexibleEntry = asNonEmptyString(nestedPreferences.flexible_entry) ?? asNonEmptyString(clientData.flexible_entry);
  const dueTime = asNonEmptyString(taskData.due_time) ?? asNonEmptyString(taskData.due_date);
  const title = asNonEmptyString(taskData.title) ?? asNonEmptyString(taskData.description) ?? asNonEmptyString(taskData.task) ?? asNonEmptyString(taskData.task_description);
  const clientName = asNonEmptyString(taskData.client_name) ?? asNonEmptyString(taskData.name);
  return {
    ...name ? { name } : {},
    ...city ? { city } : {},
    ...areas ? { areas } : {},
    ...propertyType ? { property_type: propertyType } : {},
    ...budget !== void 0 ? { budget } : {},
    ...features ? { features } : {},
    ...leadSource ? { lead_source: leadSource } : {},
    ...leadTemperature ? { lead_temperature: leadTemperature } : {},
    ...flexibleEntry ? { flexible_entry: flexibleEntry } : {},
    ...dueTime ? { due_time: dueTime } : {},
    ...title ? { title } : {},
    ...clientName ? { client_name: clientName } : {}
  };
}
function collectMissingFieldsFromRawActions(rawModelJson) {
  const missing = [];
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
      const title = asNonEmptyString(data.title) ?? asNonEmptyString(data.description) ?? asNonEmptyString(data.task) ?? asNonEmptyString(data.task_description);
      if (!title) {
        missing.push("title");
      }
      const clientRef = asNonEmptyString(data.client_name) ?? asNonEmptyString(data.name);
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
function validateRequiredFields(rawModelJson) {
  const missingFields = collectMissingFieldsFromRawActions(rawModelJson);
  return {
    isValid: missingFields.length === 0,
    missingFields
  };
}
function clarificationForMissingField(missingField) {
  if (missingField === "name") {
    return "\u05DE\u05D4 \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC \u05D4\u05DC\u05E7\u05D5\u05D7 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05D5 \u05DC\u05E2\u05D3\u05DB\u05DF \u05D0\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DC\u05E7\u05D5\u05D7?";
  }
  if (missingField === "title") {
    return "\u05DE\u05D4 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D1\u05E6\u05E2 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?";
  }
  if (missingField === "property_address") {
    return "\u05DE\u05D4\u05D9 \u05D4\u05DB\u05EA\u05D5\u05D1\u05EA \u05D4\u05DE\u05DC\u05D0\u05D4 \u05E9\u05DC \u05D4\u05E0\u05DB\u05E1 (\u05E8\u05D7\u05D5\u05D1 \u05D5\u05DE\u05E1\u05E4\u05E8 \u05D5\u05E2\u05D9\u05E8) \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05E4\u05EA\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E0\u05DB\u05E1?";
  }
  if (missingField === "task_client_name") {
    return "\u05E2\u05DC \u05D0\u05D9\u05D6\u05D4 \u05DC\u05E7\u05D5\u05D7 \u05DE\u05D3\u05D5\u05D1\u05E8 \u05DC\u05DE\u05E9\u05D9\u05DE\u05D4? \u05E6\u05E8\u05D9\u05DA \u05E9\u05DD \u05DE\u05DC\u05D0 \u05DB\u05D3\u05D9 \u05DC\u05E9\u05D9\u05D9\u05DA \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05DC\u05D9\u05E9\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA.";
  }
  if (missingField === "property_owner_client_name") {
    return "\u05DC\u05DE\u05D9 \u05E9\u05D9\u05D9\u05DA \u05D4\u05E0\u05DB\u05E1? \u05E6\u05E8\u05D9\u05DA \u05E9\u05DD \u05DC\u05E7\u05D5\u05D7 \u05DE\u05DC\u05D0 \u05D6\u05D4\u05D4 \u05DC\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DC\u05E7\u05D5\u05D7 \u05DB\u05D3\u05D9 \u05DC\u05E7\u05E9\u05E8 \u05D0\u05EA \u05D4\u05E0\u05DB\u05E1 \u05DC\u05D9\u05E9\u05D5\u05EA.";
  }
  return "\u05DE\u05D4 \u05D7\u05E1\u05E8 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D1\u05E6\u05E2 \u05D0\u05EA \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?";
}
function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item) => typeof item === "string");
}
function normalizeParseResult(raw) {
  if (!isRecord(raw)) {
    return { actions: [], missing_info: [], clarification_questions: [] };
  }
  const clarificationQuestions = normalizeStringArray(raw.clarification_questions);
  const mappedActions = Array.isArray(raw.actions) ? raw.actions.map(normalizeAction) : [];
  const actions = mappedActions.map((item) => item.action).filter((action) => action !== null);
  const normalizationClarifications = mappedActions.map((item) => item.clarification).filter((item) => typeof item === "string");
  const finalClarificationQuestions = Array.from(
    /* @__PURE__ */ new Set([...clarificationQuestions, ...normalizationClarifications])
  );
  if (actions.length === 0 && finalClarificationQuestions.length === 0) {
    finalClarificationQuestions.push("\u05DE\u05D4 \u05D7\u05E1\u05E8 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D1\u05E6\u05E2 \u05D0\u05EA \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?");
  }
  return {
    actions,
    missing_info: normalizeStringArray(raw.missing_info),
    clarification_questions: finalClarificationQuestions
  };
}
function decideOutput(rawModelJson, intent, validation) {
  const result = normalizeParseResult(rawModelJson);
  const rawHasSupportedAction = isRecord(rawModelJson) && Array.isArray(rawModelJson.actions) && rawModelJson.actions.some(
    (a) => isRecord(a) && typeof a.type === "string" && SUPPORTED_ACTION_TYPES.includes(a.type)
  );
  if (intent.intent === "unknown" && !rawHasSupportedAction) {
    if (result.clarification_questions.length === 0) {
      result.clarification_questions.push("\u05DE\u05D4 \u05D7\u05E1\u05E8 \u05D1\u05D4\u05D5\u05D3\u05E2\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D1\u05E6\u05E2 \u05D0\u05EA \u05D4\u05E4\u05E2\u05D5\u05DC\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?");
    }
    return result;
  }
  if (!validation.isValid) {
    const missingInfo = Array.from(/* @__PURE__ */ new Set([...result.missing_info, ...validation.missingFields]));
    const missingClarifications = validation.missingFields.map(clarificationForMissingField);
    const clarificationQuestions = Array.from(
      /* @__PURE__ */ new Set([...result.clarification_questions, ...missingClarifications])
    );
    return {
      actions: [],
      missing_info: missingInfo,
      clarification_questions: clarificationQuestions
    };
  }
  return result;
}
async function parseMessage(input, options = {}) {
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
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenAI response did not include JSON content");
  }
  let rawModelJson;
  let parseStatus = "ok";
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

// src/crm/demoCrmStore.ts
import { randomUUID as randomUUID3 } from "node:crypto";
var clients2 = [];
var properties2 = [];
var calendar = [];
function roleToKind(role) {
  if (role === "owner") {
    return "\u05DE\u05D5\u05DB\u05E8";
  }
  if (role === "buyer") {
    return "\u05E7\u05D5\u05E0\u05D4";
  }
  return "\u05E7\u05D5\u05E0\u05D4";
}
function leadTemperatureToDemo(value) {
  if (value === "hot") {
    return "\u05D7\u05DD";
  }
  if (value === "warm") {
    return "\u05D7\u05DE\u05D9\u05DD";
  }
  if (value === "cold") {
    return "\u05E7\u05E8";
  }
  if (value === "unknown") {
    return "\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2";
  }
  return void 0;
}
function formatDemoInteractionTime() {
  return (/* @__PURE__ */ new Date()).toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}
function combinedInteractionAddresses(patch) {
  const raw = [
    patch.property_address?.trim(),
    ...(patch.property_addresses ?? []).map((x) => x.trim()).filter(Boolean)
  ].filter(Boolean);
  return [...new Set(raw)];
}
function appendDemoInteractions(prev, patches) {
  if (!patches?.length) {
    return prev;
  }
  const base = prev ?? [];
  const added = patches.map((p) => {
    const props = combinedInteractionAddresses(p);
    return {
      id: randomUUID3(),
      summary: p.summary.trim(),
      recordedAt: formatDemoInteractionTime(),
      ...p.kind?.trim() ? { kind: p.kind.trim() } : {},
      ...props.length > 0 ? { propertyAddresses: props } : {}
    };
  });
  return [...base, ...added];
}
function normalizeDemoName(value) {
  return value.trim().replace(/\s+/g, " ");
}
function attachTaskIdToLatestInteraction(clientName, taskId) {
  const key = normalizeDemoName(clientName);
  if (!key) {
    return;
  }
  const idx = clients2.findIndex((c) => normalizeDemoName(c.name) === key);
  if (idx < 0) {
    return;
  }
  const row = clients2[idx];
  const ix = row.interactions;
  if (!ix?.length) {
    return;
  }
  const lastPos = ix.length - 1;
  const last = ix[lastPos];
  const relatedTaskIds = [...last.relatedTaskIds ?? [], taskId];
  const nextIx = [...ix.slice(0, lastPos), { ...last, relatedTaskIds }];
  clients2[idx] = { ...row, interactions: nextIx };
}
function normalizeDemoPreferences(p) {
  if (!p) {
    return {};
  }
  const features = Array.from(
    /* @__PURE__ */ new Set([...p.property_type ? [p.property_type] : [], ...p.features ?? []])
  );
  return {
    ...p.city ? { city: p.city } : {},
    ...p.areas ? { areas: p.areas } : {},
    ...p.budget !== void 0 ? { budget: p.budget } : {},
    ...features.length > 0 ? { features } : {},
    ...p.flexible_entry ? { flexibleEntry: p.flexible_entry } : {}
  };
}
function getDemoCrmState() {
  return {
    clients: clients2.map((c) => ({
      ...c,
      ...c.interactions ? { interactions: c.interactions.map((i) => ({ ...i })) } : {},
      preferences: {
        ...c.preferences,
        ...c.preferences.features ? { features: [...c.preferences.features] } : {}
      }
    })),
    properties: properties2.map((p) => ({ ...p })),
    calendar: calendar.map((e) => ({ ...e }))
  };
}
function resetDemoCrmStore() {
  clients2.length = 0;
  properties2.length = 0;
  calendar.length = 0;
}
function recordPipelineClientUpsert(data, entityId, _operation) {
  const idx = clients2.findIndex((c) => c.name === data.name);
  const kind = roleToKind(data.role);
  const preferences = normalizeDemoPreferences(data.preferences);
  if (idx >= 0) {
    const prev = clients2[idx];
    const mergedInteractions2 = appendDemoInteractions(prev.interactions, data.interactions);
    clients2[idx] = {
      ...prev,
      id: entityId,
      kind,
      leadSource: data.lead_source ?? prev.leadSource,
      leadTemperature: leadTemperatureToDemo(data.lead_temperature) ?? prev.leadTemperature,
      preferences: { ...prev.preferences, ...preferences },
      status: prev.status === "\u05D7\u05D3\u05E9" ? "\u05D1\u05D8\u05D9\u05E4\u05D5\u05DC" : prev.status,
      ...mergedInteractions2 !== void 0 ? { interactions: mergedInteractions2 } : {}
    };
    return;
  }
  const mergedInteractions = appendDemoInteractions(void 0, data.interactions);
  clients2.push({
    id: entityId,
    name: data.name,
    kind,
    status: "\u05D7\u05D3\u05E9",
    leadSource: data.lead_source,
    leadTemperature: leadTemperatureToDemo(data.lead_temperature),
    preferences,
    notes: void 0,
    ...mergedInteractions !== void 0 ? { interactions: mergedInteractions } : {}
  });
}
function recordPipelineTask(data, entityId) {
  const id = entityId || randomUUID3();
  calendar.unshift({
    id,
    title: data.title,
    clientName: data.client_name ?? "",
    date: data.due_time?.trim() ? data.due_time.trim() : "\u05DC\u05DC\u05D0 \u05EA\u05D0\u05E8\u05D9\u05DA \u05D9\u05E2\u05D3",
    kind: "\u05DE\u05E9\u05D9\u05DE\u05D4",
    description: void 0
  });
  const cn = data.client_name?.trim();
  if (cn) {
    attachTaskIdToLatestInteraction(cn, id);
  }
}
function mergeDemoPropertyRollup(prevRollup, nextParts) {
  const joined = nextParts.filter(Boolean).join(" \xB7 ");
  if (!joined) {
    return prevRollup;
  }
  if (!prevRollup?.trim()) {
    return joined;
  }
  if (prevRollup.includes(joined)) {
    return prevRollup;
  }
  return `${prevRollup} \xB7 ${joined}`;
}
function recordPipelineProperty(data, entityId) {
  const city = data.city?.trim() ?? "";
  const rooms = data.rooms ?? 0;
  const price = data.asking_price ?? 0;
  const ownerClientName = data.owner_client_name?.trim() ?? "";
  const rollupParts = [];
  if (data.price_note) {
    rollupParts.push(`\u05DE\u05D7\u05D9\u05E8: ${data.price_note}`);
  }
  if (data.general_notes) {
    rollupParts.push(data.general_notes);
  }
  const addrTrim = data.address.trim();
  const existingIdx = properties2.findIndex((p) => p.address.trim() === addrTrim);
  if (existingIdx >= 0) {
    const prev = properties2[existingIdx];
    const mergedRollup = mergeDemoPropertyRollup(prev.notes, rollupParts);
    properties2[existingIdx] = {
      ...prev,
      id: entityId,
      ...data.city?.trim() ? { city: data.city.trim() } : {},
      ...data.rooms !== void 0 ? { rooms: data.rooms } : {},
      ...data.asking_price !== void 0 ? { price: data.asking_price } : {},
      ...ownerClientName ? { ownerClientName } : {},
      ...mergedRollup ? { notes: mergedRollup } : {},
      ...data.price_note ? { priceNote: prev.priceNote ? `${prev.priceNote} \xB7 ${data.price_note}` : data.price_note } : {},
      ...data.general_notes ? {
        generalNotes: prev.generalNotes ? `${prev.generalNotes}
${data.general_notes}` : data.general_notes
      } : {},
      ...data.features && data.features.length > 0 ? { features: [...data.features] } : {}
    };
    return;
  }
  properties2.unshift({
    id: entityId,
    address: addrTrim,
    city,
    rooms,
    price,
    ...ownerClientName ? { ownerClientName } : {},
    ...rollupParts.length > 0 ? { notes: rollupParts.join(" \xB7 ") } : {},
    ...data.price_note ? { priceNote: data.price_note } : {},
    ...data.general_notes ? { generalNotes: data.general_notes } : {},
    ...data.features && data.features.length > 0 ? { features: [...data.features] } : {}
  });
}

// src/orchestrator/executeActions.ts
function executeActions(actions) {
  return actions.map((action) => {
    if (action.type === "create_or_update_client") {
      const { client, operation } = createOrUpdateClient(action.data);
      recordPipelineClientUpsert(action.data, client.id, operation);
      return {
        actionType: action.type,
        success: true,
        entityId: client.id,
        clientOperation: operation,
        clientSnapshot: client
      };
    }
    if (action.type === "create_or_update_property") {
      const prop = createOrUpdateProperty(action.data);
      recordPipelineProperty(action.data, prop.id);
      return {
        actionType: action.type,
        success: true,
        entityId: prop.id
      };
    }
    const task = createTask(action.data);
    recordPipelineTask(action.data, task.id);
    return { actionType: action.type, success: true, entityId: task.id };
  });
}

// src/response/formatExecutedReply.ts
function rolePhrase(role) {
  if (role === "buyer") {
    return " \u05DB\u05E8\u05D5\u05DB\u05E9";
  }
  if (role === "owner") {
    return " \u05DB\u05D1\u05E2\u05DC \u05E0\u05DB\u05E1";
  }
  return "";
}
function joinWithVe(parts) {
  if (parts.length === 0) {
    return "";
  }
  if (parts.length === 1) {
    return parts[0];
  }
  if (parts.length === 2) {
    return `${parts[0]} \u05D5${parts[1]}`;
  }
  const head = parts.slice(0, -1).join(", ");
  return `${head} \u05D5${parts[parts.length - 1]}`;
}
function preferencesPatchSummary(patch) {
  if (!patch) {
    return [];
  }
  const bits = [];
  if (patch.areas && patch.areas.length > 0) {
    bits.push(`\u05D0\u05D6\u05D5\u05E8\u05D9 \u05D7\u05D9\u05E4\u05D5\u05E9: ${joinWithVe(patch.areas)}`);
  } else if (patch.city) {
    bits.push(`\u05E2\u05D9\u05E8 \u05DE\u05D5\u05E2\u05D3\u05E4\u05EA: ${patch.city}`);
  }
  if (patch.budget !== void 0) {
    bits.push(`\u05EA\u05E7\u05E6\u05D9\u05D1 \u05E2\u05D3 ${patch.budget.toLocaleString("he-IL")} \u20AA`);
  }
  if (patch.flexible_entry) {
    bits.push(`\u05D2\u05DE\u05D9\u05E9\u05D5\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4: ${patch.flexible_entry}`);
  }
  if (patch.features && patch.features.length > 0) {
    bits.push(`\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA: ${joinWithVe(patch.features)}`);
  }
  if (patch.property_type) {
    bits.push(`\u05E1\u05D5\u05D2 \u05E0\u05DB\u05E1: ${patch.property_type}`);
  }
  return bits;
}
function preferencesSnapshotSummary(prefs) {
  if (!prefs) {
    return [];
  }
  const bits = [];
  if (prefs.areas && prefs.areas.length > 0) {
    bits.push(`\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D1\u05D0\u05D6\u05D5\u05E8\u05D9\u05DD ${joinWithVe(prefs.areas)}`);
  } else if (prefs.city) {
    bits.push(`\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D1${prefs.city}`);
  }
  if (prefs.budget !== void 0) {
    bits.push(`\u05EA\u05E7\u05E6\u05D9\u05D1 \u05E2\u05D3 ${prefs.budget.toLocaleString("he-IL")} \u20AA`);
  }
  if (prefs.flexible_entry) {
    bits.push(`\u05D2\u05DE\u05D9\u05E9\u05D5\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4: ${prefs.flexible_entry}`);
  }
  if (prefs.features && prefs.features.length > 0) {
    bits.push(`\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA: ${joinWithVe(prefs.features)}`);
  }
  return bits;
}
function touchedSnapshotSummary(patch, snapshot) {
  if (!patch || !snapshot) {
    return [];
  }
  const bits = [];
  if (patch.areas || patch.city) {
    if (snapshot.areas && snapshot.areas.length > 0) {
      bits.push(`\u05D0\u05D6\u05D5\u05E8\u05D9 \u05D7\u05D9\u05E4\u05D5\u05E9: ${joinWithVe(snapshot.areas)}`);
    } else if (snapshot.city) {
      bits.push(`\u05D0\u05D6\u05D5\u05E8 \u05D7\u05D9\u05E4\u05D5\u05E9: ${snapshot.city}`);
    }
  }
  if (patch.budget !== void 0 && snapshot.budget !== void 0) {
    bits.push(`\u05EA\u05E7\u05E6\u05D9\u05D1 \u05E2\u05D3 ${snapshot.budget.toLocaleString("he-IL")} \u20AA`);
  }
  if (patch.flexible_entry && snapshot.flexible_entry) {
    bits.push(`\u05D2\u05DE\u05D9\u05E9\u05D5\u05EA \u05DB\u05E0\u05D9\u05E1\u05D4: ${snapshot.flexible_entry}`);
  }
  if (patch.features && patch.features.length > 0 && snapshot.features && snapshot.features.length > 0) {
    bits.push(`\u05D3\u05E8\u05D9\u05E9\u05D5\u05EA: ${joinWithVe(snapshot.features)}`);
  }
  if (patch.property_type && snapshot.property_type) {
    bits.push(`\u05E1\u05D5\u05D2 \u05E0\u05DB\u05E1: ${snapshot.property_type}`);
  }
  return bits;
}
function formatClientSentence(action, execution) {
  const name = action.data.name;
  const roleText = rolePhrase(action.data.role);
  const operation = execution?.clientOperation ?? /* fallback if execution metadata missing */
  "updated";
  const verb = operation === "created" ? `\u05D9\u05E6\u05E8\u05EA\u05D9 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05DC\u05E7\u05D5\u05D7 \u05E2\u05D1\u05D5\u05E8 ${name}${roleText}` : `\u05E2\u05D3\u05DB\u05E0\u05EA\u05D9 \u05D0\u05EA \u05E4\u05E8\u05D8\u05D9 \u05D4\u05DC\u05E7\u05D5\u05D7 ${name}${roleText}`;
  const patchBits = preferencesPatchSummary(action.data.preferences);
  const snapshotPrefs = execution?.clientSnapshot?.preferences ?? action.data.preferences;
  const snapshotBits = operation === "updated" ? touchedSnapshotSummary(action.data.preferences, snapshotPrefs) : preferencesSnapshotSummary(snapshotPrefs);
  const sentences = [verb];
  if (action.data.interactions && action.data.interactions.length > 0) {
    sentences.push(
      `\u05D0\u05D9\u05E0\u05D8\u05E8\u05E7\u05E6\u05D9\u05D5\u05EA (${action.data.interactions.length}): ${action.data.interactions.map((i) => {
        const tag = i.kind?.trim() ? `[${i.kind.trim()}] ` : "";
        return `${tag}${i.summary}`;
      }).join(" \xB7 ")}`
    );
  }
  if (patchBits.length > 0 && operation === "updated") {
    sentences.push(`\u05E2\u05D3\u05DB\u05D5\u05DF \u05D4\u05E4\u05E2\u05DD: ${patchBits.join("; ")}`);
  }
  if (snapshotBits.length > 0) {
    sentences.push(`\u05DB\u05E2\u05EA \u05E2\u05D1\u05D5\u05E8 ${name}: ${snapshotBits.join("; ")}`);
  }
  const leadParts = [];
  if (action.data.lead_source) {
    leadParts.push(`\u05DE\u05E7\u05D5\u05E8 \u05DC\u05D9\u05D3: ${action.data.lead_source}`);
  }
  if (action.data.lead_temperature && action.data.lead_temperature !== "unknown") {
    const heat = action.data.lead_temperature === "hot" ? "\u05D7\u05DD" : action.data.lead_temperature === "warm" ? "\u05D7\u05DE\u05D9\u05DD" : action.data.lead_temperature === "cold" ? "\u05E7\u05E8" : "";
    if (heat) {
      leadParts.push(`\u05D7\u05D5\u05DD \u05DC\u05D9\u05D3: ${heat}`);
    }
  }
  if (leadParts.length > 0 && operation === "created") {
    sentences.push(leadParts.join("; "));
  }
  return sentences.filter((line) => line.trim().length > 0).join(". ").trim();
}
function formatTaskSentence(action) {
  const taskFor = action.data.client_name ? ` \u05E2\u05D1\u05D5\u05E8 ${action.data.client_name}` : "";
  const due = action.data.due_time ? ` \u05DC${action.data.due_time}` : "";
  return `\u05D9\u05E6\u05E8\u05EA\u05D9 \u05DE\u05E9\u05D9\u05DE\u05D4${taskFor}${due}: ${action.data.title}`;
}
function formatPropertySentence(action) {
  const owner = action.data.owner_client_name;
  const intro = owner ? `\u05D9\u05E6\u05E8\u05EA\u05D9 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E0\u05DB\u05E1 \u05E2\u05D1\u05D5\u05E8 ${owner} \u05D1\u05DB\u05EA\u05D5\u05D1\u05EA ${action.data.address}` : `\u05D9\u05E6\u05E8\u05EA\u05D9 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E0\u05DB\u05E1 \u05D1\u05DB\u05EA\u05D5\u05D1\u05EA ${action.data.address}`;
  const parts = [intro];
  if (action.data.city) {
    parts.push(`(${action.data.city})`);
  }
  if (action.data.rooms !== void 0) {
    parts.push(`${action.data.rooms} \u05D7\u05D3\u05E8\u05D9\u05DD`);
  }
  if (action.data.features && action.data.features.length > 0) {
    parts.push(`\u05EA\u05DB\u05D5\u05E0\u05D5\u05EA: ${joinWithVe(action.data.features)}`);
  }
  if (action.data.asking_price !== void 0) {
    parts.push(`\u05DE\u05D7\u05D9\u05E8 \u05DE\u05D1\u05D5\u05E7\u05E9 \u05DB-${action.data.asking_price.toLocaleString("he-IL")} \u20AA`);
  }
  if (action.data.price_note) {
    parts.push(`\u05D4\u05E2\u05E8\u05EA \u05DE\u05D7\u05D9\u05E8: ${action.data.price_note}`);
  }
  if (action.data.general_notes) {
    parts.push(`\u05D4\u05E2\u05E8\u05D5\u05EA: ${action.data.general_notes}`);
  }
  return parts.join(". ").trim();
}
function formatExecutedReply(actions, results) {
  const lines = actions.map((action, index) => {
    const execution = results[index];
    if (action.type === "create_task") {
      return formatTaskSentence(action);
    }
    if (action.type === "create_or_update_property") {
      return formatPropertySentence(action);
    }
    return formatClientSentence(action, execution);
  });
  return lines.join("\n");
}

// src/response/composeUserReply.ts
function missingInfoToQuestion(missingInfo) {
  const key = missingInfo[0];
  if (key === "name") {
    return "\u05D7\u05E1\u05E8 \u05DC\u05D9 \u05E4\u05E8\u05D8 \u05E7\u05D8\u05DF, \u05DE\u05D4 \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC \u05D4\u05DC\u05E7\u05D5\u05D7?";
  }
  if (key === "title") {
    return "\u05D7\u05E1\u05E8 \u05DC\u05D9 \u05E4\u05E8\u05D8 \u05E7\u05D8\u05DF, \u05DE\u05D4 \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05D4\u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05E9\u05E6\u05E8\u05D9\u05DA \u05DC\u05D1\u05E6\u05E2?";
  }
  if (key === "due_time") {
    return "\u05D7\u05E1\u05E8 \u05DC\u05D9 \u05DE\u05EA\u05D9 \u05DC\u05D4\u05D6\u05DB\u05D9\u05E8 \u05D0\u05D5 \u05DC\u05D1\u05E6\u05E2 \u05D0\u05EA \u05D6\u05D4 \u2014 \u05DE\u05D4 \u05D4\u05D9\u05D5\u05DD \u05D0\u05D5 \u05D4\u05D7\u05DC\u05D5\u05DF \u05D4\u05DB\u05DC\u05DC\u05D9 (\u05D1\u05D5\u05E7\u05E8/\u05E2\u05E8\u05D1)? \u05E9\u05E2\u05D4 \u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05DC\u05D0 \u05D7\u05D5\u05D1\u05D4.";
  }
  return "\u05D7\u05E1\u05E8 \u05DC\u05D9 \u05E4\u05E8\u05D8 \u05E7\u05D8\u05DF \u05DB\u05D3\u05D9 \u05DC\u05D4\u05DE\u05E9\u05D9\u05DA, \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D7\u05D3\u05D3?";
}
function composeUserReply(input) {
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
    return parsed.clarification_questions[0] ?? "\u05D0\u05E4\u05E9\u05E8 \u05DC\u05D7\u05D3\u05D3 \u05E8\u05D2\u05E2 \u05D0\u05EA \u05D4\u05D1\u05E7\u05E9\u05D4?";
  }
  if (parsed.missing_info.length > 0) {
    return missingInfoToQuestion(parsed.missing_info);
  }
  if (validation.missing_info.length > 0) {
    return missingInfoToQuestion(validation.missing_info);
  }
  return "\u05DC\u05D0 \u05D1\u05D8\u05D5\u05D7 \u05E9\u05D4\u05D1\u05E0\u05EA\u05D9 \u05E2\u05D3 \u05D4\u05E1\u05D5\u05E3, \u05D0\u05E4\u05E9\u05E8 \u05DC\u05D7\u05D3\u05D3?";
}

// src/resolution/propertyListingConsolidation.ts
function normalizeListingAddress(addr) {
  return addr.trim().replace(/\s+/g, " ");
}
function normalizedAddressesFromInteractionPatch(patch) {
  const raw = [
    patch.property_address?.trim(),
    ...(patch.property_addresses ?? []).map((x) => x.trim()).filter(Boolean)
  ].filter(Boolean);
  const keys = [...new Set(raw.map((a) => normalizeListingAddress(a)))];
  return keys;
}
function consolidateListingPatchesFromInteractionAddresses(actions, persistedProperties) {
  if (actions.some((a) => a.type === "create_or_update_property")) {
    return actions;
  }
  const citedNormalizedAddresses = /* @__PURE__ */ new Set();
  for (const a of actions) {
    if (a.type !== "create_or_update_client") {
      continue;
    }
    for (const inter of a.data.interactions ?? []) {
      for (const key of normalizedAddressesFromInteractionPatch(inter)) {
        citedNormalizedAddresses.add(key);
      }
    }
  }
  if (citedNormalizedAddresses.size !== 1) {
    return actions;
  }
  const normalizedAddr = [...citedNormalizedAddresses][0];
  const existing = persistedProperties.find(
    (p) => normalizeListingAddress(p.address) === normalizedAddr
  );
  if (existing?.owner_client_name?.trim()) {
    const injected2 = {
      type: "create_or_update_property",
      data: {
        address: existing.address.trim(),
        owner_client_name: existing.owner_client_name.trim()
      }
    };
    return [...actions, injected2];
  }
  if (existing) {
    const injected2 = {
      type: "create_or_update_property",
      data: {
        address: existing.address.trim()
      }
    };
    return [...actions, injected2];
  }
  const injected = {
    type: "create_or_update_property",
    data: {
      address: normalizedAddr
    }
  };
  return [...actions, injected];
}

// src/resolution/resolveAndEnrichCrmActions.ts
function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}
function cloneClientsForOverlay(clients3) {
  return clients3.map((c) => ({
    ...c,
    ...c.preferences ? { preferences: { ...c.preferences } } : {}
  }));
}
function resolveClientRef(parserRef, clients3) {
  const norm = normalizeWhitespace(parserRef);
  const tokens = norm.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { notFound: true };
  }
  if (tokens.length >= 2) {
    const exact = clients3.filter((c) => normalizeWhitespace(c.name) === norm);
    if (exact.length === 1) return { match: exact[0] };
    if (exact.length > 1) return { ambiguous: exact };
    return { notFound: true };
  }
  const word = tokens[0];
  const matches = clients3.filter((c) => {
    const firstToken = normalizeWhitespace(c.name).split(/\s+/).filter(Boolean)[0];
    return firstToken === word;
  });
  if (matches.length === 1) return { match: matches[0] };
  if (matches.length > 1) return { ambiguous: matches };
  return { notFound: true };
}
function clarificationAmbiguousRef(nameDisplayed, candidates) {
  const fullNames = candidates.map((c) => c.name).sort().join(", ");
  return `\u05D9\u05E9 \u05DB\u05DE\u05D4 \u05DC\u05E7\u05D5\u05D7\u05D5\u05EA \u05D1\u05E9\u05DD ${nameDisplayed} (${fullNames}), \u05DC\u05DE\u05D9 \u05D4\u05EA\u05DB\u05D5\u05D5\u05E0\u05EA?`;
}
function clarificationClientNotFound(name, isSingleWord) {
  if (isSingleWord) {
    return `\u05DC\u05D0 \u05E7\u05D9\u05D9\u05DD \u05DC\u05E7\u05D5\u05D7 \u05D1\u05E9\u05DD ${name}, \u05DE\u05D4 \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0?`;
  }
  return `\u05DC\u05D0 \u05E7\u05D9\u05D9\u05DD \u05DC\u05E7\u05D5\u05D7 \u05D1\u05E9\u05DD ${name} \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA \u2014 \u05D1\u05D3\u05D5\u05E7 \u05E9\u05D4\u05E9\u05DD \u05DE\u05D3\u05D5\u05D9\u05E7 \u05DB\u05E4\u05D9 \u05E9\u05DE\u05D5\u05E4\u05D9\u05E2 \u05D1\u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DC\u05E7\u05D5\u05D7.`;
}
function resolveAndEnrichCrmActions(actions, persistedClients, persistedProperties = []) {
  const out = [];
  const clarifications = [];
  const rejectedActions = [];
  let overlay = cloneClientsForOverlay(persistedClients);
  for (const action of actions) {
    if (action.type === "create_task") {
      const rawClient = action.data.client_name?.trim();
      if (!rawClient) {
        clarifications.push(
          "\u05D7\u05E1\u05E8 \u05E9\u05D9\u05D5\u05DA \u05DC\u05E7\u05D5\u05D7 \u05DC\u05DE\u05E9\u05D9\u05DE\u05D4 \u2014 \u05E6\u05E8\u05D9\u05DA \u05E9\u05DD \u05DE\u05DC\u05D0 \u05DB\u05D3\u05D9 \u05DC\u05E7\u05E9\u05E8 \u05DE\u05E9\u05D9\u05DE\u05D4 \u05DC\u05D9\u05E9\u05D5\u05EA \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA."
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name missing after validation"
        });
        continue;
      }
      const resolved2 = resolveClientRef(rawClient, overlay);
      if ("match" in resolved2) {
        out.push({
          ...action,
          data: { ...action.data, client_name: resolved2.match.name }
        });
        continue;
      }
      if ("ambiguous" in resolved2) {
        clarifications.push(
          clarificationAmbiguousRef(normalizeWhitespace(rawClient), resolved2.ambiguous)
        );
        rejectedActions.push({ actionType: action.type, reason: "ambiguous task client_name" });
        continue;
      }
      const normClient = normalizeWhitespace(rawClient);
      const isSingle = normClient.split(/\s+/).filter(Boolean).length === 1;
      if (isSingle) {
        clarifications.push(clarificationClientNotFound(normClient, true));
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name does not resolve to any CRM client"
        });
        continue;
      }
      const synthetic2 = { id: `pending:${normClient}`, name: normClient };
      overlay.push(synthetic2);
      out.push({ type: "create_or_update_client", data: { name: normClient } });
      out.push({ ...action, data: { ...action.data, client_name: normClient } });
      continue;
    }
    if (action.type === "create_or_update_property") {
      let rawOwner = action.data.owner_client_name?.trim();
      if (!rawOwner) {
        const ownersOnly = overlay.filter((c) => c.role === "owner");
        if (ownersOnly.length === 1) {
          rawOwner = normalizeWhitespace(ownersOnly[0].name);
        }
      }
      if (!rawOwner) {
        out.push(action);
        continue;
      }
      const resolved2 = resolveClientRef(rawOwner, overlay);
      if ("match" in resolved2) {
        out.push({
          ...action,
          data: { ...action.data, owner_client_name: resolved2.match.name }
        });
        continue;
      }
      if ("ambiguous" in resolved2) {
        clarifications.push(
          clarificationAmbiguousRef(normalizeWhitespace(rawOwner), resolved2.ambiguous)
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "ambiguous property owner_client_name"
        });
        continue;
      }
      const isSingle = normalizeWhitespace(rawOwner).split(/\s+/).filter(Boolean).length === 1;
      clarifications.push(clarificationClientNotFound(normalizeWhitespace(rawOwner), isSingle));
      rejectedActions.push({
        actionType: action.type,
        reason: "property owner_client_name does not resolve to any CRM client"
      });
      continue;
    }
    const rawName = normalizeWhitespace(action.data.name);
    const resolved = resolveClientRef(rawName, overlay);
    if ("match" in resolved) {
      const canonical = resolved.match.name;
      const mergedPrefs = mergeClientPreferences(resolved.match.preferences, action.data.preferences);
      const nextData2 = { ...action.data, name: canonical };
      if (mergedPrefs !== void 0 && Object.keys(mergedPrefs).length > 0) {
        nextData2.preferences = mergedPrefs;
      } else {
        delete nextData2.preferences;
      }
      const updatedClient = {
        ...resolved.match,
        ...action.data.role !== void 0 ? { role: action.data.role } : {},
        ...action.data.lead_source !== void 0 ? { lead_source: action.data.lead_source } : {},
        ...action.data.lead_temperature !== void 0 ? { lead_temperature: action.data.lead_temperature } : {}
      };
      if (mergedPrefs !== void 0 && Object.keys(mergedPrefs).length > 0) {
        updatedClient.preferences = mergedPrefs;
      }
      overlay = overlay.map(
        (c) => normalizeWhitespace(c.name) === normalizeWhitespace(canonical) ? updatedClient : c
      );
      out.push({ ...action, data: nextData2 });
      continue;
    }
    if ("ambiguous" in resolved) {
      clarifications.push(clarificationAmbiguousRef(rawName, resolved.ambiguous));
      rejectedActions.push({
        actionType: action.type,
        reason: "ambiguous create_or_update_client name"
      });
      continue;
    }
    const nameTokens = rawName.split(/\s+/).filter(Boolean);
    if (nameTokens.length < 2) {
      clarifications.push(`\u05DE\u05D4 \u05E9\u05DD \u05D4\u05DE\u05E9\u05E4\u05D7\u05D4 \u05E9\u05DC ${rawName}?`);
      rejectedActions.push({
        actionType: action.type,
        reason: "client name must include first and last name"
      });
      continue;
    }
    const synthetic = {
      id: `pending:${rawName}`,
      name: rawName,
      ...action.data.role !== void 0 ? { role: action.data.role } : {},
      ...action.data.lead_source !== void 0 ? { lead_source: action.data.lead_source } : {},
      ...action.data.lead_temperature !== void 0 ? { lead_temperature: action.data.lead_temperature } : {},
      ...action.data.preferences !== void 0 ? { preferences: { ...action.data.preferences } } : {}
    };
    overlay.push(synthetic);
    const nextData = { ...action.data, name: rawName };
    if (action.data.preferences !== void 0) {
      nextData.preferences = action.data.preferences;
    } else {
      delete nextData.preferences;
    }
    out.push({ ...action, data: nextData });
  }
  const afterPropertyLinkage = consolidateListingPatchesFromInteractionAddresses(
    out,
    persistedProperties
  );
  return {
    validActions: afterPropertyLinkage,
    clarifications,
    rejectedActions
  };
}

// src/validation/validateParseResult.ts
function asNonEmptyString2(value) {
  if (typeof value !== "string") {
    return void 0;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : void 0;
}
function asNumber2(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function asStringArray2(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const normalized = value.filter((item) => typeof item === "string").map((item) => item.trim()).filter((item) => item.length > 0);
  if (normalized.length === 0) {
    return void 0;
  }
  return Array.from(new Set(normalized));
}
function normalizeLeadTemperature2(value) {
  if (value === "hot" || value === "warm" || value === "cold" || value === "unknown") {
    return value;
  }
  return void 0;
}
function normalizePreferences(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const preferences = value;
  const normalized = {};
  const city = asNonEmptyString2(preferences.city);
  const areas = asStringArray2(preferences.areas);
  const propertyType = asNonEmptyString2(preferences.property_type);
  const budget = asNumber2(preferences.budget);
  const entryDate = asNonEmptyString2(preferences.entry_date);
  const features = asStringArray2(preferences.features);
  const flexibleEntry = asNonEmptyString2(preferences.flexible_entry);
  if (city) normalized.city = city;
  if (areas) normalized.areas = areas;
  if (propertyType) normalized.property_type = propertyType;
  if (budget !== void 0) normalized.budget = budget;
  if (entryDate) normalized.entry_date = entryDate;
  if (features) normalized.features = features;
  if (flexibleEntry) normalized.flexible_entry = flexibleEntry;
  return Object.keys(normalized).length > 0 ? normalized : void 0;
}
function preferencesSuggestBuyerSearch(prefs) {
  if (!prefs) {
    return false;
  }
  const hasBudget = prefs.budget !== void 0;
  if (!hasBudget) {
    return false;
  }
  const hasLocation = Boolean(prefs.areas?.length || prefs.city?.trim());
  const pt = prefs.property_type ?? "";
  const looksLikeSearchIntent = /חדרים|חדר\s|דירת|דירה\s|penthouse|פנטהאוז|סוג\s+נכס/i.test(pt);
  return hasLocation || looksLikeSearchIntent;
}
function normalizeInteractionPatches(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const rec = item;
    const summary = asNonEmptyString2(rec.summary) ?? asNonEmptyString2(rec.description) ?? asNonEmptyString2(rec.note);
    if (!summary) {
      continue;
    }
    const property_address = asNonEmptyString2(rec.property_address) ?? asNonEmptyString2(rec.property);
    const kind = asNonEmptyString2(rec.kind) ?? asNonEmptyString2(rec.type) ?? asNonEmptyString2(rec.interaction_type);
    const extraProps = asStringArray2(rec.property_addresses);
    out.push({
      summary,
      ...property_address ? { property_address } : {},
      ...extraProps ? { property_addresses: extraProps } : {},
      ...kind ? { kind } : {}
    });
  }
  return out.length > 0 ? out : void 0;
}
function normalizeClientAction2(action) {
  if (action.type !== "create_or_update_client") {
    return null;
  }
  const name = asNonEmptyString2(action.data.name);
  if (!name) {
    return null;
  }
  let role = action.data.role === "buyer" || action.data.role === "owner" || action.data.role === "unknown" ? action.data.role : void 0;
  const preferences = normalizePreferences(action.data.preferences);
  if (!role && preferencesSuggestBuyerSearch(preferences)) {
    role = "buyer";
  }
  const leadSource = asNonEmptyString2(action.data.lead_source);
  const leadTemperature = normalizeLeadTemperature2(action.data.lead_temperature);
  const interactions = normalizeInteractionPatches(action.data.interactions);
  return {
    type: "create_or_update_client",
    data: {
      name,
      ...role ? { role } : {},
      ...leadSource ? { lead_source: leadSource } : {},
      ...leadTemperature ? { lead_temperature: leadTemperature } : {},
      ...preferences ? { preferences } : {},
      ...interactions ? { interactions } : {}
    }
  };
}
function normalizeTaskAction2(action) {
  if (action.type !== "create_task") {
    return null;
  }
  const title = asNonEmptyString2(action.data.title);
  if (!title) {
    return null;
  }
  const dueTime = asNonEmptyString2(action.data.due_time);
  const clientName = asNonEmptyString2(action.data.client_name);
  return {
    type: "create_task",
    data: {
      title,
      ...dueTime ? { due_time: dueTime } : {},
      ...clientName ? { client_name: clientName } : {}
    }
  };
}
function propertyAddressFrom(data) {
  return asNonEmptyString2(data.address) ?? asNonEmptyString2(data.full_address) ?? asNonEmptyString2(data.property_address);
}
function normalizePropertyAction2(action) {
  if (action.type !== "create_or_update_property") {
    return null;
  }
  const raw = action.data;
  const address = propertyAddressFrom(raw);
  if (!address) {
    return null;
  }
  const city = asNonEmptyString2(raw.city);
  const rooms = asNumber2(raw.rooms);
  const features = asStringArray2(raw.features);
  const askingPrice = asNumber2(raw.asking_price);
  const priceNote = asNonEmptyString2(raw.price_note);
  const generalNotes = asNonEmptyString2(raw.general_notes);
  const ownerClientName = asNonEmptyString2(raw.owner_client_name);
  return {
    type: "create_or_update_property",
    data: {
      address,
      ...city ? { city } : {},
      ...rooms !== void 0 ? { rooms } : {},
      ...features ? { features } : {},
      ...askingPrice !== void 0 ? { asking_price: askingPrice } : {},
      ...priceNote ? { price_note: priceNote } : {},
      ...generalNotes ? { general_notes: generalNotes } : {},
      ...ownerClientName ? { owner_client_name: ownerClientName } : {}
    }
  };
}
function taskLikelyNeedsDueWindow(title) {
  return /תזכיר|תזכורת|להזכיר|להיזכר|פולואפ|פולו|לחזור|להתקשר|להשיב|לייעץ|פגישה|פגוש|קבע|זימון|נפגש|דבר עם|שיחה עם|להדבר/i.test(title);
}
function validateParseResult(result) {
  const validActions = [];
  const rejectedActions = [];
  const clarifications = new Set(result.clarification_questions);
  const missingInfo = new Set(result.missing_info);
  for (const action of result.actions) {
    if (action.type === "create_or_update_client") {
      const normalized = normalizeClientAction2(action);
      if (!normalized) {
        missingInfo.add("client_name");
        clarifications.add("\u05DE\u05D4 \u05D4\u05E9\u05DD \u05D4\u05DE\u05DC\u05D0 \u05E9\u05DC \u05D4\u05DC\u05E7\u05D5\u05D7 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05D5 \u05DC\u05E2\u05D3\u05DB\u05DF \u05D0\u05EA \u05DB\u05E8\u05D8\u05D9\u05E1 \u05D4\u05DC\u05E7\u05D5\u05D7?");
        rejectedActions.push({
          actionType: action.type,
          reason: "client name is required"
        });
      } else if (normalized.data.name.trim().split(/\s+/).filter(Boolean).length < 2) {
        missingInfo.add("client_last_name");
        clarifications.add(`\u05DE\u05D4 \u05E9\u05DD \u05D4\u05DE\u05E9\u05E4\u05D7\u05D4 \u05E9\u05DC ${normalized.data.name.trim()}?`);
        rejectedActions.push({
          actionType: action.type,
          reason: "client name must include first and last name"
        });
      } else {
        validActions.push(normalized);
      }
      continue;
    }
    if (action.type === "create_task") {
      const normalized = normalizeTaskAction2(action);
      if (!normalized) {
        missingInfo.add("task_title");
        clarifications.add("\u05DE\u05D4 \u05D1\u05D3\u05D9\u05D5\u05E7 \u05E6\u05E8\u05D9\u05DA \u05DC\u05D1\u05E6\u05E2 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05E9\u05D1\u05D9\u05E7\u05E9\u05EA?");
        rejectedActions.push({
          actionType: action.type,
          reason: "task title is required"
        });
      } else if (!normalized.data.client_name?.trim()) {
        missingInfo.add("task_client_name");
        clarifications.add(
          "\u05E2\u05DC \u05D0\u05D9\u05D6\u05D4 \u05DC\u05E7\u05D5\u05D7 \u05DE\u05D3\u05D5\u05D1\u05E8 \u05DC\u05DE\u05E9\u05D9\u05DE\u05D4? \u05E6\u05E8\u05D9\u05DA \u05E9\u05DD \u05DE\u05DC\u05D0 \u05DB\u05D3\u05D9 \u05DC\u05E9\u05D9\u05D9\u05DA \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05DC\u05D9\u05E9\u05D5\u05EA (\u05DB\u05E8\u05D8\u05D9\u05E1 \u05DC\u05E7\u05D5\u05D7) \u05D1\u05DE\u05E2\u05E8\u05DB\u05EA."
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name is required"
        });
      } else if (!normalized.data.due_time && taskLikelyNeedsDueWindow(normalized.data.title)) {
        missingInfo.add("due_time");
        clarifications.add(
          "\u05DE\u05EA\u05D9 \u05EA\u05E8\u05E6\u05D4 \u05DC\u05D1\u05E6\u05E2 \u05D0\u05EA \u05D4\u05DE\u05E9\u05D9\u05DE\u05D4 \u05D0\u05D5 \u05DC\u05E7\u05D1\u05DC \u05EA\u05D6\u05DB\u05D5\u05E8\u05EA? \u05DE\u05E1\u05E4\u05D9\u05E7 \u05D9\u05D5\u05DD \u05D0\u05D5 \u05DE\u05E9\u05D1\u05E6\u05EA \u05DB\u05DC\u05DC\u05D9\u05EA (\u05D1\u05D5\u05E7\u05E8/\u05E2\u05E8\u05D1); \u05E9\u05E2\u05D4 \u05DE\u05D3\u05D5\u05D9\u05E7\u05EA \u05DC\u05D0 \u05D7\u05D5\u05D1\u05D4."
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
      const normalized = normalizePropertyAction2(action);
      if (!normalized) {
        missingInfo.add("property_address");
        clarifications.add(
          "\u05DE\u05D4\u05D9 \u05D4\u05DB\u05EA\u05D5\u05D1\u05EA \u05D4\u05DE\u05DC\u05D0\u05D4 \u05E9\u05DC \u05D4\u05E0\u05DB\u05E1 (\u05E8\u05D7\u05D5\u05D1 \u05D5\u05DE\u05E1\u05E4\u05E8 \u05D5\u05E2\u05D9\u05E8, \u05DB\u05E4\u05D9 \u05E9\u05E6\u05D9\u05D9\u05E0\u05EA \u05D1\u05E9\u05D9\u05D7\u05D4) \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05E4\u05EA\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1 \u05E0\u05DB\u05E1?"
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

// src/pipeline/runCrmAgent.ts
function sortActionsForEntityLinkage(actions) {
  const rank = (t) => t === "create_or_update_client" ? 0 : t === "create_or_update_property" ? 1 : 2;
  return [...actions].sort((a, b) => rank(a.type) - rank(b.type));
}
async function runCrmAgent(input) {
  const startedAt = Date.now();
  const trace = {
    input: {
      rawMessage: input.rawMessage,
      pipelineInput: input.pipelineInput,
      historyCount: input.historyCount
    },
    timing: {}
  };
  const snapshotText = formatCrmSnapshotForPrompt(getFakeCrmState());
  const augmentedPipelineInput = snapshotText.trim().length > 0 ? `${input.pipelineInput}

### \u05DE\u05E6\u05D1 CRM \u05E0\u05D5\u05DB\u05D7\u05D9 (\u05DE\u05E7\u05D5\u05E8 \u05D0\u05DE\u05EA)
${snapshotText}` : input.pipelineInput;
  const parseStartedAt = Date.now();
  const parsedRaw = await parseMessage(augmentedPipelineInput, {
    debug: true,
    traceInput: {
      userPrompt: augmentedPipelineInput
    }
  });
  const parsed = parsedRaw;
  trace.timing.parseMs = Date.now() - parseStartedAt;
  trace.parser = parsed;
  trace.llm = parsedRaw._debug?.llm;
  const validateStartedAt = Date.now();
  const validationRaw = validateParseResult(parsed);
  validationRaw.validActions = sortActionsForEntityLinkage(validationRaw.validActions);
  trace.timing.validateMs = Date.now() - validateStartedAt;
  const resolveStartedAt = Date.now();
  const crmSnapshot = getFakeCrmState();
  const resolution = resolveAndEnrichCrmActions(
    validationRaw.validActions,
    crmSnapshot.clients,
    crmSnapshot.properties
  );
  trace.timing.resolveMs = Date.now() - resolveStartedAt;
  const validation = {
    ...validationRaw,
    validActions: sortActionsForEntityLinkage(resolution.validActions),
    clarification_questions: Array.from(
      /* @__PURE__ */ new Set([...validationRaw.clarification_questions, ...resolution.clarifications])
    ),
    rejectedActions: [...validationRaw.rejectedActions, ...resolution.rejectedActions]
  };
  trace.validation = {
    validActions: validation.validActions,
    rejectedActions: validation.rejectedActions,
    missingInfo: validation.missing_info,
    clarificationQuestions: validation.clarification_questions
  };
  const clarifyOnly = validation.validActions.length === 0 && validation.clarification_questions.length > 0;
  if (clarifyOnly) {
    const responseStartedAt2 = Date.now();
    const generatedResponse2 = composeUserReply({
      parsed,
      validation,
      executedActions: [],
      executionResults: []
    });
    trace.timing.responseMs = Date.now() - responseStartedAt2;
    trace.timing.totalMs = Date.now() - startedAt;
    trace.response = {
      generatedResponse: generatedResponse2,
      formattedReply: generatedResponse2,
      replyType: "clarification"
    };
    return {
      parsed,
      validActions: validation.validActions,
      executionResults: [],
      response: generatedResponse2,
      trace
    };
  }
  const executeStartedAt = Date.now();
  const executionResults = executeActions(validation.validActions);
  trace.timing.executeMs = Date.now() - executeStartedAt;
  trace.crm = {
    executionResults
  };
  const responseStartedAt = Date.now();
  const generatedResponse = composeUserReply({
    parsed,
    validation,
    executedActions: validation.validActions,
    executionResults
  });
  trace.timing.responseMs = Date.now() - responseStartedAt;
  trace.timing.totalMs = Date.now() - startedAt;
  const replyType = validation.validActions.length > 0 ? "actions" : "fallback";
  trace.response = {
    generatedResponse,
    formattedReply: generatedResponse,
    replyType
  };
  return {
    parsed,
    validActions: validation.validActions,
    executionResults,
    response: generatedResponse,
    trace
  };
}

// src/chat/processDemoChatTurn.ts
async function processDemoChatTurn(normalizedMessage) {
  const prior = getChatTranscriptSnapshot();
  const pipelineInput = buildPipelineInput(normalizedMessage, prior);
  const result = await runCrmAgent({
    rawMessage: normalizedMessage,
    pipelineInput,
    historyCount: prior.length
  });
  appendChatTurns({ role: "user", text: normalizedMessage }, { role: "bot", text: result.response });
  const crmExecutedSuccessfully = result.executionResults.length > 0 && result.executionResults.every((r) => r.success);
  if (crmExecutedSuccessfully) {
    clearChatTranscriptAndRotateSegment();
  }
  return result;
}

// src/transcription/transcribeAudio.ts
import fs from "node:fs";
import OpenAI from "openai";

// src/transcription/cleanupPrompt.ts
var CLEANUP_SYSTEM = `You are a Hebrew text editor fixing automatic speech recognition (ASR) output.

Rules:
- Fix spelling mistakes and common ASR word errors (e.g. homophones) while preserving meaning.
- Improve grammar minimally so the sentence reads naturally in Hebrew.
- Keep meaning EXACTLY the same as the raw transcript. Do not add facts, appointments, names, dates, or details that are not clearly implied by the raw text.
- Do NOT change proper names or transliterations unless fixing an obvious ASR typo for the same entity (same person/place).
- Do NOT invent missing words if audio was unclear\u2014prefer leaving uncertainty reflected in unclear_parts.
- Output MUST be valid JSON only, no markdown, with this shape:
{"cleaned_text":"string","confidence_estimate":number between 0 and 1,"unclear_parts":string[]}

confidence_estimate: your subjective confidence that cleaned_text faithfully matches what was said (not Whisper's score).
unclear_parts: short Hebrew snippets from the raw text that remained ambiguous after cleanup (empty array if none).`;
function userCleanupMessage(rawText) {
  return `Raw ASR transcript (Hebrew):
"""${rawText}"""`;
}

// src/transcription/cleanupResponse.ts
function parseCleanupJson(content, rawFallback) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { cleaned_text: rawFallback, confidence_estimate: 0.5, unclear_parts: [] };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { cleaned_text: rawFallback, confidence_estimate: 0.5, unclear_parts: [] };
  }
  const obj = parsed;
  const cleaned = typeof obj.cleaned_text === "string" && obj.cleaned_text.trim().length > 0 ? obj.cleaned_text.trim() : rawFallback;
  let confidence = Number(obj.confidence_estimate);
  if (!Number.isFinite(confidence)) confidence = 0.75;
  confidence = Math.min(1, Math.max(0, confidence));
  const unclear = Array.isArray(obj.unclear_parts) ? obj.unclear_parts.filter(
    (x) => typeof x === "string" && x.trim().length > 0
  ) : [];
  return { cleaned_text: cleaned, confidence_estimate: confidence, unclear_parts: unclear };
}

// src/transcription/hebrewCorrection.ts
function applyHebrewPostCorrection(rawText, modelCleanedText) {
  const base = String(modelCleanedText || rawText || "").trim();
  if (!base) return "";
  let text = base;
  text = text.replace(/תקווה(?=\s+לי(?:\s|$))/g, "\u05EA\u05E7\u05D1\u05E2");
  text = text.replace(/תיקווה(?=\s+לי(?:\s|$))/g, "\u05EA\u05E7\u05D1\u05E2");
  text = text.replace(/,\s*/g, ", ");
  text = text.replace(/\s{2,}/g, " ").trim();
  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }
  return text;
}

// src/transcription/transcribeAudio.ts
var openaiSingleton = null;
function getOpenAI() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  if (!openaiSingleton) openaiSingleton = new OpenAI({ apiKey: key });
  return openaiSingleton;
}
async function transcribeAndCleanupAudioFile(filePath) {
  const openai = getOpenAI();
  const transcription = await openai.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: "whisper-1",
    language: "he"
  });
  const raw_text = typeof transcription === "string" ? transcription : transcription.text ?? "";
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_CLEANUP_MODEL ?? "gpt-4o",
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: CLEANUP_SYSTEM },
      { role: "user", content: userCleanupMessage(raw_text) }
    ]
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  const { cleaned_text, confidence_estimate, unclear_parts } = parseCleanupJson(content, raw_text);
  const postCorrectedText = applyHebrewPostCorrection(raw_text, cleaned_text);
  return { raw_text, cleaned_text: postCorrectedText, confidence_estimate, unclear_parts };
}

// server/createApp.ts
function createApp() {
  if (!process.env.VERCEL) {
    loadDotenv();
  }
  const app2 = express();
  app2.use(cors());
  app2.use(express.json());
  const api = express.Router();
  api.get("/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  api.get("/crm-demo-state", (_req, res) => {
    res.status(200).json(getDemoCrmState());
  });
  api.post("/crm-demo-reset", (_req, res) => {
    resetDemoCrmStore();
    resetFakeCrm();
    resetChatTranscript();
    res.status(200).json({ ok: true, state: getDemoCrmState() });
  });
  api.post("/chat", async (req, res) => {
    const { message } = req.body ?? {};
    if (typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ reply: "\u05E6\u05E8\u05D9\u05DA \u05D4\u05D5\u05D3\u05E2\u05D4 \u05DB\u05D3\u05D9 \u05E9\u05D0\u05D5\u05DB\u05DC \u05DC\u05E2\u05D6\u05D5\u05E8" });
    }
    const normalizedMessage = message.trim();
    try {
      const result = await processDemoChatTurn(normalizedMessage);
      const reply = result.response;
      const trace = {
        ...result.trace,
        response: result.trace.response ? {
          ...result.trace.response,
          formattedReply: reply
        } : void 0
      };
      return res.json({
        reply,
        trace,
        segmentId: getInternalChatSegmentId()
      });
    } catch (error) {
      const reply = "\u05E7\u05E8\u05D4 \u05DE\u05E9\u05D4\u05D5, \u05E0\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1?";
      const prior = getChatTranscriptSnapshot();
      const trace = {
        input: {
          rawMessage: normalizedMessage,
          pipelineInput: buildPipelineInput(normalizedMessage, prior),
          historyCount: prior.length
        },
        timing: {},
        error: {
          stage: "chat_route",
          message: error instanceof Error ? error.message : "Unknown error"
        },
        response: {
          generatedResponse: reply,
          formattedReply: reply,
          replyType: "fallback"
        }
      };
      return res.status(500).json({ reply, trace, segmentId: getInternalChatSegmentId() });
    }
  });
  const upload = multer({
    storage: multer.diskStorage({
      destination: os.tmpdir(),
      filename(_req, file, cb) {
        const ext = file.originalname ? file.originalname.replace(/.*(\.[^.]+)$/, "$1") : ".webm";
        cb(null, `transcribe-${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
      }
    }),
    limits: { fileSize: 25 * 1024 * 1024 }
  });
  api.post("/voice-chat", upload.single("audio"), async (req, res) => {
    if (!req.file?.path) {
      return res.status(400).json({ error: "Missing audio file (field name: audio)" });
    }
    const filePath = req.file.path;
    try {
      const { cleaned_text } = await transcribeAndCleanupAudioFile(filePath);
      const userMessage = cleaned_text.trim();
      if (!userMessage) {
        return res.status(400).json({ error: "Could not extract text from audio" });
      }
      const result = await processDemoChatTurn(userMessage);
      const reply = result.response;
      const trace = {
        ...result.trace,
        response: result.trace.response ? { ...result.trace.response, formattedReply: reply } : void 0
      };
      return res.json({ reply, trace, segmentId: getInternalChatSegmentId(), userMessage });
    } catch (error) {
      const reply = "\u05E7\u05E8\u05D4 \u05DE\u05E9\u05D4\u05D5, \u05E0\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1?";
      const prior = getChatTranscriptSnapshot();
      const trace = {
        input: {
          rawMessage: "",
          pipelineInput: buildPipelineInput("", prior),
          historyCount: prior.length
        },
        timing: {},
        error: {
          stage: "voice_chat_route",
          message: error instanceof Error ? error.message : "Unknown error"
        },
        response: { generatedResponse: reply, formattedReply: reply, replyType: "fallback" }
      };
      return res.status(500).json({ reply, trace, segmentId: getInternalChatSegmentId() });
    } finally {
      fs2.unlink(filePath, () => {
      });
    }
  });
  app2.use("/api", api);
  return app2;
}

// scripts/vercelApiEntry.ts
var app = createApp();
function handler(req, res) {
  app(
    req,
    res,
    (err) => {
      if (err && !res.headersSent) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : "Internal Server Error");
      }
    }
  );
}
export {
  handler as default
};
