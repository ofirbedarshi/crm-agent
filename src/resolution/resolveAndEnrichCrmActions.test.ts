import { describe, expect, it } from "vitest";
import type { FakeClient, FakeProperty } from "../crm/fakeCrmAdapter";
import { resolveAndEnrichCrmActions } from "./resolveAndEnrichCrmActions";

const sampleClients: FakeClient[] = [
  { id: "1", name: "דניאל לוי", role: "buyer", preferences: { areas: ["רמת גן"] } },
  { id: "2", name: "דניאל כהן", role: "buyer" }
];

describe("resolveAndEnrichCrmActions", () => {
  it("rejects single-word task client_name with zero CRM clients (no empty-CRM passthrough)", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "להתקשר לדני",
            client_name: "דני",
            due_time: "מחר בבוקר"
          }
        }
      ],
      []
    );

    expect(result.validActions).toHaveLength(0);
    expect(result.clarifications.some((q) => q.includes("לא קיים לקוח בשם דני"))).toBe(true);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_task",
      reason: "task client_name does not resolve to any CRM client"
    });
  });

  it("single-word task client_name with exactly one first-token match is allowed with canonical name", () => {
    const clients: FakeClient[] = [{ id: "1", name: "יוסי כהן", role: "buyer" }];
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "לחזור ליוסי",
            client_name: "יוסי",
            due_time: "מחר"
          }
        }
      ],
      clients
    );

    expect(result.validActions).toHaveLength(1);
    expect(result.clarifications).toHaveLength(0);
    expect(result.validActions[0]).toMatchObject({
      type: "create_task",
      data: { client_name: "יוסי כהן" }
    });
  });

  it("disambiguates single-word task client_name when structured title embeds one full candidate name", () => {
    const aviClients: FakeClient[] = [
      { id: "1", name: "אבי כהן", role: "buyer" },
      { id: "2", name: "אבי לוי", role: "buyer" }
    ];
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "תזכירי מחר לדבר עם אבי לוי על האופציות שקבענו",
            client_name: "אבי",
            due_time: "מחר"
          }
        }
      ],
      aviClients
    );

    expect(result.validActions).toHaveLength(1);
    expect(result.clarifications).toHaveLength(0);
    expect(result.rejectedActions).toHaveLength(0);
    expect(result.validActions[0]).toMatchObject({
      type: "create_task",
      data: { client_name: "אבי לוי", due_time: "מחר" }
    });
  });

  it("drops ambiguous tasks and asks which client was meant", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "פגישה",
            client_name: "דניאל",
            due_time: "מחר ב-8 בבוקר"
          }
        }
      ],
      sampleClients
    );

    expect(result.validActions).toHaveLength(0);
    expect(
      result.clarifications.some(
        (q) => q.includes("יש כמה לקוחות בשם דניאל") && q.includes("למי התכוונת")
      )
    ).toBe(true);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_task",
      reason: "ambiguous task client_name"
    });
  });

  it("canonicalizes task client_name when unique", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "פגישה",
            client_name: "דניאל לוי",
            due_time: "מחר"
          }
        }
      ],
      sampleClients
    );

    expect(result.validActions).toEqual([
      {
        type: "create_task",
        data: {
          title: "פגישה",
          client_name: "דניאל לוי",
          due_time: "מחר"
        }
      }
    ]);
    expect(result.clarifications).toHaveLength(0);
  });

  it("multi-word task client_name with zero matches auto-creates a bare client card", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "פגישה",
            client_name: "שרה יוסף",
            due_time: "מחר"
          }
        }
      ],
      sampleClients
    );

    expect(result.clarifications).toHaveLength(0);
    expect(result.rejectedActions).toHaveLength(0);
    expect(result.validActions).toHaveLength(2);
    expect(result.validActions[0]).toMatchObject({
      type: "create_or_update_client",
      data: { name: "שרה יוסף" }
    });
    expect(result.validActions[1]).toMatchObject({
      type: "create_task",
      data: { client_name: "שרה יוסף" }
    });
  });

  it("allows client upsert when parser returns exact multi-word name (no rawUserMessage guard)", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            preferences: { areas: ["רמת גן", "תל אביב"] }
          }
        }
      ],
      sampleClients
    );

    expect(result.validActions).toHaveLength(1);
    expect(result.clarifications).toHaveLength(0);
    expect(result.validActions[0]?.type).toBe("create_or_update_client");
  });

  it("merges preferences against CRM when updating an existing unique client", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            preferences: { areas: ["רמת גן", "תל אביב"], budget: 2 }
          }
        }
      ],
      sampleClients
    );

    expect(result.validActions).toHaveLength(1);
    expect(result.validActions[0]?.type).toBe("create_or_update_client");
    if (result.validActions[0]?.type === "create_or_update_client") {
      expect(result.validActions[0].data.name).toBe("דניאל לוי");
      expect(result.validActions[0].data.preferences?.areas).toEqual(["רמת גן", "תל אביב"]);
      expect(result.validActions[0].data.preferences?.budget).toBe(2);
    }
  });

  it("allows task client resolution against a client created earlier in the same action batch", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "הילה מזרחי",
            role: "buyer",
            preferences: { city: "מודיעין" }
          }
        },
        {
          type: "create_task",
          data: {
            title: "לתאם שיחה למחר",
            due_time: "מחר",
            client_name: "הילה מזרחי"
          }
        }
      ],
      []
    );

    expect(result.validActions).toHaveLength(2);
    expect(result.validActions[1]).toMatchObject({
      type: "create_task",
      data: { client_name: "הילה מזרחי" }
    });
    expect(result.clarifications).toHaveLength(0);
  });

  it("blocks ambiguous client upserts when single-word matches multiple first tokens", () => {
    const result = resolveAndEnrichCrmActions(
      [{ type: "create_or_update_client", data: { name: "דניאל", preferences: { city: "תל אביב" } } }],
      sampleClients
    );

    expect(result.validActions).toHaveLength(0);
    expect(
      result.clarifications.some(
        (q) => q.includes("יש כמה לקוחות בשם דניאל") && q.includes("למי התכוונת")
      )
    ).toBe(true);
  });

  it("numbers ambiguous יוסי candidates with new format listing full names", () => {
    const yossiClients: FakeClient[] = [
      { id: "1", name: "יוסי כהן", role: "buyer", preferences: { areas: ["רמת גן"] } },
      { id: "2", name: "יוסי ביטון", role: "owner" }
    ];
    const props: FakeProperty[] = [
      {
        id: "p1",
        address: "שדרות ירושלים 10",
        city: "רמת גן",
        owner_client_name: "יוסי ביטון"
      }
    ];
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_task",
          data: {
            title: "לחזור ליוסי מחר לגבי דירה ברמת גן",
            client_name: "יוסי",
            due_time: "מחר"
          }
        }
      ],
      yossiClients,
      props
    );

    expect(result.validActions).toHaveLength(0);
    const q = result.clarifications.join("\n");
    expect(q).toMatch(/יש כמה לקוחות בשם יוסי/);
    expect(q).toMatch(/יוסי ביטון/);
    expect(q).toMatch(/יוסי כהן/);
    expect(q).toMatch(/למי התכוונת/);
  });

  it("infers property owner_client_name when omitted but batch has exactly one owner client", () => {
    const result = resolveAndEnrichCrmActions(
      [
        {
          type: "create_or_update_client",
          data: { name: "מיכל כהן", role: "owner", preferences: { budget: 2_850_000 } }
        },
        {
          type: "create_or_update_property",
          data: { address: "ביאליק 23", city: "רמת גן", asking_price: 2_850_000 }
        }
      ],
      []
    );

    const prop = result.validActions.find((a) => a.type === "create_or_update_property");
    expect(prop?.type).toBe("create_or_update_property");
    if (prop?.type === "create_or_update_property") {
      expect(prop.data.owner_client_name).toBe("מיכל כהן");
    }
    expect(result.clarifications).toHaveLength(0);
  });

  it("single-word client upsert that slips past validation is rejected in resolver", () => {
    const result = resolveAndEnrichCrmActions(
      [{ type: "create_or_update_client", data: { name: "יוסי" } }],
      []
    );

    expect(result.validActions).toHaveLength(0);
    expect(result.clarifications.some((q) => q.includes("מה שם המשפחה של יוסי"))).toBe(true);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_or_update_client",
      reason: "client name must include first and last name"
    });
  });
});
