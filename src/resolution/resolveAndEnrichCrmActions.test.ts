import { describe, expect, it } from "vitest";
import type { FakeClient } from "../crm/fakeCrmAdapter";
import { findMatchingClients, resolveAndEnrichCrmActions } from "./resolveAndEnrichCrmActions";

const sampleClients: FakeClient[] = [
  { id: "1", name: "דניאל לוי", role: "buyer", preferences: { areas: ["רמת גן"] } },
  { id: "2", name: "דניאל כהן", role: "buyer" }
];

describe("findMatchingClients", () => {
  it("matches exactly one client by full name", () => {
    expect(findMatchingClients("דניאל לוי", sampleClients)).toHaveLength(1);
    expect(findMatchingClients("דניאל לוי", sampleClients)[0]?.name).toBe("דניאל לוי");
  });

  it("returns multiple clients when token is only a shared first name", () => {
    expect(findMatchingClients("דניאל", sampleClients).length).toBe(2);
  });

  it("returns zero clients when token matches nobody", () => {
    expect(findMatchingClients("שרה יוסף", sampleClients)).toHaveLength(0);
  });
});

describe("resolveAndEnrichCrmActions", () => {
  it("allows informal task client_name when persisted CRM has no clients yet", () => {
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

    expect(result.validActions).toHaveLength(1);
    expect(result.clarifications).toHaveLength(0);
    expect(result.validActions[0]).toMatchObject({
      type: "create_task",
      data: { client_name: "דני" }
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
    expect(result.clarifications.some((q) => q.includes("לא ברור על איזה לקוח"))).toBe(true);
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

  it("blocks upsert when the model picks a full name but the user only said a shared first name", () => {
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
      sampleClients,
      "דניאל מעוניין גם להתגורר בתל אביב"
    );

    expect(result.validActions).toHaveLength(0);
    expect(result.rejectedActions.some((r) => r.reason === "ambiguous user reference for client upsert")).toBe(true);
    expect(result.clarifications.some((q) => q.includes("לא ברור על מי מתכוונים"))).toBe(true);
  });

  it("allows upsert when the user message contains the resolved full name", () => {
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
      sampleClients,
      "דניאל לוי מעוניין גם בתל אביב"
    );

    expect(result.validActions).toHaveLength(1);
    expect(result.clarifications).toHaveLength(0);
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

  it("blocks ambiguous client upserts", () => {
    const result = resolveAndEnrichCrmActions(
      [{ type: "create_or_update_client", data: { name: "דניאל", preferences: { city: "תל אביב" } } }],
      sampleClients
    );

    expect(result.validActions).toHaveLength(0);
    expect(result.clarifications.some((q) => q.includes("לא ברור על מי מתכוונים"))).toBe(true);
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
      [],
      "דיברתי עם מיכל כהן מרחוב ביאליק 23 ברמת גן"
    );

    const prop = result.validActions.find((a) => a.type === "create_or_update_property");
    expect(prop?.type).toBe("create_or_update_property");
    if (prop?.type === "create_or_update_property") {
      expect(prop.data.owner_client_name).toBe("מיכל כהן");
    }
    expect(result.clarifications).toHaveLength(0);
  });
});
