import { describe, expect, it } from "vitest";
import { validateParseResult } from "./validateParseResult";

describe("validateParseResult", () => {
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
});
