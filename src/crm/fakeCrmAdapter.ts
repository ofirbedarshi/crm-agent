import { randomUUID } from "node:crypto";
import type {
  ClientInteraction,
  ClientInteractionPatch,
  CreateOrUpdateClientAction,
  CreateOrUpdatePropertyAction,
  CreateTaskAction
} from "../types/parser";
import { mergeClientPreferences } from "./mergeClientPreferences";

export interface FakeClient {
  id: string;
  name: string;
  role?: "buyer" | "owner" | "unknown";
  lead_source?: string;
  lead_temperature?: "hot" | "warm" | "cold" | "unknown";
  preferences?: {
    city?: string;
    areas?: string[];
    property_type?: string;
    budget?: number;
    entry_date?: string;
    features?: string[];
    flexible_entry?: string;
  };
  /** Timeline of touches (newest appended by upsert batches). */
  interactions?: ClientInteraction[];
}

export interface FakeTask {
  id: string;
  title: string;
  due_time?: string;
  client_name?: string;
}

export interface FakeProperty {
  id: string;
  address: string;
  city?: string;
  rooms?: number;
  features?: string[];
  asking_price?: number;
  price_note?: string;
  general_notes?: string;
  owner_client_name?: string;
}

export interface FakeActivityEntry {
  id: string;
  description: string;
  time: string;
}

const clients = new Map<string, FakeClient>();
const tasks: FakeTask[] = [];
const properties: FakeProperty[] = [];
const activityLog: FakeActivityEntry[] = [];
let clientCounter = 1;
let taskCounter = 1;
let propertyCounter = 1;

function formatActivityTime(): string {
  return new Date().toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function appendActivity(description: string): void {
  activityLog.unshift({
    id: randomUUID(),
    description,
    time: formatActivityTime()
  });
}

function normalizePropertyAddress(addr: string): string {
  return addr.trim().replace(/\s+/g, " ");
}

function mergePropertyNote(prev: string | undefined, next: string | undefined): string | undefined {
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
  return `${p}\n${n}`;
}

function appendClientInteractionRecords(
  existing: ClientInteraction[] | undefined,
  patches: ClientInteractionPatch[] | undefined
): ClientInteraction[] | undefined {
  if (!patches?.length) {
    return existing;
  }
  const base = existing ?? [];
  const added: ClientInteraction[] = patches.map((p) => ({
    id: randomUUID(),
    recorded_at: formatActivityTime(),
    summary: p.summary.trim(),
    ...(p.property_address?.trim() ? { property_address: p.property_address.trim() } : {}),
    ...(p.property_addresses && p.property_addresses.length > 0
      ? { property_addresses: [...p.property_addresses] }
      : {}),
    ...(p.kind?.trim() ? { kind: p.kind.trim() } : {})
  }));
  return [...base, ...added];
}

function nextClientId(): string {
  const id = `client_${String(clientCounter).padStart(4, "0")}`;
  clientCounter += 1;
  return id;
}

function nextTaskId(): string {
  const id = `task_${String(taskCounter).padStart(4, "0")}`;
  taskCounter += 1;
  return id;
}

function nextPropertyId(): string {
  const id = `property_${String(propertyCounter).padStart(4, "0")}`;
  propertyCounter += 1;
  return id;
}

export function resetFakeCrm(): void {
  clients.clear();
  tasks.length = 0;
  properties.length = 0;
  activityLog.length = 0;
  clientCounter = 1;
  taskCounter = 1;
  propertyCounter = 1;
}

export type ClientUpsertOperation = "created" | "updated";

export interface ClientUpsertResult {
  client: FakeClient;
  operation: ClientUpsertOperation;
}

export function createOrUpdateClient(data: CreateOrUpdateClientAction["data"]): ClientUpsertResult {
  const existing = clients.get(data.name);
  const mergedInteractions = appendClientInteractionRecords(existing?.interactions, data.interactions);
  if (existing) {
    const updated: FakeClient = {
      ...existing,
      role: data.role ?? existing.role,
      lead_source: data.lead_source ?? existing.lead_source,
      lead_temperature: data.lead_temperature ?? existing.lead_temperature,
      preferences: mergeClientPreferences(existing.preferences, data.preferences),
      ...(mergedInteractions !== undefined ? { interactions: mergedInteractions } : {})
    };
    clients.set(data.name, updated);
    appendActivity(`עודכן לקוח: ${data.name}`);
    if (data.interactions?.length) {
      appendActivity(`נוספה אינטרקציה ללקוח ${data.name}`);
    }
    return { client: updated, operation: "updated" };
  }

  const created: FakeClient = {
    id: nextClientId(),
    name: data.name,
    ...(data.role ? { role: data.role } : {}),
    ...(data.lead_source ? { lead_source: data.lead_source } : {}),
    ...(data.lead_temperature ? { lead_temperature: data.lead_temperature } : {}),
    ...(data.preferences ? { preferences: data.preferences } : {}),
    ...(mergedInteractions !== undefined ? { interactions: mergedInteractions } : {})
  };
  clients.set(data.name, created);
  appendActivity(`נוצר לקוח חדש: ${data.name}`);
  if (data.interactions?.length) {
    appendActivity(`נוספה אינטרקציה ללקוח ${data.name}`);
  }
  return { client: created, operation: "created" };
}

export function createTask(data: CreateTaskAction["data"]): FakeTask {
  const task: FakeTask = {
    id: nextTaskId(),
    title: data.title,
    ...(data.due_time ? { due_time: data.due_time } : {}),
    ...(data.client_name ? { client_name: data.client_name } : {})
  };
  tasks.push(task);
  const clientPart = data.client_name ? ` עבור ${data.client_name}` : "";
  const duePart = data.due_time ? ` (${data.due_time})` : "";
  appendActivity(`נוצרה משימה${clientPart}: ${data.title}${duePart}`);
  return task;
}

export function createOrUpdateProperty(data: CreateOrUpdatePropertyAction["data"]): FakeProperty {
  const addrNorm = normalizePropertyAddress(data.address);
  const existingIdx = properties.findIndex((p) => normalizePropertyAddress(p.address) === addrNorm);

  if (existingIdx >= 0) {
    const prev = properties[existingIdx]!;
    const merged: FakeProperty = {
      ...prev,
      ...(data.city?.trim() ? { city: data.city.trim() } : {}),
      ...(data.rooms !== undefined ? { rooms: data.rooms } : {}),
      ...(data.features && data.features.length > 0 ? { features: [...data.features] } : {}),
      ...(data.asking_price !== undefined ? { asking_price: data.asking_price } : {}),
      price_note: mergePropertyNote(prev.price_note, data.price_note),
      general_notes: mergePropertyNote(prev.general_notes, data.general_notes),
      ...(data.owner_client_name?.trim() ? { owner_client_name: data.owner_client_name.trim() } : {})
    };
    properties[existingIdx] = merged;
    const ownerPart = data.owner_client_name ? ` · בעלים: ${data.owner_client_name}` : "";
    appendActivity(`עודכן נכס: ${data.address.trim()}${ownerPart}`);
    return merged;
  }

  const prop: FakeProperty = {
    id: nextPropertyId(),
    address: data.address.trim(),
    ...(data.city ? { city: data.city.trim() } : {}),
    ...(data.rooms !== undefined ? { rooms: data.rooms } : {}),
    ...(data.features && data.features.length > 0 ? { features: [...data.features] } : {}),
    ...(data.asking_price !== undefined ? { asking_price: data.asking_price } : {}),
    ...(data.price_note ? { price_note: data.price_note } : {}),
    ...(data.general_notes ? { general_notes: data.general_notes } : {}),
    ...(data.owner_client_name ? { owner_client_name: data.owner_client_name.trim() } : {})
  };
  properties.push(prop);
  const ownerPart = data.owner_client_name ? ` · בעלים: ${data.owner_client_name}` : "";
  appendActivity(`נוצר נכס: ${data.address}${ownerPart}`);
  return prop;
}

export function getFakeCrmState(): {
  clients: FakeClient[];
  tasks: FakeTask[];
  properties: FakeProperty[];
  activityLog: FakeActivityEntry[];
} {
  return {
    clients: Array.from(clients.values()),
    tasks: [...tasks],
    properties: properties.map((p) => ({ ...p, ...(p.features ? { features: [...p.features] } : {}) })),
    activityLog: [...activityLog]
  };
}
