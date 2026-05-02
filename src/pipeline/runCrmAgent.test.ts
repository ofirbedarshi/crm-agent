import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCrmAgent } from "./runCrmAgent";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import { executeActions } from "../orchestrator/executeActions";

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
    resetDemoCrmStore();
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

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(1);
    expect(state.clients).toHaveLength(1);
    expect(state.clients[0]?.name).toBe("רוני אביטל");
    expect(state.activityLog.length).toBeGreaterThanOrEqual(1);
    expect(getDemoCrmState().clients).toHaveLength(1);
    expect(getDemoCrmState().clients[0]?.name).toBe("רוני אביטל");
    expect(result.response).toContain("יצרתי כרטיס לקוח");
    expect(result.executionResults).toHaveLength(1);
    expect(result.trace.validation?.validActions).toHaveLength(1);
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
            due_time: "מחר",
            client_name: "הילה מזרחי"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(2);
    expect(state.clients).toHaveLength(1);
    expect(state.tasks).toHaveLength(1);
    expect(state.activityLog.length).toBeGreaterThanOrEqual(2);
    expect(result.response).toContain("יצרתי כרטיס לקוח");
    expect(result.response).toContain("יצרתי משימה");
    expect(result.trace.crm?.executionResults).toHaveLength(2);
    expect(getDemoCrmState().calendar.length).toBeGreaterThanOrEqual(1);
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

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(0);
    expect(state.clients).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(result.response).toContain("מה השם המלא של הלקוח");
    expect(result.trace.response?.replyType).toBe("clarification");
  });

  it("blocks client update when user said only דניאל but the model chose דניאל לוי", async () => {
    executeActions([
      {
        type: "create_or_update_client",
        data: { name: "דניאל לוי", role: "buyer", preferences: { areas: ["רמת גן"] } }
      },
      { type: "create_or_update_client", data: { name: "דניאל כהן", role: "buyer" } }
    ]);

    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            preferences: { areas: ["רמת גן", "גבעתיים", "תל אביב"] }
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({
      rawMessage: "דניאל מעוניין גם להתגורר בתל אביב",
      pipelineInput: "דניאל מעוניין גם להתגורר בתל אביב",
      historyCount: 0
    });

    expect(result.validActions).toHaveLength(0);
    expect(result.response).toMatch(/לא ברור על מי מתכוונים/);
    expect(getFakeCrmState().clients.find((c) => c.name === "דניאל לוי")?.preferences?.areas).toEqual(["רמת גן"]);
  });

  it("ambiguous shared first name blocks task execution until clarified", async () => {
    executeActions([
      { type: "create_or_update_client", data: { name: "דניאל לוי", role: "buyer" } },
      { type: "create_or_update_client", data: { name: "דניאל כהן", role: "buyer" } }
    ]);

    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "פגישה עם דניאל לגבי הצעה",
            client_name: "דניאל",
            due_time: "מחר ב-8 בבוקר"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });

    expect(getFakeCrmState().tasks).toHaveLength(0);
    expect(result.validActions).toHaveLength(0);
    expect(result.response).toMatch(/לא ברור על איזה לקוח/);
    expect(result.trace.response?.replyType).toBe("clarification");
  });

  it("resolves task client_name to canonical full name when unique", async () => {
    executeActions([
      { type: "create_or_update_client", data: { name: "דניאל לוי", role: "buyer" } },
      { type: "create_or_update_client", data: { name: "דניאל כהן", role: "buyer" } }
    ]);

    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "פגישה לגבי הצעה",
            client_name: "דניאל לוי",
            due_time: "מחר ב-8 בבוקר"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });

    expect(result.validActions).toHaveLength(1);
    expect(getFakeCrmState().tasks).toHaveLength(1);
    expect(getFakeCrmState().tasks[0]?.client_name).toBe("דניאל לוי");
    expect(result.executionResults).toHaveLength(1);
  });

  it("runs client upsert even when a follow-up task needs due_time clarification", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: { name: "דניאל", role: "buyer", preferences: { areas: ["רמת גן"] } }
        },
        {
          type: "create_task",
          data: { title: "להתקשר לדניאל", client_name: "דניאל" }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
    const state = getFakeCrmState();

    expect(result.validActions).toHaveLength(1);
    expect(state.clients).toHaveLength(1);
    expect(state.tasks).toHaveLength(0);
    expect(result.executionResults).toHaveLength(1);
    expect(result.response).toContain("יצרתי כרטיס לקוח");
    expect(result.response).toContain("מתי תרצה");
    expect(result.trace.response?.replyType).toBe("actions");
  });

  it("ambiguous task does not invent client_name", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לשלוח מסמכים במייל"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
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

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });

    expect(result.validActions).toEqual([
      {
        type: "create_task",
        data: {
          title: "לשלוח עדכון"
        }
      }
    ]);
    expect(result.trace.validation?.rejectedActions).toEqual([]);
  });
});
