import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseMessage } from "./parseMessage";

function mockOpenAiJsonContent(contentObject: unknown): void {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(contentObject)
          }
        }
      ]
    })
  });

  vi.stubGlobal("fetch", mockFetch);
}

describe("parseMessage", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("parses a new buyer lead into supported actions", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            role: "buyer",
            preferences: { city: "גבעתיים", property_type: "דירת 4 חדרים", budget: 3200000 }
          }
        },
        {
          type: "create_task",
          data: {
            title: "לקבוע שיחת פולואפ עם דניאל",
            due_time: "מחר"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("דיברתי עם דניאל לוי, מחפש דירת 4 חדרים בגבעתיים");

    expect(result.actions.map((a) => a.type)).toEqual([
      "create_or_update_client",
      "create_task"
    ]);
    const clientAction = result.actions.find((a) => a.type === "create_or_update_client");
    const taskAction = result.actions.find((a) => a.type === "create_task");
    expect(clientAction?.data.name).toBe("דניאל לוי");
    expect(clientAction?.data.preferences).toEqual({
      city: "גבעתיים",
      property_type: "דירת 4 חדרים",
      budget: 3200000
    });
    expect(taskAction?.data.title).toBe("לקבוע שיחת פולואפ עם דניאל");
    expect(result.missing_info).toEqual([]);
    expect(result.clarification_questions).toEqual([]);
  });

  it("parses owner conversation and normalizes preferences structure", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "מיכל כהן",
            role: "owner",
            city: "תל אביב",
            property_type: "דירה"
          }
        }
      ],
      missing_info: ["property_address"],
      clarification_questions: ["מה הכתובת המדויקת של הנכס?"]
    });

    const result = await parseMessage("שוחחתי עם מיכל כהן, יש לה דירה למכירה בתל אביב");

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe("create_or_update_client");
    expect(result.actions[0]?.data).toEqual({
      name: "מיכל כהן",
      role: "owner",
      preferences: {
        city: "תל אביב",
        property_type: "דירה"
      }
    });
    expect(result.clarification_questions.length).toBeGreaterThan(0);
  });

  it("parses follow-up after visit and filters unsupported actions", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            title: "שליחת פרטי מימון ללקוח",
            due_time: "בעוד יומיים"
          }
        },
        {
          type: "log_interaction",
          data: {
            summary: "Visited the apartment"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("היינו בביקור בדירה, תיצור לי פולואפ לגבי מימון");

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]?.type).toBe("create_task");
    expect(result.actions[0]?.data.title).toBe("שליחת פרטי מימון ללקוח");
  });

  it("normalizes inconsistent task fields into title only", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            task_description: "צריך לדבר עם דניאל מחר",
            due_date: "מחר",
            client_name: "דניאל"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("צריך לדבר עם דניאל מחר");
    const taskAction = result.actions[0];
    expect(taskAction?.type).toBe("create_task");
    expect(taskAction?.data.title).toBe("צריך לדבר עם דניאל מחר");
    expect(taskAction?.data).not.toHaveProperty("description");
    expect(taskAction?.data).not.toHaveProperty("task");
    expect(taskAction?.data).not.toHaveProperty("task_description");
  });

  it("drops client action when required name is missing and adds clarification", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            role: "unknown"
          }
        }
      ],
      missing_info: ["client_name"],
      clarification_questions: []
    });

    const result = await parseMessage("דיברתי עם לקוח חדש");
    expect(result.actions.find((action) => action.type === "create_or_update_client")).toBeUndefined();
    expect(result.clarification_questions.length).toBeGreaterThan(0);
  });

});
