/**
 * User-story acceptance tests for CRM flows described in natural Hebrew.
 * Pipeline is exercised with a mocked parser (fast, deterministic).
 * For real OpenAI behavior run: npm run eval:user-stories
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import {
  assertUs001PipelineStrict,
  assertUs002PipelineStrict,
  type PipelineStoryContext
} from "./assertUserStoryPipeline";
import { US_001_BUYER_FROM_FACEBOOK, US_002_SELLER_LISTING_MEETING } from "./userStoryPrompts";

vi.mock("../parser/parseMessage", () => ({
  parseMessage: vi.fn()
}));

import { parseMessage } from "../parser/parseMessage";

const parseMessageMock = vi.mocked(parseMessage);

describe("user stories", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
    vi.clearAllMocks();
  });

  it("US-001: פרטי קונה מפייסבוק, העדפות אזור/תקציב/תכונות ומשימות שליחת הצעות ופולואפ", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "דניאל לוי",
            role: "buyer",
            lead_source: "פייסבוק",
            lead_temperature: "warm",
            preferences: {
              areas: ["גבעתיים", "רמת גן"],
              property_type: "דירת 4 חדרים",
              budget: 3_400_000,
              features: ["מעלית", "חניה"],
              flexible_entry: "עד חצי שנה"
            }
          }
        },
        {
          type: "create_task",
          data: {
            title: "לשלוח לדניאל לוי שלוש אופציות בערב",
            client_name: "דניאל לוי"
          }
        },
        {
          type: "create_task",
          data: {
            title: "לחזור לדניאל לוי מחר ב־11",
            due_time: "מחר ב־11",
            client_name: "דניאל לוי"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({
      rawMessage: US_001_BUYER_FROM_FACEBOOK,
      pipelineInput: US_001_BUYER_FROM_FACEBOOK,
      historyCount: 0
    });

    const ctx: PipelineStoryContext = {
      result,
      fakeCrm: getFakeCrmState(),
      demoCrm: getDemoCrmState()
    };
    expect(() => assertUs001PipelineStrict(ctx)).not.toThrow();
  });

  it("US-002: מוכרת — מחיר בכרטיס לקוח, פרטי נכס נפרדים, הערות מחיר/כללי ופגישה בנכס", async () => {
    parseMessageMock.mockResolvedValue({
      actions: [
        {
          type: "create_or_update_client",
          data: {
            name: "מיכל כהן",
            role: "owner",
            preferences: { budget: 2_850_000 }
          }
        },
        {
          type: "create_or_update_property",
          data: {
            address: "ביאליק 23",
            city: "רמת גן",
            rooms: 3.5,
            features: ["קומה 2", "ללא מעלית", "חניה בטאבו"],
            asking_price: 2_850_000,
            price_note: "לבדוק מחיר שוק לפני קביעת מחיר סופי",
            general_notes:
              "פתוחה לבלעדיות אם תוגש הערכת שווי מסודרת (כפי שנאמר בשיחה)",
            owner_client_name: "מיכל כהן"
          }
        },
        {
          type: "create_task",
          data: {
            title: "פגישה בנכס עם מיכל כהן",
            due_time: "יום חמישי אחר הצהריים",
            client_name: "מיכל כהן"
          }
        }
      ],
      missing_info: [],
      clarification_questions: []
    });

    const result = await runCrmAgent({
      rawMessage: US_002_SELLER_LISTING_MEETING,
      pipelineInput: US_002_SELLER_LISTING_MEETING,
      historyCount: 0
    });

    const ctx: PipelineStoryContext = {
      result,
      fakeCrm: getFakeCrmState(),
      demoCrm: getDemoCrmState()
    };
    expect(() => assertUs002PipelineStrict(ctx)).not.toThrow();
  });
});
