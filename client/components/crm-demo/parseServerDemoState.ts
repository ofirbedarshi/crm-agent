import type {
  CalendarEntryKind,
  ClientKind,
  ClientPreferences,
  ClientStatus,
  CrmDemoState,
  DemoCalendarEntry,
  DemoClient,
  DemoProperty
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isClientKind(x: unknown): x is ClientKind {
  return x === "קונה" || x === "מוכר" || x === "שניהם";
}

function isClientStatus(x: unknown): x is ClientStatus {
  return x === "חדש" || x === "חם" || x === "קר" || x === "בטיפול";
}

function isCalendarKind(x: unknown): x is CalendarEntryKind {
  return x === "פגישה" || x === "שיחה" || x === "משימה";
}

function parsePreferences(value: unknown): ClientPreferences {
  if (!isRecord(value)) {
    return {};
  }
  const city = asString(value.city);
  const rooms = asNumber(value.rooms);
  const budget = asNumber(value.budget);
  const features = Array.isArray(value.features)
    ? value.features.filter((x): x is string => typeof x === "string")
    : undefined;
  const areas = Array.isArray(value.areas)
    ? value.areas.filter((x): x is string => typeof x === "string")
    : undefined;
  const flexibleEntry = asString(value.flexibleEntry);
  const prefs: ClientPreferences = {};
  if (city) {
    prefs.city = city;
  }
  if (rooms !== undefined) {
    prefs.rooms = rooms;
  }
  if (budget !== undefined) {
    prefs.budget = budget;
  }
  if (features && features.length > 0) {
    prefs.features = features;
  }
  if (areas && areas.length > 0) {
    prefs.areas = areas;
  }
  if (flexibleEntry) {
    prefs.flexibleEntry = flexibleEntry;
  }
  return prefs;
}

function parseClient(value: unknown): DemoClient | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asString(value.id);
  const name = asString(value.name);
  const kind = value.kind;
  const status = value.status;
  if (!id || !name || !isClientKind(kind) || !isClientStatus(status)) {
    return null;
  }
  const phone = asString(value.phone);
  const notes = asString(value.notes);
  const leadSource = asString(value.leadSource);
  const leadTemperatureRaw = value.leadTemperature;
  const leadTemperature =
    leadTemperatureRaw === "חם" ||
    leadTemperatureRaw === "חמים" ||
    leadTemperatureRaw === "קר" ||
    leadTemperatureRaw === "לא ידוע"
      ? leadTemperatureRaw
      : undefined;
  return {
    id,
    name,
    ...(phone ? { phone } : {}),
    kind,
    status,
    ...(leadSource ? { leadSource } : {}),
    ...(leadTemperature ? { leadTemperature } : {}),
    preferences: parsePreferences(value.preferences),
    ...(notes ? { notes } : {})
  };
}

function parseProperty(value: unknown): DemoProperty | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asString(value.id);
  const address = asString(value.address);
  const city = asString(value.city);
  const rooms = asNumber(value.rooms);
  const price = asNumber(value.price);
  const ownerClientName = asString(value.ownerClientName);
  if (!id || !address || !city || rooms === undefined || price === undefined || !ownerClientName) {
    return null;
  }
  const notes = asString(value.notes);
  return {
    id,
    address,
    city,
    rooms,
    price,
    ownerClientName,
    ...(notes ? { notes } : {})
  };
}

function parseCalendarEntry(value: unknown): DemoCalendarEntry | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = asString(value.id);
  const title = asString(value.title);
  const clientRaw = value.clientName;
  const clientName = typeof clientRaw === "string" ? clientRaw : undefined;
  const date = asString(value.date);
  const kind = value.kind;
  if (!id || !title || clientName === undefined || !date || !isCalendarKind(kind)) {
    return null;
  }
  const time = asString(value.time);
  const description = asString(value.description);
  return {
    id,
    title,
    clientName,
    date,
    kind,
    ...(time ? { time } : {}),
    ...(description ? { description } : {})
  };
}

export function emptyCrmDemoState(): CrmDemoState {
  return { clients: [], properties: [], calendar: [] };
}

export function parseServerDemoPayload(raw: unknown): CrmDemoState {
  if (!isRecord(raw)) {
    return emptyCrmDemoState();
  }
  const clients = Array.isArray(raw.clients)
    ? raw.clients.map(parseClient).filter((c): c is DemoClient => c !== null)
    : [];
  const properties = Array.isArray(raw.properties)
    ? raw.properties.map(parseProperty).filter((p): p is DemoProperty => p !== null)
    : [];
  const calendar = Array.isArray(raw.calendar)
    ? raw.calendar.map(parseCalendarEntry).filter((e): e is DemoCalendarEntry => e !== null)
    : [];
  return { clients, properties, calendar };
}
