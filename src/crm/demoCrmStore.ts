import { randomUUID } from "node:crypto";
import type { ClientPreferences as ParserPreferences } from "../types/parser";
import type { CreateOrUpdateClientAction, CreateTaskAction } from "../types/parser";

/** Mirrors client `CrmDemoState` JSON shape (Hebrew enums). */
export type DemoClientKind = "קונה" | "מוכר" | "שניהם";

export type DemoClientStatus = "חדש" | "חם" | "קר" | "בטיפול";

export interface DemoStorePreferences {
  city?: string;
  areas?: string[];
  rooms?: number;
  budget?: number;
  features?: string[];
  flexibleEntry?: string;
}

export interface DemoStoreClient {
  id: string;
  name: string;
  phone?: string;
  kind: DemoClientKind;
  status: DemoClientStatus;
  leadSource?: string;
  leadTemperature?: "חם" | "חמים" | "קר" | "לא ידוע";
  preferences: DemoStorePreferences;
  notes?: string;
}

export interface DemoStoreProperty {
  id: string;
  address: string;
  city: string;
  rooms: number;
  price: number;
  ownerClientName: string;
  notes?: string;
}

export type DemoCalendarKind = "פגישה" | "שיחה" | "משימה";

export interface DemoStoreCalendarEntry {
  id: string;
  title: string;
  clientName: string;
  date: string;
  time?: string;
  kind: DemoCalendarKind;
  description?: string;
}

export interface DemoCrmSnapshot {
  clients: DemoStoreClient[];
  properties: DemoStoreProperty[];
  calendar: DemoStoreCalendarEntry[];
}

const clients: DemoStoreClient[] = [];
const properties: DemoStoreProperty[] = [];
const calendar: DemoStoreCalendarEntry[] = [];

function roleToKind(role?: "buyer" | "owner" | "unknown"): DemoClientKind {
  if (role === "owner") {
    return "מוכר";
  }
  if (role === "buyer") {
    return "קונה";
  }
  return "קונה";
}

function leadTemperatureToDemo(
  value?: "hot" | "warm" | "cold" | "unknown"
): "חם" | "חמים" | "קר" | "לא ידוע" | undefined {
  if (value === "hot") {
    return "חם";
  }
  if (value === "warm") {
    return "חמים";
  }
  if (value === "cold") {
    return "קר";
  }
  if (value === "unknown") {
    return "לא ידוע";
  }
  return undefined;
}

function normalizeDemoPreferences(p?: ParserPreferences): DemoStorePreferences {
  if (!p) {
    return {};
  }
  const features = Array.from(
    new Set([...(p.property_type ? [p.property_type] : []), ...(p.features ?? [])])
  );
  return {
    ...(p.city ? { city: p.city } : {}),
    ...(p.areas ? { areas: p.areas } : {}),
    ...(p.budget !== undefined ? { budget: p.budget } : {}),
    ...(features.length > 0 ? { features } : {}),
    ...(p.flexible_entry ? { flexibleEntry: p.flexible_entry } : {})
  };
}

export function getDemoCrmState(): DemoCrmSnapshot {
  return {
    clients: clients.map((c) => ({
      ...c,
      preferences: {
        ...c.preferences,
        ...(c.preferences.features ? { features: [...c.preferences.features] } : {})
      }
    })),
    properties: properties.map((p) => ({ ...p })),
    calendar: calendar.map((e) => ({ ...e }))
  };
}

export function resetDemoCrmStore(): void {
  clients.length = 0;
  properties.length = 0;
  calendar.length = 0;
}

/** Called after fake CRM executes create_or_update_client */
export function recordPipelineClientUpsert(
  data: CreateOrUpdateClientAction["data"],
  entityId: string,
  _operation: "created" | "updated"
): void {
  const idx = clients.findIndex((c) => c.name === data.name);
  const kind = roleToKind(data.role);
  const preferences = normalizeDemoPreferences(data.preferences);

  if (idx >= 0) {
    const prev = clients[idx]!;
    clients[idx] = {
      ...prev,
      id: entityId,
      kind,
      leadSource: data.lead_source ?? prev.leadSource,
      leadTemperature: leadTemperatureToDemo(data.lead_temperature) ?? prev.leadTemperature,
      preferences: { ...prev.preferences, ...preferences },
      status: prev.status === "חדש" ? "בטיפול" : prev.status
    };
    return;
  }

  clients.push({
    id: entityId,
    name: data.name,
    kind,
    status: "חדש",
    leadSource: data.lead_source,
    leadTemperature: leadTemperatureToDemo(data.lead_temperature),
    preferences,
    notes: undefined
  });
}

/** Called after fake CRM executes create_task → appears as יומן entry */
export function recordPipelineTask(data: CreateTaskAction["data"], entityId: string): void {
  calendar.unshift({
    id: entityId || randomUUID(),
    title: data.title,
    clientName: data.client_name ?? "",
    date: data.due_time?.trim() ? data.due_time.trim() : "ללא תאריך יעד",
    kind: "משימה",
    description: undefined
  });
}
