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

  it("allows client update with exact multi-word name match (no rawUserMessage guard)", async () => {
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
      rawMessage: "דניאל לוי מעוניין גם בגבעתיים ותל אביב",
      pipelineInput: "דניאל לוי מעוניין גם בגבעתיים ותל אביב",
      historyCount: 0
    });

    expect(result.validActions).toHaveLength(1);
    expect(result.trace.validation?.clarificationQuestions).toHaveLength(0);
    expect(
      getFakeCrmState().clients.find((c) => c.name === "דניאל לוי")?.preferences?.areas
    ).toEqual(["רמת גן", "גבעתיים", "תל אביב"]);
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
    expect(result.response).toMatch(/יש כמה לקוחות בשם דניאל/);
    expect(result.response).toMatch(/למי התכוונת/);
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
          data: { name: "דניאל לוי", role: "buyer", preferences: { areas: ["רמת גן"] } }
        },
        {
          type: "create_task",
          data: { title: "להתקשר לדניאל לוי", client_name: "דניאל לוי" }
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

  it("task without client_name is rejected with clarification", async () => {
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

    const result = await runCrmAgent({ rawMessage: "input", pipelineInput: "input", historyCount: 0 });
    const state = getFakeCrmState();

    expect(state.tasks).toHaveLength(0);
    expect(result.validActions).toHaveLength(0);
    expect(result.response).toContain("איזה לקוח");
    expect(result.trace.response?.replyType).toBe("clarification");
  });

  it("multi-word client_name not in CRM but sharing first name with existing client → creates new client + task without clarification", async () => {
    // Seed CRM with one Avi already (mirrors the screenshot: turn 1 created אבי לוי).
    executeActions([
      { type: "create_or_update_client", data: { name: "אבי לוי", role: "buyer" } }
    ]);

    // Turn 2: user says full name "אבי כהן" — different last name, NOT in CRM.
    // The parser is expected to emit a normal create_task; the pipeline must auto-create
    // the missing client card and a task, with NO disambiguation question.
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לדבר עם אבי כהן בנוגע לאופציה שדיברנו עליה",
            client_name: "אבי כהן",
            due_time: "מחר"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({
      rawMessage: "תזכיר לי מחר לדבר עם אבי כהן בנוגע לאופציה שדיברנו עליה.",
      pipelineInput: "תזכיר לי מחר לדבר עם אבי כהן בנוגע לאופציה שדיברנו עליה.",
      historyCount: 0
    });

    const state = getFakeCrmState();
    const clientNames = state.clients.map((c) => c.name).sort();

    // Both clients exist after turn 2.
    expect(clientNames).toEqual(["אבי כהן", "אבי לוי"]);

    // Exactly one task created, tied to אבי כהן.
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.client_name).toBe("אבי כהן");
    expect(state.tasks[0]?.due_time).toBe("מחר");

    // No clarification surfaced; reply describes the executed actions.
    expect(result.trace.validation?.clarificationQuestions ?? []).toEqual([]);
    expect(result.trace.response?.replyType).toBe("actions");
    expect(result.response).not.toMatch(/על איזה אבי מדובר/);
    expect(result.response).toContain("יצרתי כרטיס לקוח");
    expect(result.response).toContain("יצרתי משימה");
    expect(result.response).toContain("אבי כהן");

    // Demo CRM mirror reflects both the new client card and the calendar entry.
    const demo = getDemoCrmState();
    expect(demo.clients.map((c) => c.name).sort()).toEqual(["אבי כהן", "אבי לוי"]);
    expect(demo.calendar.some((e) => e.clientName === "אבי כהן")).toBe(true);
  });

  it("unsupported fields are removed during validation", async () => {
    executeActions([
      { type: "create_or_update_client", data: { name: "דניאל לוי", role: "buyer" } }
    ]);

    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לשלוח עדכון",
            client_name: "דניאל לוי",
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
          title: "לשלוח עדכון",
          client_name: "דניאל לוי"
        }
      }
    ]);
    expect(result.trace.validation?.rejectedActions).toEqual([]);
  });
});
