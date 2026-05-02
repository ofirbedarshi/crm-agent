import type { DemoCrmSnapshot } from "../crm/demoCrmStore";
import type { FakeActivityEntry, FakeClient, FakeProperty, FakeTask } from "../crm/fakeCrmAdapter";
import type { RunCrmAgentResult } from "../pipeline/runCrmAgent";

export type PipelineStoryContext = {
  result: RunCrmAgentResult;
  fakeCrm: {
    clients: FakeClient[];
    tasks: FakeTask[];
    properties: FakeProperty[];
    activityLog: FakeActivityEntry[];
  };
  demoCrm: DemoCrmSnapshot;
};

function fail(message: string): never {
  throw new Error(message);
}

function near(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    fail(`${label}: expected ~${expected} (±${tolerance}), got ${actual}`);
  }
}

/** Mocked pipeline: exact structure (Vitest). */
export function assertUs001PipelineStrict(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length !== 3) {
    fail(`US-001 strict: expected 3 validActions, got ${result.validActions.length}`);
  }
  if (result.executionResults.length !== 3) {
    fail(`US-001 strict: expected 3 executionResults, got ${result.executionResults.length}`);
  }
  if (crm.clients.length !== 1) {
    fail(`US-001 strict: expected 1 client, got ${crm.clients.length}`);
  }

  const client = crm.clients[0]!;
  if (client.name !== "דניאל לוי") fail(`US-001: client name`);
  if (client.role !== "buyer") fail(`US-001: role`);
  if (client.lead_source !== "פייסבוק") fail(`US-001: lead_source`);
  if (client.lead_temperature !== "warm") fail(`US-001: lead_temperature`);

  const areas = client.preferences?.areas ?? [];
  for (const a of ["גבעתיים", "רמת גן"] as const) {
    if (!areas.includes(a)) fail(`US-001: missing area ${a}`);
  }
  if (client.preferences?.property_type !== "דירת 4 חדרים") fail(`US-001: property_type`);
  if (client.preferences?.budget !== 3_400_000) fail(`US-001: budget`);
  const feats = client.preferences?.features ?? [];
  if (!feats.includes("מעלית") || !feats.includes("חניה")) fail(`US-001: features`);
  if (client.preferences?.flexible_entry !== "עד חצי שנה") fail(`US-001: flexible_entry`);

  if (crm.tasks.length !== 2) fail(`US-001: tasks count`);
  const titles = crm.tasks.map((t) => t.title);
  if (!titles.includes("לשלוח לדניאל לוי שלוש אופציות בערב")) fail(`US-001: task1 title`);
  if (!titles.includes("לחזור לדניאל לוי מחר ב־11")) fail(`US-001: task2 title`);
  if (crm.tasks.find((t) => t.title.includes("לחזור"))?.due_time !== "מחר ב־11") {
    fail(`US-001: follow-up due_time`);
  }

  if (ctx.demoCrm.clients.length !== 1) fail(`US-001: demo clients`);
  if (!result.response.includes("יצרתי כרטיס לקוח")) fail(`US-001: reply client`);
  if (!result.response.includes("יצרתי משימה")) fail(`US-001: reply task`);
  if (result.trace.response?.replyType !== "actions") fail(`US-001: replyType`);
}

/** Live LLM: same intent, tolerant Hebrew / field variance. */
export function assertUs001PipelineLive(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length < 3) {
    fail(
      `US-001 live: expected at least 3 validActions (client + 2 tasks), got ${result.validActions.length}. Clarification? ${result.response.slice(0, 200)}`
    );
  }

  const types = result.validActions.map((a) => a.type);
  const clientCount = types.filter((t) => t === "create_or_update_client").length;
  const taskCount = types.filter((t) => t === "create_task").length;
  if (clientCount !== 1) fail(`US-001 live: expected 1 create_or_update_client, got ${clientCount}`);
  if (taskCount < 2) fail(`US-001 live: expected at least 2 create_task, got ${taskCount}`);

  const client = crm.clients.find((c) => c.name.includes("דניאל") && c.name.includes("לוי"));
  if (!client) fail(`US-001 live: no client resembling דניאל לוי`);

  // Model often omits role despite buyer intent; fake CRM leaves role unset unless emitted.
  if (client.role !== undefined && client.role !== "buyer") {
    fail(`US-001 live: expected buyer role (or omit), got ${client.role}`);
  }
  near(client.preferences?.budget ?? 0, 3_400_000, 150_000, "US-001 live: budget");

  const areas = client.preferences?.areas ?? [];
  const areaText = [client.preferences?.city, ...areas].filter(Boolean).join(" ");
  if (!areaText.includes("גבעתיים")) fail(`US-001 live: expected גבעתיים in areas/city`);
  if (!areaText.includes("רמת גן")) fail(`US-001 live: expected רמת גן in areas/city`);

  const feats = (client.preferences?.features ?? []).join(" ");
  const allClient = JSON.stringify(client.preferences ?? {});
  if (!allClient.includes("מעלית") && !feats.includes("מעלית")) {
    fail(`US-001 live: expected מעלית in preferences`);
  }
  if (!allClient.includes("חניה") && !feats.includes("חניה")) fail(`US-001 live: expected חניה`);

  if (crm.tasks.length < 2) fail(`US-001 live: expected at least 2 tasks`);

  const taskBlob = crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" | ");
  if (!/מחר|11|אחזור|לחזור/i.test(taskBlob)) {
    fail(`US-001 live: expected follow-up hint (מחר / 11 / לחזור) in tasks`);
  }
  if (!/אופציות|שלוש|שליחה|הצעות|ערב/i.test(taskBlob)) {
    fail(`US-001 live: expected sending options / evening commitment in tasks`);
  }

  if (result.trace.response?.replyType !== "actions") {
    fail(`US-001 live: expected actions reply, got ${result.trace.response?.replyType}`);
  }
}

/** Mocked pipeline: exact structure (Vitest). */
export function assertUs002PipelineStrict(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length !== 3) {
    fail(`US-002 strict: expected 3 validActions, got ${result.validActions.length}`);
  }
  if (result.executionResults.length !== 3) fail(`US-002 strict: executionResults`);
  if (crm.clients.length !== 1) fail(`US-002 strict: clients`);
  if (crm.properties.length !== 1) fail(`US-002 strict: properties`);
  if (crm.tasks.length !== 1) fail(`US-002 strict: tasks`);

  const client = crm.clients[0]!;
  if (client.name !== "מיכל כהן") fail(`US-002: name`);
  if (client.role !== "owner") fail(`US-002: owner`);
  if (client.preferences?.budget !== 2_850_000) fail(`US-002: budget`);
  if (Object.keys(client.preferences ?? {}).join(",") !== "budget") fail(`US-002: prefs keys`);

  const prop = crm.properties[0]!;
  if (prop.address !== "ביאליק 23") fail(`US-002: address`);
  if (prop.city !== "רמת גן") fail(`US-002: city`);
  if (prop.rooms !== 3.5) fail(`US-002: rooms`);
  if (!(prop.features ?? []).includes("חניה בטאבו")) fail(`US-002: features חניה בטאבו`);
  if (prop.asking_price !== 2_850_000) fail(`US-002: asking_price`);
  if (!prop.price_note?.includes("מחיר שוק")) fail(`US-002: price_note`);
  if (!prop.general_notes?.includes("בלעדיות")) fail(`US-002: general_notes`);

  if (crm.tasks[0]?.due_time !== "יום חמישי אחר הצהריים") fail(`US-002: due`);

  const demoProp = ctx.demoCrm.properties[0];
  if (!demoProp?.priceNote?.includes("מחיר שוק")) fail(`US-002: demo priceNote`);
  if (!demoProp?.generalNotes?.includes("בלעדיות")) fail(`US-002: demo generalNotes`);

  if (!result.response.includes("יצרתי כרטיס לקוח")) fail(`US-002: reply`);
  if (!result.response.includes("יצרתי כרטיס נכס")) fail(`US-002: reply property`);
  if (!result.response.includes("יצרתי משימה")) fail(`US-002: reply task`);
  if (result.trace.response?.replyType !== "actions") fail(`US-002: replyType`);
}

/** Live LLM: require seller client + property + meeting task (tolerates wording). */
export function assertUs002PipelineLive(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length < 3) {
    fail(
      `US-002 live: need client + property + task (${result.validActions.length} actions). Snippet: ${result.response.slice(0, 280)}`
    );
  }

  const clientActs = result.validActions.filter((a) => a.type === "create_or_update_client");
  const propActs = result.validActions.filter((a) => a.type === "create_or_update_property");
  const taskActs = result.validActions.filter((a) => a.type === "create_task");

  if (clientActs.length < 1) fail(`US-002 live: missing create_or_update_client (seller)`);
  if (propActs.length < 1) fail(`US-002 live: missing create_or_update_property`);
  if (taskActs.length < 1) fail(`US-002 live: missing create_task (meeting)`);

  const client = crm.clients.find((c) => c.name.includes("מיכל") && c.name.includes("כהן"));
  if (!client) {
    fail(
      `US-002 live: no client מיכל כהן in fake CRM — got clients: ${crm.clients.map((c) => c.name).join(", ") || "(none)"}`
    );
  }
  if (client.role !== "owner") fail(`US-002 live: expected seller role owner, got ${client.role}`);
  near(client.preferences?.budget ?? 0, 2_850_000, 200_000, "US-002 live: seller asking budget");

  if (crm.properties.length < 1) fail(`US-002 live: no property in CRM`);
  const prop = crm.properties[0]!;
  const addr = `${prop.address} ${prop.city ?? ""}`;
  if (!addr.includes("ביאליק") || !addr.includes("23")) {
    fail(`US-002 live: address should mention ביאליק and 23, got «${prop.address}» / «${prop.city}»`);
  }
  near(prop.rooms ?? 0, 3.5, 0.51, "US-002 live: rooms");
  near(prop.asking_price ?? 0, 2_850_000, 200_000, "US-002 live: asking_price");

  const featStr = (prop.features ?? []).join(" ");
  if (!/חניה|טאבו|קומה|מעלית|בלי/i.test(featStr)) {
    fail(`US-002 live: expected listing features (חניה/קומה/מעלית…), got «${featStr}»`);
  }

  const propNotes = `${prop.price_note ?? ""} ${prop.general_notes ?? ""}`;
  const sellerPrefsJson =
    client.preferences !== undefined && client.preferences !== null
      ? JSON.stringify(client.preferences)
      : "";
  /** Property notes and seller preferences — LLM often puts exclusivity on the client card. */
  const storyNotesBlob = `${propNotes} ${sellerPrefsJson}`;
  if (!/שוק|בדוק|מחיר/i.test(storyNotesBlob)) {
    fail(`US-002 live: expected price/context (שוק/מחיר) on property notes or seller preferences`);
  }
  if (!/בלעדיות|שווי|הערכ/i.test(storyNotesBlob)) {
    fail(`US-002 live: expected exclusivity / valuation note on property notes or seller preferences`);
  }

  if (!prop.owner_client_name?.includes("מיכל")) {
    fail(
      `US-002 live: property.owner_client_name should reference המוכרת (מיכל…), got «${prop.owner_client_name ?? ""}»`
    );
  }

  const taskText = `${crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" ")}`;
  if (!/פגישה|נכס|מיכל|קבוע/i.test(taskText)) {
    fail(`US-002 live: task should mention meeting / נכס / מיכל`);
  }
  if (!/חמישי|אחר הצהריים/i.test(taskText)) {
    fail(`US-002 live: task should mention יום חמישי אחר הצהריים (or equivalent)`);
  }

  if (result.trace.response?.replyType !== "actions") {
    fail(`US-002 live: expected actions reply, got ${result.trace.response?.replyType}`);
  }
}
