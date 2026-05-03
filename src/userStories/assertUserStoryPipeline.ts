import type { DemoCrmSnapshot } from "../crm/demoCrmStore";
import type { FakeActivityEntry, FakeClient, FakeProperty, FakeTask } from "../crm/fakeCrmAdapter";
import type { RunCrmAgentResult } from "../pipeline/runCrmAgent";
import type {
  Us001LiveExpectation,
  Us002LiveExpectation,
  Us003LiveExpectation,
  Us004LiveExpectation
} from "./userStoryLiveExpectations";

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

/** Text from client interaction rows (seller call / visit narrative often lands here per parser rules). */
function fakeClientInteractionsText(client: FakeClient): string {
  return (client.interactions ?? [])
    .map((i) =>
      [i.summary, i.property_address, ...(i.property_addresses ?? [])].filter(Boolean).join(" ")
    )
    .join(" | ");
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

/** Live LLM: same intent, tolerant Hebrew / field variance — validated against `expected`. */
export function assertUs001PipelineLive(ctx: PipelineStoryContext, expected: Us001LiveExpectation): void {
  const { result, fakeCrm: crm } = ctx;
  const { pipeline, client: expClient, tasks: expTasks } = expected;

  if (result.validActions.length < pipeline.validActionsMin) {
    fail(
      `${expected.storyLabel}: expected at least ${pipeline.validActionsMin} validActions (client + tasks), got ${result.validActions.length}. Clarification? ${result.response.slice(0, 200)}`
    );
  }

  const types = result.validActions.map((a) => a.type);
  const clientCount = types.filter((t) => t === "create_or_update_client").length;
  const taskCount = types.filter((t) => t === "create_task").length;
  if (clientCount !== pipeline.createOrUpdateClientCount) {
    fail(
      `${expected.storyLabel}: expected ${pipeline.createOrUpdateClientCount} create_or_update_client, got ${clientCount}`
    );
  }
  if (taskCount < pipeline.createTaskMin) {
    fail(`${expected.storyLabel}: expected at least ${pipeline.createTaskMin} create_task, got ${taskCount}`);
  }

  const [partA, partB] = expClient.nameIncludesBoth;
  const client = crm.clients.find((c) => c.name.includes(partA) && c.name.includes(partB));
  if (!client) fail(`${expected.storyLabel}: no client resembling ${partA} + ${partB}`);

  // Model often omits role despite buyer intent; fake CRM leaves role unset unless emitted.
  if (client.role !== undefined && client.role !== expClient.roleIfPresent) {
    fail(`${expected.storyLabel}: expected ${expClient.roleIfPresent} role (or omit), got ${client.role}`);
  }
  near(
    client.preferences?.budget ?? 0,
    expClient.budgetApprox,
    expClient.budgetTolerance,
    `${expected.storyLabel}: budget`
  );

  const areas = client.preferences?.areas ?? [];
  const areaText = [client.preferences?.city, ...areas].filter(Boolean).join(" ");
  for (const area of expClient.areasMustInclude) {
    if (!areaText.includes(area)) fail(`${expected.storyLabel}: expected ${area} in areas/city`);
  }

  const feats = (client.preferences?.features ?? []).join(" ");
  const allClient = JSON.stringify(client.preferences ?? {});
  for (const hint of expClient.preferenceHintsMustAppearInJsonOrFeatures) {
    if (!allClient.includes(hint) && !feats.includes(hint)) {
      fail(`${expected.storyLabel}: expected ${hint} in preferences`);
    }
  }

  if (crm.tasks.length < expTasks.minCount) {
    fail(`${expected.storyLabel}: expected at least ${expTasks.minCount} tasks`);
  }

  const taskBlob = crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" | ");
  if (!expTasks.combinedFollowUpHint.test(taskBlob)) {
    fail(`${expected.storyLabel}: expected follow-up hint in tasks (${expTasks.combinedFollowUpHint})`);
  }
  if (!expTasks.combinedOptionsHint.test(taskBlob)) {
    fail(`${expected.storyLabel}: expected options/evening commitment in tasks (${expTasks.combinedOptionsHint})`);
  }

  if (result.trace.response?.replyType !== pipeline.replyType) {
    fail(`${expected.storyLabel}: expected ${pipeline.replyType} reply, got ${result.trace.response?.replyType}`);
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
  const exclusivityNarrative = `${prop.general_notes ?? ""} ${fakeClientInteractionsText(client)}`;
  if (!/בלעדיות|שווי|הערכ/i.test(exclusivityNarrative)) {
    fail(`US-002: exclusivity / valuation in general_notes or client.interactions`);
  }

  if (crm.tasks[0]?.due_time !== "יום חמישי אחר הצהריים") fail(`US-002: due`);

  const demoProp = ctx.demoCrm.properties[0];
  const demoClient = ctx.demoCrm.clients[0];
  const demoIx = (demoClient?.interactions ?? []).map((i) => i.summary).join(" ");
  if (!demoProp?.priceNote?.includes("מחיר שוק")) fail(`US-002: demo priceNote`);
  const demoExclusivity = `${demoProp?.generalNotes ?? ""} ${demoIx}`;
  if (!/בלעדיות|שווי|הערכ/i.test(demoExclusivity)) {
    fail(`US-002: demo exclusivity / valuation (generalNotes or interactions)`);
  }

  if (!result.response.includes("יצרתי כרטיס לקוח")) fail(`US-002: reply`);
  if (!result.response.includes("יצרתי כרטיס נכס")) fail(`US-002: reply property`);
  if (!result.response.includes("יצרתי משימה")) fail(`US-002: reply task`);
  if (result.trace.response?.replyType !== "actions") fail(`US-002: replyType`);
}

/** Live LLM: seller client + property + meeting task — validated against `expected`. */
export function assertUs002PipelineLive(ctx: PipelineStoryContext, expected: Us002LiveExpectation): void {
  const { result, fakeCrm: crm } = ctx;
  const { pipeline, client: expClient, property: expProp, tasks: expTasks } = expected;

  if (result.validActions.length < pipeline.validActionsMin) {
    fail(
      `${expected.storyLabel}: need client + property + task (${result.validActions.length} actions). Snippet: ${result.response.slice(0, 280)}`
    );
  }

  const clientActs = result.validActions.filter((a) => a.type === "create_or_update_client");
  const propActs = result.validActions.filter((a) => a.type === "create_or_update_property");
  const taskActs = result.validActions.filter((a) => a.type === "create_task");

  const min = pipeline.minActionsByType;
  if (clientActs.length < min.create_or_update_client) {
    fail(`${expected.storyLabel}: missing create_or_update_client (seller)`);
  }
  if (propActs.length < min.create_or_update_property) {
    fail(`${expected.storyLabel}: missing create_or_update_property`);
  }
  if (taskActs.length < min.create_task) {
    fail(`${expected.storyLabel}: missing create_task (meeting)`);
  }

  const [partA, partB] = expClient.nameIncludesBoth;
  const client = crm.clients.find((c) => c.name.includes(partA) && c.name.includes(partB));
  if (!client) {
    fail(
      `${expected.storyLabel}: no matching seller client — got clients: ${crm.clients.map((c) => c.name).join(", ") || "(none)"}`
    );
  }
  if (client.role !== expClient.role) {
    fail(`${expected.storyLabel}: expected seller role ${expClient.role}, got ${client.role}`);
  }
  near(
    client.preferences?.budget ?? 0,
    expClient.budgetApprox,
    expClient.budgetTolerance,
    `${expected.storyLabel}: seller asking budget`
  );

  if (crm.properties.length < 1) fail(`${expected.storyLabel}: no property in CRM`);
  const prop = crm.properties[0]!;
  const addr = `${prop.address} ${prop.city ?? ""}`;
  for (const frag of expProp.addressMustIncludeAll) {
    if (!addr.includes(frag)) {
      fail(`${expected.storyLabel}: address should mention «${frag}», got «${prop.address}» / «${prop.city}»`);
    }
  }
  near(prop.rooms ?? 0, expProp.roomsApprox, expProp.roomsTolerance, `${expected.storyLabel}: rooms`);
  near(
    prop.asking_price ?? 0,
    expProp.askingPriceApprox,
    expProp.askingPriceTolerance,
    `${expected.storyLabel}: asking_price`
  );

  const featStr = (prop.features ?? []).join(" ");
  if (!expProp.featuresCombinedPattern.test(featStr)) {
    fail(`${expected.storyLabel}: expected listing features, got «${featStr}»`);
  }

  const propNotes = `${prop.price_note ?? ""} ${prop.general_notes ?? ""}`;
  const sellerPrefsJson =
    client.preferences !== undefined && client.preferences !== null
      ? JSON.stringify(client.preferences)
      : "";
  const interactionNotes = fakeClientInteractionsText(client);
  /** Property notes, seller prefs JSON, and client interaction summaries (post-call narrative). */
  const storyNotesBlob = `${propNotes} ${sellerPrefsJson} ${interactionNotes}`;
  const [pricePat, exclusivityPat] = expProp.storyNotesMustMatchBoth;
  if (!pricePat.test(storyNotesBlob)) {
    fail(`${expected.storyLabel}: expected price/context on property notes or seller preferences (${pricePat})`);
  }
  if (!exclusivityPat.test(storyNotesBlob)) {
    fail(
      `${expected.storyLabel}: expected exclusivity / valuation note on property notes or seller preferences (${exclusivityPat})`
    );
  }

  if (!prop.owner_client_name?.includes(expProp.ownerClientNameIncludes)) {
    fail(
      `${expected.storyLabel}: property.owner_client_name should reference seller (${expProp.ownerClientNameIncludes}…), got «${prop.owner_client_name ?? ""}»`
    );
  }

  const taskText = `${crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" ")}`;
  if (!expTasks.combinedMeetingContextPattern.test(taskText)) {
    fail(`${expected.storyLabel}: task should match meeting context (${expTasks.combinedMeetingContextPattern})`);
  }
  if (!expTasks.combinedDueTimePattern.test(taskText)) {
    fail(`${expected.storyLabel}: task should match due-time window (${expTasks.combinedDueTimePattern})`);
  }

  if (result.trace.response?.replyType !== pipeline.replyType) {
    fail(`${expected.storyLabel}: expected ${pipeline.replyType} reply, got ${result.trace.response?.replyType}`);
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

/** Mocked pipeline: פוסט־ביקור מול CRM ריק — יוצר רוכש איתי לוי, נכס בהירדן 12 (בעלים לא ידוע), משימה. */
export function assertUs003PipelineStrict(ctx: PipelineStoryContext): void {
  const { result, fakeCrm: crm } = ctx;

  if (result.validActions.length !== 3) {
    fail(`US-003 strict: expected 3 validActions, got ${result.validActions.length}`);
  }
  if (result.executionResults.length !== 3) {
    fail(`US-003 strict: expected 3 executionResults, got ${result.executionResults.length}`);
  }
  if (crm.clients.length !== 1) {
    fail(`US-003 strict: expected 1 client (buyer איתי לוי), got ${crm.clients.length}`);
  }
  if (crm.properties.length !== 1) {
    fail(`US-003 strict: expected 1 property, got ${crm.properties.length}`);
  }
  if (crm.tasks.length !== 1) {
    fail(`US-003 strict: expected 1 task, got ${crm.tasks.length}`);
  }

  const itai = crm.clients.find((c) => c.name === "איתי לוי");
  if (!itai) fail(`US-003: missing איתי לוי client row`);

  if (itai.role !== "buyer") fail(`US-003: איתי לוי role`);
  if (itai.lead_temperature !== "warm") fail(`US-003: איתי לוי lead_temperature warm`);
  const touches = (itai.interactions ?? []).map((i) => `${i.summary} ${i.property_address ?? ""}`).join(" ");
  if ((itai.interactions?.length ?? 0) < 1) fail(`US-003: איתי לוי missing interaction timeline`);
  if (!touches.includes("הירדן")) fail(`US-003: איתי לוי interaction property link`);
  const blob = `${clientFeaturesBlob(itai)} ${touches}`;
  if (!blob.includes("סלון") || !blob.includes("חניה")) fail(`US-003: איתי לוי positives`);
  if (!blob.includes("מטבח")) fail(`US-003: איתי לוי kitchen objection`);
  if (!/150|מאה\s*ו\s*חמישים/i.test(blob)) fail(`US-003: איתי לוי price gap`);
  if (!/מתלבט|מתעניין/i.test(blob)) fail(`US-003: איתי לוי hesitant status`);

  const prop = crm.properties[0]!;
  if (prop.address !== "הירדן 12") fail(`US-003: property address`);
  assertUs003BareListingAsset(prop, "US-003");

  const task = crm.tasks[0]!;
  if (!task.title.includes("איתי")) fail(`US-003: task buyer name`);
  if (!task.title.includes("הירדן")) fail(`US-003: task property hint`);
  if (!task.due_time?.includes("מחר") || !task.due_time.includes("ערב")) fail(`US-003: task due מחר בערב`);
  if (task.client_name !== "איתי לוי") fail(`US-003: task client_name`);

  if (ctx.demoCrm.clients.length !== 1) fail(`US-003: demo clients`);
  if (ctx.demoCrm.properties.length !== 1) fail(`US-003: demo properties`);
  if (ctx.demoCrm.calendar.length !== 1) fail(`US-003: demo calendar`);

  const demoProp = ctx.demoCrm.properties[0];
  if (demoProp?.address !== "הירדן 12") fail(`US-003: demo address`);
  if (demoProp) assertUs003BareDemoListing(demoProp, "US-003");

  const demoItai = ctx.demoCrm.clients.find((cl) => cl.name === "איתי לוי");
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

/** Live LLM: post-visit buyer — tolerant wording; validated against `expected`. */
export function assertUs003PipelineLive(ctx: PipelineStoryContext, expected: Us003LiveExpectation): void {
  const { result, fakeCrm: crm } = ctx;
  const { pipeline, buyer: expBuyer, listing: expListing, tasks: expTasks, demo: expDemo } = expected;

  if (result.validActions.length < pipeline.validActionsMin) {
    fail(
      `${expected.storyLabel}: expected ≥${pipeline.validActionsMin} validActions (buyer update + task / property). Got ${result.validActions.length}. Snippet: ${result.response.slice(0, 320)}`
    );
  }

  const clientActs = result.validActions.filter((a) => a.type === "create_or_update_client");
  const taskActs = result.validActions.filter((a) => a.type === "create_task");

  if (clientActs.length < pipeline.minCreateOrUpdateClient) {
    fail(
      `${expected.storyLabel}: need buyer update (${pipeline.minCreateOrUpdateClient}+ client actions), got ${clientActs.length}`
    );
  }
  if (taskActs.length < pipeline.minCreateTask) {
    fail(`${expected.storyLabel}: need at least ${pipeline.minCreateTask} follow-up task(s)`);
  }

  const itai = crm.clients.find((c) => c.name.includes(expBuyer.nameIncludes));
  if (!itai) {
    fail(
      `${expected.storyLabel}: CRM missing buyer after run — ${crm.clients.map((c) => c.name).join(", ") || "(none)"}`
    );
  }

  const buyerBlob = (c: FakeClient): string =>
    [
      JSON.stringify(c.preferences ?? {}),
      ...(c.interactions ?? []).map((i) => `${i.summary} ${i.property_address ?? ""}`)
    ].join(" ");

  const c = itai;
  const temps = expBuyer.heat.allowedLeadTemperatures;
  const heatOk =
    (c.lead_temperature != null &&
      temps.includes(c.lead_temperature as (typeof temps)[number])) ||
    (expBuyer.heat.interactionsCountHeatIfPositive && (c.interactions?.length ?? 0) > 0) ||
    expBuyer.heat.hesitationOrThinkingPattern.test(buyerBlob(c));
  if (!heatOk) {
    fail(`${expected.storyLabel}: expected warm-ish interest / touch log on ${c.name}`);
  }
  const blob = buyerBlob(c);
  for (const sub of expBuyer.feedbackBlobMustInclude) {
    if (!blob.includes(sub)) {
      fail(`${expected.storyLabel}: expected «${sub}» on ${c.name}`);
    }
  }
  if (!blob.includes(expBuyer.kitchenConcernSubstring)) {
    fail(`${expected.storyLabel}: kitchen concern on ${c.name}`);
  }
  if (!expBuyer.priceObjectionPattern.test(blob)) {
    fail(`${expected.storyLabel}: price objection not captured on ${c.name} (${expBuyer.priceObjectionPattern})`);
  }

  const prop = crm.properties.find((p) =>
    expListing.addressMustMatchAll.every((rx) => rx.test(p.address))
  );
  if (!prop) fail(`${expected.storyLabel}: missing listing matching ${expListing.addressMustMatchAll}`);
  if (expListing.structuralRowOnlyNoDetails) {
    assertUs003BareListingAsset(prop, expected.storyLabel);
  }

  const demoListing = ctx.demoCrm.properties.find((p) =>
    expListing.addressMustMatchAll.every((rx) => rx.test(p.address))
  );
  if (!demoListing) fail(`${expected.storyLabel}: demo listing missing`);
  if (expListing.structuralRowOnlyNoDetails) {
    assertUs003BareDemoListing(demoListing, expected.storyLabel);
  }

  if (crm.tasks.length < expTasks.minCount) {
    fail(`${expected.storyLabel}: expected ≥${expTasks.minCount} task(s)`);
  }
  const taskBlob = crm.tasks.map((t) => `${t.title} ${t.due_time ?? ""}`).join(" | ");
  if (!expTasks.tomorrowPattern.test(taskBlob) || !expTasks.eveningPattern.test(taskBlob)) {
    fail(`${expected.storyLabel}: follow-up should target tomorrow evening (${taskBlob})`);
  }
  if (!expTasks.mustReferenceBuyerPattern.test(taskBlob)) {
    fail(`${expected.storyLabel}: task should reference buyer (${taskBlob})`);
  }

  if (ctx.demoCrm.calendar.length < expDemo.calendarMinEntries) {
    fail(`${expected.storyLabel}: demo calendar missing task`);
  }

  if (result.trace.response?.replyType !== pipeline.replyType) {
    fail(`${expected.storyLabel}: expected ${pipeline.replyType} reply, got ${result.trace.response?.replyType}`);
  }
}

/** Live LLM: ambiguous יוסי — turn 1 clarification only; turn 2 resolves to task after server-held history. */
export function assertUs004AmbiguousYossiLive(
  ctx1: PipelineStoryContext,
  ctx2: PipelineStoryContext,
  expected: Us004LiveExpectation
): void {
  const { turn1, turn2 } = expected;

  if (ctx1.result.trace.response?.replyType !== turn1.replyType) {
    fail(
      `${expected.storyLabel} turn1: expected ${turn1.replyType}, got ${ctx1.result.trace.response?.replyType}`
    );
  }
  if (ctx1.result.executionResults.length !== 0) {
    fail(`${expected.storyLabel} turn1: expected no CRM execution, got ${ctx1.result.executionResults.length}`);
  }
  if (ctx1.result.validActions.length !== 0) {
    fail(`${expected.storyLabel} turn1: expected no validActions while clarifying`);
  }
  if (ctx1.fakeCrm.tasks.length > turn1.taskCountMax) {
    fail(`${expected.storyLabel} turn1: expected ≤${turn1.taskCountMax} tasks, got ${ctx1.fakeCrm.tasks.length}`);
  }
  for (const pat of turn1.clarificationPatterns) {
    if (!pat.test(ctx1.result.response)) {
      fail(`${expected.storyLabel} turn1: response should match ${pat}`);
    }
  }

  const [a, b] = turn2.chosenClientNameIncludes;
  if (ctx2.result.trace.response?.replyType !== turn2.replyType) {
    fail(
      `${expected.storyLabel} turn2: expected ${turn2.replyType}, got ${ctx2.result.trace.response?.replyType}`
    );
  }
  if (ctx2.result.executionResults.length < 1) {
    fail(`${expected.storyLabel} turn2: expected CRM execution`);
  }
  if (!ctx2.result.executionResults.every((r) => r.success)) {
    fail(`${expected.storyLabel} turn2: executionResults contained failure`);
  }
  if (ctx2.fakeCrm.tasks.length < turn2.tasksMinCount) {
    fail(`${expected.storyLabel} turn2: expected ≥${turn2.tasksMinCount} tasks`);
  }

  const taskForChosen = ctx2.fakeCrm.tasks.find(
    (t) =>
      t.client_name?.includes(a) &&
      t.client_name?.includes(b) &&
      turn2.taskDueHint.test(`${t.title} ${t.due_time ?? ""}`)
  );
  if (!taskForChosen) {
    fail(
      `${expected.storyLabel} turn2: missing task for ${a}+${b} with due hint (${turn2.taskDueHint}) among ${JSON.stringify(ctx2.fakeCrm.tasks)}`
    );
  }

  const titleBlob = `${taskForChosen.title} ${taskForChosen.due_time ?? ""}`;
  if (!turn2.taskTitleHints.some((rx) => rx.test(titleBlob))) {
    fail(`${expected.storyLabel} turn2: task title/due should match one of hints (${titleBlob})`);
  }
}
