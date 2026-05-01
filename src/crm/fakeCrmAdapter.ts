import { randomUUID } from "node:crypto";
import type { CreateOrUpdateClientAction, CreateTaskAction } from "../types/parser";

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
}

export interface FakeTask {
  id: string;
  title: string;
  due_time?: string;
  client_name?: string;
}

export interface FakeActivityEntry {
  id: string;
  description: string;
  time: string;
}

function mergePreferences(
  existing: FakeClient["preferences"] | undefined,
  patch: CreateOrUpdateClientAction["data"]["preferences"] | undefined
): FakeClient["preferences"] | undefined {
  if (!existing && !patch) {
    return undefined;
  }
  if (!existing) {
    return patch;
  }
  if (!patch) {
    return existing;
  }

  const merged: NonNullable<FakeClient["preferences"]> = {
    ...existing,
    ...patch
  };

  if (patch.areas === undefined) {
    merged.areas = existing.areas;
  }
  if (patch.features === undefined) {
    merged.features = existing.features;
  }
  if (patch.city === undefined) {
    merged.city = existing.city;
  }
  if (patch.property_type === undefined) {
    merged.property_type = existing.property_type;
  }
  if (patch.budget === undefined) {
    merged.budget = existing.budget;
  }
  if (patch.entry_date === undefined) {
    merged.entry_date = existing.entry_date;
  }
  if (patch.flexible_entry === undefined) {
    merged.flexible_entry = existing.flexible_entry;
  }

  return merged;
}

const clients = new Map<string, FakeClient>();
const tasks: FakeTask[] = [];
const activityLog: FakeActivityEntry[] = [];
let clientCounter = 1;
let taskCounter = 1;

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

export function resetFakeCrm(): void {
  clients.clear();
  tasks.length = 0;
  activityLog.length = 0;
  clientCounter = 1;
  taskCounter = 1;
}

export type ClientUpsertOperation = "created" | "updated";

export interface ClientUpsertResult {
  client: FakeClient;
  operation: ClientUpsertOperation;
}

export function createOrUpdateClient(data: CreateOrUpdateClientAction["data"]): ClientUpsertResult {
  const existing = clients.get(data.name);
  if (existing) {
    const updated: FakeClient = {
      ...existing,
      role: data.role ?? existing.role,
      lead_source: data.lead_source ?? existing.lead_source,
      lead_temperature: data.lead_temperature ?? existing.lead_temperature,
      preferences: mergePreferences(existing.preferences, data.preferences)
    };
    clients.set(data.name, updated);
    appendActivity(`עודכן לקוח: ${data.name}`);
    return { client: updated, operation: "updated" };
  }

  const created: FakeClient = {
    id: nextClientId(),
    name: data.name,
    ...(data.role ? { role: data.role } : {}),
    ...(data.lead_source ? { lead_source: data.lead_source } : {}),
    ...(data.lead_temperature ? { lead_temperature: data.lead_temperature } : {}),
    ...(data.preferences ? { preferences: data.preferences } : {})
  };
  clients.set(data.name, created);
  appendActivity(`נוצר לקוח חדש: ${data.name}`);
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

export function getFakeCrmState(): {
  clients: FakeClient[];
  tasks: FakeTask[];
  activityLog: FakeActivityEntry[];
} {
  return {
    clients: Array.from(clients.values()),
    tasks: [...tasks],
    activityLog: [...activityLog]
  };
}
