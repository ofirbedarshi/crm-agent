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
    vi.spyOn(console, "log").mockImplementation(() => undefined);
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
            due_time: "מחר",
            client_name: "דניאל לוי"
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
    expect(clientAction?.data.name).toBe("דניאל לוי");
    expect(clientAction?.data.preferences).toEqual({
      city: "גבעתיים",
      property_type: "דירת 4 חדרים",
      budget: 3200000
    });
    expect(result.actions.find((a) => a.type === "create_task")).toEqual({
      type: "create_task",
      data: {
        title: "לקבוע שיחת פולואפ עם דניאל",
        due_time: "מחר",
        client_name: "דניאל לוי"
      }
    });
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
            due_time: "בעוד יומיים",
            client_name: "לקוח מהביקור"
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
    expect(result.actions[0]).toEqual({
      type: "create_task",
      data: {
        title: "שליחת פרטי מימון ללקוח",
        due_time: "בעוד יומיים",
        client_name: "לקוח מהביקור"
      }
    });
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
    expect(result.actions[0]).toEqual({
      type: "create_task",
      data: {
        title: "צריך לדבר עם דניאל מחר",
        due_time: "מחר",
        client_name: "דניאל"
      }
    });
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
    expect(result.clarification_questions[0]).toContain("כדי שאוכל ליצור או לעדכן");
    expect(result.clarification_questions[0]).not.toBe("מה שם הלקוח?");
  });

  it("adds contextual fallback clarification when no actions or questions are returned", async () => {
    mockOpenAiJsonContent({
      actions: [],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("דבר איתו מחר");
    expect(result.actions).toEqual([]);
    expect(result.clarification_questions).toEqual([
      "מה חסר בהודעה כדי שאוכל לבצע את הפעולה שביקשת?"
    ]);
    expect(result.clarification_questions[0]).not.toBe("איזו פעולה תרצה שאבצע מהעדכון הזה?");
  });

  it("returns debug pipeline metadata when debug mode is enabled", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לחזור ללקוח",
            client_name: "דניאל כהן"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("תזכורת לחזור ללקוח", { debug: true });

    expect(result.actions).toHaveLength(1);
    expect(result._debug?.intent).toEqual({ intent: "create_task" });
    expect(result._debug?.entities).toEqual({
      title: "לחזור ללקוח",
      client_name: "דניאל כהן"
    });
    expect(result._debug?.validation).toEqual({
      isValid: true,
      missingFields: []
    });
    expect(result._debug?.decision).toEqual({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לחזור ללקוח",
            client_name: "דניאל כהן"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });
    expect(result._debug?.llm.model).toBe("gpt-4o");
    expect(result._debug?.llm.parseStatus).toBe("ok");
  });

  it("intent prefers client over property when property appears first in JSON", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_or_update_property",
          data: {
            address: "ביאליק 1",
            city: "רמת גן",
            owner_client_name: "מיכל כהן"
          }
        },
        {
          type: "create_or_update_client",
          data: { name: "מיכל כהן", role: "owner" }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("מיכל רוצה למכור את הדירה ברמת גן", { debug: true });

    expect(result._debug?.intent).toEqual({ intent: "create_client" });
  });

  it("intent prefers property over task when task appears first in JSON", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            title: "פגישה בנכס",
            client_name: "מיכל כהן"
          }
        },
        {
          type: "create_or_update_property",
          data: {
            address: "ביאליק 1",
            city: "רמת גן",
            owner_client_name: "מיכל כהן"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("פגישה אצל מיכל בביאליק", { debug: true });

    expect(result._debug?.intent).toEqual({ intent: "create_property" });
  });

  it("drops create_task without client_name — entity linkage required", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            title: "לשלוח סיכום שיחה"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("שלח סיכום שיחה ללקוח");
    expect(result.actions).toEqual([]);
    expect(result.clarification_questions.some((q) => q.includes("לקוח"))).toBe(true);
  });

  it("adds title to missing_info when task title is missing", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_task",
          data: {
            client_name: "דניאל לוי"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage("תיצור משימה לדניאל");

    expect(result.actions).toEqual([]);
    expect(result.missing_info).toContain("title");
    expect(result.clarification_questions).toContain(
      "מה בדיוק צריך לבצע כדי שאוכל ליצור את המשימה שביקשת?"
    );
  });

  it("keeps full lead context for serious buyer with two follow-up tasks", async () => {
    mockOpenAiJsonContent({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            role: "buyer",
            lead_source: "פייסבוק",
            lead_temperature: "hot",
            preferences: {
              areas: ["גבעתיים", "רמת גן"],
              property_type: "דירת 4 חדרים",
              budget: 3400000,
              features: ["מעלית", "חניה"],
              flexible_entry: "עד חצי שנה"
            }
          }
        },
        {
          type: "create_task",
          data: {
            title: "לשלוח לדניאל לוי שלוש אופציות היום בערב",
            due_time: "היום בערב",
            client_name: "דניאל לוי"
          }
        },
        {
          type: "create_task",
          data: {
            title: "לחזור לדניאל לוי מחר ב-11:00",
            due_time: "מחר ב-11:00",
            client_name: "דניאל לוי"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await parseMessage(
      "דיברתי עכשיו עם דניאל לוי, הגיע מפייסבוק. מחפש דירת 4 חדרים בגבעתיים או רמת גן, תקציב עד 3.4 מיליון, מעדיף מעלית וחניה, גמיש בכניסה עד חצי שנה. נשמע רציני, ביקש שאשלח לו שלוש אופציות היום בערב ואחזור אליו מחר ב־11."
    );

    const clientAction = result.actions.find((a) => a.type === "create_or_update_client");
    expect(clientAction?.data).toEqual({
      name: "דניאל לוי",
      role: "buyer",
      lead_source: "פייסבוק",
      lead_temperature: "hot",
      preferences: {
        areas: ["גבעתיים", "רמת גן"],
        property_type: "דירת 4 חדרים",
        budget: 3400000,
        features: ["מעלית", "חניה"],
        flexible_entry: "עד חצי שנה"
      }
    });
    expect(result.actions.filter((a) => a.type === "create_task")).toHaveLength(2);
    expect(result.clarification_questions).toEqual([]);
  });
});
