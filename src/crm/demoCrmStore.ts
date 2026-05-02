import { randomUUID } from "node:crypto";
import type { ClientInteractionPatch, ClientPreferences as ParserPreferences } from "../types/parser";
import type {
  CreateOrUpdateClientAction,
  CreateOrUpdatePropertyAction,
  CreateTaskAction
} from "../types/parser";

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

export interface DemoStoreInteraction {
  id: string;
  summary: string;
  kind?: string;
  /** All listing address tokens tied to this touch (primary + extras). */
  propertyAddresses?: string[];
  recordedAt: string;
  /** Task rows from the same pipeline batch, linked after `recordPipelineTask`. */
  relatedTaskIds?: string[];
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
  interactions?: DemoStoreInteraction[];
}

export interface DemoStoreProperty {
  id: string;
  address: string;
  city: string;
  rooms: number;
  price: number;
  ownerClientName: string;
  notes?: string;
  priceNote?: string;
  generalNotes?: string;
  features?: string[];
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

function formatDemoInteractionTime(): string {
  return new Date().toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function combinedInteractionAddresses(patch: ClientInteractionPatch): string[] {
  const raw = [
    patch.property_address?.trim(),
    ...(patch.property_addresses ?? []).map((x) => x.trim()).filter(Boolean)
  ].filter(Boolean) as string[];
  return [...new Set(raw)];
}

function appendDemoInteractions(
  prev: DemoStoreInteraction[] | undefined,
  patches: ClientInteractionPatch[] | undefined
): DemoStoreInteraction[] | undefined {
  if (!patches?.length) {
    return prev;
  }
  const base = prev ?? [];
  const added = patches.map((p) => {
    const props = combinedInteractionAddresses(p);
    return {
      id: randomUUID(),
      summary: p.summary.trim(),
      recordedAt: formatDemoInteractionTime(),
      ...(p.kind?.trim() ? { kind: p.kind.trim() } : {}),
      ...(props.length > 0 ? { propertyAddresses: props } : {})
    };
  });
  return [...base, ...added];
}

function normalizeDemoName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Link calendar task id to the most recent interaction on that client (same execute batch). */
function attachTaskIdToLatestInteraction(clientName: string, taskId: string): void {
  const key = normalizeDemoName(clientName);
  if (!key) {
    return;
  }
  const idx = clients.findIndex((c) => normalizeDemoName(c.name) === key);
  if (idx < 0) {
    return;
  }
  const row = clients[idx]!;
  const ix = row.interactions;
  if (!ix?.length) {
    return;
  }
  const lastPos = ix.length - 1;
  const last = ix[lastPos]!;
  const relatedTaskIds = [...(last.relatedTaskIds ?? []), taskId];
  const nextIx = [...ix.slice(0, lastPos), { ...last, relatedTaskIds }];
  clients[idx] = { ...row, interactions: nextIx };
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
      ...(c.interactions ? { interactions: c.interactions.map((i) => ({ ...i })) } : {}),
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
    const mergedInteractions = appendDemoInteractions(prev.interactions, data.interactions);
    clients[idx] = {
      ...prev,
      id: entityId,
      kind,
      leadSource: data.lead_source ?? prev.leadSource,
      leadTemperature: leadTemperatureToDemo(data.lead_temperature) ?? prev.leadTemperature,
      preferences: { ...prev.preferences, ...preferences },
      status: prev.status === "חדש" ? "בטיפול" : prev.status,
      ...(mergedInteractions !== undefined ? { interactions: mergedInteractions } : {})
    };
    return;
  }

  const mergedInteractions = appendDemoInteractions(undefined, data.interactions);
  clients.push({
    id: entityId,
    name: data.name,
    kind,
    status: "חדש",
    leadSource: data.lead_source,
    leadTemperature: leadTemperatureToDemo(data.lead_temperature),
    preferences,
    notes: undefined,
    ...(mergedInteractions !== undefined ? { interactions: mergedInteractions } : {})
  });
}

/** Called after fake CRM executes create_task → appears as יומן entry */
export function recordPipelineTask(data: CreateTaskAction["data"], entityId: string): void {
  const id = entityId || randomUUID();
  calendar.unshift({
    id,
    title: data.title,
    clientName: data.client_name ?? "",
    date: data.due_time?.trim() ? data.due_time.trim() : "ללא תאריך יעד",
    kind: "משימה",
    description: undefined
  });
  const cn = data.client_name?.trim();
  if (cn) {
    attachTaskIdToLatestInteraction(cn, id);
  }
}

function mergeDemoPropertyRollup(prevRollup: string | undefined, nextParts: string[]): string | undefined {
  const joined = nextParts.filter(Boolean).join(" · ");
  if (!joined) {
    return prevRollup;
  }
  if (!prevRollup?.trim()) {
    return joined;
  }
  if (prevRollup.includes(joined)) {
    return prevRollup;
  }
  return `${prevRollup} · ${joined}`;
}

/** Called after fake CRM executes create_or_update_property */
export function recordPipelineProperty(data: CreateOrUpdatePropertyAction["data"], entityId: string): void {
  const city = data.city?.trim() ?? "";
  const rooms = data.rooms ?? 0;
  const price = data.asking_price ?? 0;
  const ownerClientName = data.owner_client_name?.trim() ?? "";

  const rollupParts: string[] = [];
  if (data.price_note) {
    rollupParts.push(`מחיר: ${data.price_note}`);
  }
  if (data.general_notes) {
    rollupParts.push(data.general_notes);
  }

  const addrTrim = data.address.trim();
  const existingIdx = properties.findIndex((p) => p.address.trim() === addrTrim);

  if (existingIdx >= 0) {
    const prev = properties[existingIdx]!;
    const mergedRollup = mergeDemoPropertyRollup(prev.notes, rollupParts);
    properties[existingIdx] = {
      ...prev,
      id: entityId,
      ...(data.city?.trim() ? { city: data.city.trim() } : {}),
      ...(data.rooms !== undefined ? { rooms: data.rooms } : {}),
      ...(data.asking_price !== undefined ? { price: data.asking_price } : {}),
      ...(ownerClientName ? { ownerClientName } : {}),
      ...(mergedRollup ? { notes: mergedRollup } : {}),
      ...(data.price_note
        ? { priceNote: prev.priceNote ? `${prev.priceNote} · ${data.price_note}` : data.price_note }
        : {}),
      ...(data.general_notes
        ? {
            generalNotes: prev.generalNotes
              ? `${prev.generalNotes}\n${data.general_notes}`
              : data.general_notes
          }
        : {}),
      ...(data.features && data.features.length > 0 ? { features: [...data.features] } : {})
    };
    return;
  }

  properties.unshift({
    id: entityId,
    address: addrTrim,
    city,
    rooms,
    price,
    ...(ownerClientName ? { ownerClientName } : {}),
    ...(rollupParts.length > 0 ? { notes: rollupParts.join(" · ") } : {}),
    ...(data.price_note ? { priceNote: data.price_note } : {}),
    ...(data.general_notes ? { generalNotes: data.general_notes } : {}),
    ...(data.features && data.features.length > 0 ? { features: [...data.features] } : {})
  });
}
