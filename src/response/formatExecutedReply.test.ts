import { describe, expect, it } from "vitest";
import type { ActionExecutionResult } from "../orchestrator/executeActions";
import { formatExecutedReply } from "./formatExecutedReply";

describe("formatExecutedReply", () => {
  it("uses created wording for new clients", () => {
    const execution: ActionExecutionResult = {
      actionType: "create_or_update_client",
      success: true,
      clientOperation: "created",
      clientSnapshot: {
        id: "c1",
        name: "דניאל לוי",
        role: "buyer",
        preferences: { areas: ["רמת גן", "גבעתיים"] }
      }
    };

    const text = formatExecutedReply(
      [
        {
          type: "create_or_update_client",
          data: { name: "דניאל לוי", role: "buyer", preferences: { areas: ["רמת גן", "גבעתיים"] } }
        }
      ],
      [execution]
    );

    expect(text).toContain("יצרתי כרטיס לקוח");
    expect(text).not.toContain("עדכנתי את פרטי הלקוח");
    expect(text).toMatch(/רמת גן/);
  });

  it("uses updated wording and mentions what changed", () => {
    const execution: ActionExecutionResult = {
      actionType: "create_or_update_client",
      success: true,
      clientOperation: "updated",
      clientSnapshot: {
        id: "c1",
        name: "דניאל לוי",
        preferences: {
          areas: ["רמת גן", "תל אביב"],
          budget: 3400000,
          features: ["מעלית", "חניה"]
        }
      }
    };

    const text = formatExecutedReply(
      [
        {
          type: "create_or_update_client",
          data: { name: "דניאל לוי", preferences: { areas: ["רמת גן", "תל אביב"] } }
        }
      ],
      [execution]
    );

    expect(text).toContain("עדכנתי את פרטי הלקוח");
    expect(text).toContain("עדכון הפעם");
    expect(text).toMatch(/תל אביב/);
    expect(text).not.toContain("תקציב");
    expect(text).not.toContain("דרישות");
  });

  it("formats tasks with optional due_time", () => {
    const text = formatExecutedReply(
      [{ type: "create_task", data: { title: "לשלוח הצעות", client_name: "דניאל" } }],
      [{ actionType: "create_task", success: true }]
    );
    expect(text).toContain("יצרתי משימה");
    expect(text).toContain("לשלוח הצעות");
  });

  it("formats property cards with address and notes", () => {
    const text = formatExecutedReply(
      [
        {
          type: "create_or_update_property",
          data: {
            address: "ביאליק 23",
            city: "רמת גן",
            rooms: 3.5,
            asking_price: 2_850_000,
            price_note: "לבדוק מחיר שוק",
            owner_client_name: "מיכל כהן"
          }
        }
      ],
      [{ actionType: "create_or_update_property", success: true, entityId: "p1" }]
    );
    expect(text).toMatch(/יצרתי כרטיס נכס עבור מיכל כהן בכתובת ביאליק 23/);
    expect(text).not.toContain("בעלים:");
    expect(text).toMatch(/מחיר שוק/);
  });
});
