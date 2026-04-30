import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCrmAgent } from "./runCrmAgent";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";

vi.mock("../parser/parseMessage", () => {
  return {
    parseMessage: vi.fn()
  };
});

import { parseMessage } from "../parser/parseMessage";

const parseMessageMock = vi.mocked(parseMessage);

describe("runCrmAgent", () => {
  beforeEach(() => {
    resetFakeCrm();
    vi.clearAllMocks();
  });

  it("buyer lead creates client", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "רוני אביטל",
            role: "buyer",
            preferences: { city: "חיפה" }
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent("input");
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(1);
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0]?.name).toBe("רוני אביטל");
    expect(result.response).toContain("לקוחות");
  });

  it("buyer lead plus task executes both actions", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "הילה מזרחי",
            role: "buyer",
            preferences: { city: "מודיעין", property_type: "דירת גן" }
          }
        },
        {
          type: "create_task",
          data: {
            title: "לתאם שיחה למחר",
            client_name: "הילה מזרחי"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent("input");
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(2);
    expect(state.clients).toHaveLength(1);
    expect(state.tasks).toHaveLength(1);
    expect(result.response).toContain("לקוחות");
    expect(result.response).toContain("משימות");
  });

  it("missing client name returns clarification and executes nothing", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            role: "unknown"
          } as never
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent("input");
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(0);
    expect(state.clients).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(result.response).toContain("מה השם המלא של הלקוח");
  });

  it("ambiguous task does not invent client_name", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לחזור בנושא המסמכים"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    await runCrmAgent("input");
    const state = getFakeCrmState();

    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.client_name).toBeUndefined();
  });

  it("unsupported fields are removed during validation", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לשלוח עדכון",
            description: "שדה לא נתמך",
            task_description: "גם לא נתמך"
          } as never
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent("input");

    expect(result.validActions).toEqual([
      {
        type: "create_task",
        data: {
          title: "לשלוח עדכון"
        }
      }
    ]);
  });
});
