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

function clientFeaturesBlob(client: { preferences?: { features?: string[] } }): string {
  return (client.preferences?.features ?? []).join(" ");
}

/** US‑003 demo: listing row is structural only (address link); narrative stays on buyer interactions. */
function assertUs003BareListingAsset(prop: FakeProperty, label = "US-003"): void {
  if (prop.owner_client_name?.trim()) {
    fail(`${label}: listing must have no owner, got «${prop.owner_client_name}»`);
  }
  if (prop.asking_price !== undefined) {
    fail(`${label}: listing must have no asking_price, got ${prop.asking_price}`);
  }
  if (prop.rooms !== undefined) {
    fail(`${label}: listing must have no rooms, got ${prop.rooms}`);
  }
  if (prop.city?.trim()) {
    fail(`${label}: listing must have no city, got «${prop.city}»`);
  }
  if (prop.features && prop.features.length > 0) {
    fail(`${label}: listing must have no features, got ${prop.features.length} entries`);
  }
  if (prop.price_note?.trim()) {
    fail(`${label}: listing must have no price_note, got «${prop.price_note}»`);
  }
  if (prop.general_notes?.trim()) {
    fail(`${label}: listing must have no general_notes, got «${prop.general_notes}»`);
  }
}

function assertUs003BareDemoListing(demoListing: DemoCrmSnapshot["properties"][number], label = "US-003"): void {
  if (demoListing.ownerClientName?.trim()) {
    fail(`${label}: demo listing must have no owner, got «${demoListing.ownerClientName}»`);
  }
  if (demoListing.priceNote?.trim() || demoListing.generalNotes?.trim() || demoListing.notes?.trim()) {
    fail(`${label}: demo listing must have no notes rollup / priceNote / generalNotes`);
  }
}

/** Mocked pipeline: פוסט־ביקור מול CRM ריק — יוצר רוכש איתי, נכס בהירדן 12 (בעלים לא ידוע), משימה. */
export function assertUs003PipelineStrict(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length !== 3) {
    fail(`US-003 strict: expected 3 validActions, got ${result.validActions.length}`);
  }
  if (result.executionResults.length !== 3) {
    fail(`US-003 strict: expected 3 executionResults, got ${result.executionResults.length}`);
  }
  if (crm.clients.length !== 1) {
    fail(`US-003 strict: expected 1 client (buyer איתי), got ${crm.clients.length}`);
  }
  if (crm.properties.length !== 1) {
    fail(`US-003 strict: expected 1 property, got ${crm.properties.length}`);
  }
  if (crm.tasks.length !== 1) {
    fail(`US-003 strict: expected 1 task, got ${crm.tasks.length}`);
  }

  const itai = crm.clients.find((c) => c.name === "איתי");
  if (!itai) fail(`US-003: missing איתי client row`);

  if (itai.role !== "buyer") fail(`US-003: איתי role`);
  if (itai.lead_temperature !== "warm") fail(`US-003: איתי lead_temperature warm`);
  const touches = (itai.interactions ?? []).map((i) => `${i.summary} ${i.property_address ?? ""}`).join(" ");
  if ((itai.interactions?.length ?? 0) < 1) fail(`US-003: איתי missing interaction timeline`);
  if (!touches.includes("הירדן")) fail(`US-003: איתי interaction property link`);
  const blob = `${clientFeaturesBlob(itai)} ${touches}`;
  if (!blob.includes("סלון") || !blob.includes("חניה")) fail(`US-003: איתי positives`);
  if (!blob.includes("מטבח")) fail(`US-003: איתי kitchen objection`);
  if (!/150|מאה\s*ו\s*חמישים/i.test(blob)) fail(`US-003: איתי price gap`);
  if (!/מתלבט|מתעניין/i.test(blob)) fail(`US-003: איתי hesitant status`);

  const prop = crm.properties[0]!;
  if (prop.address !== "הירדן 12") fail(`US-003: property address`);
  assertUs003BareListingAsset(prop, "US-003");

  const task = crm.tasks[0]!;
  if (!task.title.includes("איתי")) fail(`US-003: task buyer name`);
  if (!task.title.includes("הירדן")) fail(`US-003: task property hint`);
  if (!task.due_time?.includes("מחר") || !task.due_time.includes("ערב")) fail(`US-003: task due מחר בערב`);
  if (task.client_name !== "איתי") fail(`US-003: task client_name`);

  if (ctx.demoCrm.clients.length !== 1) fail(`US-003: demo clients`);
  if (ctx.demoCrm.properties.length !== 1) fail(`US-003: demo properties`);
  if (ctx.demoCrm.calendar.length !== 1) fail(`US-003: demo calendar`);

  const demoProp = ctx.demoCrm.properties[0];
  if (demoProp?.address !== "הירדן 12") fail(`US-003: demo address`);
  if (demoProp) assertUs003BareDemoListing(demoProp, "US-003");

  const demoItai = ctx.demoCrm.clients.find((cl) => cl.name === "איתי");
  if ((demoItai?.interactions?.length ?? 0) < 1) {
    fail(`US-003: demo client interactions`);
  }

  const clientReplyHits =
    (result.response.match(/יצרתי כרטיס לקוח|עדכנתי את פרטי הלקוח/g) ?? []).length;
  if (clientReplyHits < 1) fail(`US-003: reply should reflect buyer client upsert`);
  if (!result.response.includes("יצרתי כרטיס נכס")) fail(`US-003: reply property`);
  if (!result.response.includes("יצרתי משימה")) fail(`US-003: reply task`);
  if (result.trace.response?.replyType !== "actions") fail(`US-003: replyType`);
}

/** Live LLM: post-visit single buyer + empty CRM — tolerant wording; expects substance on buyer, listing row, calendar. */
export function assertUs003PipelineLive(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length < 2) {
    fail(
      `US-003 live: expected ≥2 validActions (buyer update + task / property). Got ${result.validActions.length}. Snippet: ${result.response.slice(0, 320)}`
    );
  }

  const clientActs = result.validActions.filter((a) => a.type === "create_or_update_client");
  const taskActs = result.validActions.filter((a) => a.type === "create_task");

  if (clientActs.length < 1) {
    fail(`US-003 live: need buyer update for איתי, got ${clientActs.length} client actions`);
  }
  if (taskActs.length < 1) fail(`US-003 live: need at least one follow-up task`);

  const itai = crm.clients.find((c) => c.name.includes("איתי"));
  if (!itai) {
    fail(`US-003 live: CRM missing איתי after run — ${crm.clients.map((c) => c.name).join(", ") || "(none)"}`);
  }

  const buyerBlob = (c: FakeClient): string =>
    [
      JSON.stringify(c.preferences ?? {}),
      ...(c.interactions ?? []).map((i) => `${i.summary} ${i.property_address ?? ""}`)
    ].join(" ");

  const c = itai;
  const heatOk =
    c.lead_temperature === "warm" ||
    c.lead_temperature === "hot" ||
    (c.interactions?.length ?? 0) > 0 ||
    /מתלבט|מתעניין|חושב/i.test(buyerBlob(c));
  if (!heatOk) {
    fail(`US-003 live: expected warm-ish interest / touch log on ${c.name}`);
  }
  const blob = buyerBlob(c);
  if (!blob.includes("סלון") || !blob.includes("חניה")) {
    fail(`US-003 live: expected positives (סלון, חניה) on ${c.name}`);
  }
  if (!blob.includes("מטבח")) fail(`US-003 live: kitchen concern on ${c.name}`);
  if (!/150|מאה|אלף|פער|גבוה|יקר|מחיר/i.test(blob)) {
    fail(`US-003 live: price objection not captured on ${c.name}`);
  }

  const prop = crm.properties.find((p) => /הירדן/.test(p.address) && /12/.test(p.address));
  if (!prop) fail(`US-003 live: missing property הירדן 12`);
  assertUs003BareListingAsset(prop, "US-003 live");

  const demoListing = ctx.demoCrm.properties.find(
    (p) => /הירדן/.test(p.address) && /12/.test(p.address)
  );
  if (!demoListing) fail(`US-003 live: demo listing הירדן 12 missing`);
  assertUs003BareDemoListing(demoListing, "US-003 live");

  if (crm.tasks.length < 1) fail(`US-003 live: expected ≥1 task`);
  const taskBlob = crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" | ");
  if (!/מחר/i.test(taskBlob) || !/ערב/i.test(taskBlob)) {
    fail(`US-003 live: follow-up should target tomorrow evening (${taskBlob})`);
  }
  if (!/איתי/i.test(taskBlob)) {
    fail(`US-003 live: task should reference buyer איתי (${taskBlob})`);
  }

  if (ctx.demoCrm.calendar.length < 1) fail(`US-003 live: demo calendar missing task`);

  if (result.trace.response?.replyType !== "actions") {
    fail(`US-003 live: expected actions reply, got ${result.trace.response?.replyType}`);
  }
}
