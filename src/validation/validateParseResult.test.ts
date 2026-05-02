import { describe, expect, it } from "vitest";
import { validateParseResult } from "./validateParseResult";

describe("validateParseResult", () => {
  it("defaults role to buyer when model omits role but preferences look like purchase search", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            preferences: {
              areas: ["גבעתיים", "רמת גן"],
              property_type: "דירת 4 חדרים",
              budget: 3_400_000
            }
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toHaveLength(1);
    const client = result.validActions[0];
    expect(client?.type).toBe("create_or_update_client");
    if (client?.type === "create_or_update_client") {
      expect(client.data.role).toBe("buyer");
    }
  });

  it("does not infer buyer when only budget is present on preferences", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "מיכל כהן",
            preferences: { budget: 2_850_000 }
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const client = result.validActions[0];
    expect(client?.type).toBe("create_or_update_client");
    if (client?.type === "create_or_update_client") {
      expect(client.data.role).toBeUndefined();
    }
  });

  it("tracks rejected actions and keeps clarification reasons", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            role: "buyer"
          } as never
        },
        {
          type: "create_task",
          data: {
            client_name: "דניאל"
          } as never
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toEqual([]);
    expect(result.rejectedActions).toEqual([
      {
        actionType: "create_or_update_client",
        reason: "client name is required"
      },
      {
        actionType: "create_task",
        reason: "task title is required"
      }
    ]);
    expect(result.clarification_questions).toContain(
      "מה השם המלא של הלקוח כדי שאוכל ליצור או לעדכן את כרטיס הלקוח?"
    );
    expect(result.clarification_questions).toContain(
      "מה בדיוק צריך לבצע כדי שאוכל ליצור את המשימה שביקשת?"
    );
  });

  it("rejects follow-up tasks that lack any due window", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_task",
          data: {
            title: "להתקשר לדניאל לגבי ההצעות",
            client_name: "דניאל"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toEqual([]);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_task",
      reason: "due_time required for scheduled tasks"
    });
    expect(result.clarification_questions.some((q) => q.includes("שעה מדויקת לא חובה"))).toBe(true);
  });

  it("rejects tasks without client_name", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_task",
          data: {
            title: "להתקשר מחר",
            due_time: "מחר"
          } as never
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toEqual([]);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_task",
      reason: "task client_name is required"
    });
  });

  it("accepts property actions without owner_client_name when address is present", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_property",
          data: {
            address: "ביאליק 23",
            city: "רמת גן",
            asking_price: 2_850_000
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.rejectedActions).toEqual([]);
    expect(result.validActions).toHaveLength(1);
    expect(result.validActions[0]).toMatchObject({
      type: "create_or_update_property",
      data: { address: "ביאליק 23", city: "רמת גן", asking_price: 2_850_000 }
    });
  });

  it("normalizes client interaction patches", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "איתי",
            interactions: [
              { summary: "ביקור בדירה — חיובי", property_address: "הירדן 12", type: "פגישה" },
              { description: "Fallback summary field" },
              { summary: "" }
            ]
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toHaveLength(1);
    const client = result.validActions[0];
    expect(client?.type).toBe("create_or_update_client");
    if (client?.type === "create_or_update_client") {
      expect(client.data.interactions).toEqual([
        { summary: "ביקור בדירה — חיובי", property_address: "הירדן 12", kind: "פגישה" },
        { summary: "Fallback summary field" }
      ]);
    }
  });

  it("rejects property actions that lack address", () => {
    const result = validateParseResult({
      actions: [
        {
          type: "create_or_update_property",
          data: {
            city: "רמת גן",
            rooms: 3.5
          } as never
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    expect(result.validActions).toEqual([]);
    expect(result.rejectedActions).toContainEqual({
      actionType: "create_or_update_property",
      reason: "property address is required"
    });
  });
});
