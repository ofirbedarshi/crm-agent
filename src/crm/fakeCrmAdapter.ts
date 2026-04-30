import type { CreateOrUpdateClientAction, CreateTaskAction } from "../types/parser";

export interface FakeClient {
  id: string;
  name: string;
  role?: "buyer" | "owner" | "unknown";
  preferences?: {
    city?: string;
    property_type?: string;
    budget?: number;
    entry_date?: string;
  };
}

export interface FakeTask {
  id: string;
  title: string;
  due_time?: string;
  client_name?: string;
}

const clients = new Map<string, FakeClient>();
const tasks: FakeTask[] = [];
let clientCounter = 1;
let taskCounter = 1;

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
  clientCounter = 1;
  taskCounter = 1;
}

export function createOrUpdateClient(data: CreateOrUpdateClientAction["data"]): FakeClient {
  const existing = clients.get(data.name);
  if (existing) {
    const updated: FakeClient = {
      ...existing,
      role: data.role ?? existing.role,
      preferences: data.preferences ?? existing.preferences
    };
    clients.set(data.name, updated);
    return updated;
  }

  const created: FakeClient = {
    id: nextClientId(),
    name: data.name,
    ...(data.role ? { role: data.role } : {}),
    ...(data.preferences ? { preferences: data.preferences } : {})
  };
  clients.set(data.name, created);
  return created;
}

export function createTask(data: CreateTaskAction["data"]): FakeTask {
  const task: FakeTask = {
    id: nextTaskId(),
    title: data.title,
    ...(data.due_time ? { due_time: data.due_time } : {}),
    ...(data.client_name ? { client_name: data.client_name } : {})
  };
  tasks.push(task);
  return task;
}

export function getFakeCrmState(): { clients: FakeClient[]; tasks: FakeTask[] } {
  return {
    clients: Array.from(clients.values()),
    tasks: [...tasks]
  };
}
