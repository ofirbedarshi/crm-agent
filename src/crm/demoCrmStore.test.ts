import { beforeEach, describe, expect, it } from "vitest";
import {
  getDemoCrmState,
  recordPipelineClientUpsert,
  recordPipelineProperty,
  recordPipelineTask,
  resetDemoCrmStore
} from "./demoCrmStore";

describe("demoCrmStore", () => {
  beforeEach(() => {
    resetDemoCrmStore();
  });

  it("starts empty", () => {
    expect(getDemoCrmState()).toEqual({ clients: [], properties: [], calendar: [] });
  });

  it("records new client then update", () => {
    recordPipelineClientUpsert(
      {
        name: "טל",
        role: "buyer",
        lead_source: "פייסבוק",
        lead_temperature: "warm",
        preferences: {
          areas: ["גבעתיים", "רמת גן"],
          property_type: "דירת 4 חדרים",
          features: ["מעלית", "חניה"],
          flexible_entry: "עד חצי שנה"
        }
      },
      "c-1",
      "created"
    );
    expect(getDemoCrmState().clients).toHaveLength(1);
    expect(getDemoCrmState().clients[0]?.status).toBe("חדש");
    expect(getDemoCrmState().clients[0]?.leadSource).toBe("פייסבוק");
    expect(getDemoCrmState().clients[0]?.leadTemperature).toBe("חמים");
    expect(getDemoCrmState().clients[0]?.preferences.areas).toEqual(["גבעתיים", "רמת גן"]);
    expect(getDemoCrmState().clients[0]?.preferences.features).toEqual([
      "דירת 4 חדרים",
      "מעלית",
      "חניה"
    ]);
    expect(getDemoCrmState().clients[0]?.preferences.flexibleEntry).toBe("עד חצי שנה");

    recordPipelineClientUpsert({ name: "טל", role: "owner", preferences: { city: "נתניה" } }, "c-1", "updated");
    const c = getDemoCrmState().clients[0];
    expect(c?.kind).toBe("מוכר");
    expect(c?.preferences.city).toBe("נתניה");
    expect(c?.status).toBe("בטיפול");
  });

  it("records task on calendar", () => {
    recordPipelineTask({ title: "לחזור", client_name: "טל", due_time: "מחר" }, "t-1");
    expect(getDemoCrmState().calendar).toHaveLength(1);
    expect(getDemoCrmState().calendar[0]?.kind).toBe("משימה");
    expect(getDemoCrmState().calendar[0]?.title).toBe("לחזור");
  });

  it("merges interactions when updating an existing demo client", () => {
    recordPipelineClientUpsert({ name: "נועה", role: "buyer" }, "c-1", "created");
    recordPipelineClientUpsert(
      {
        name: "נועה",
        interactions: [{ summary: "שיחת מעקב קצרה", property_address: "ביאליק 5" }]
      },
      "c-1",
      "updated"
    );
    const c = getDemoCrmState().clients[0];
    expect(c?.interactions).toHaveLength(1);
    expect(c?.interactions?.[0]?.summary).toBe("שיחת מעקב קצרה");
    expect(c?.interactions?.[0]?.propertyAddresses).toEqual(["ביאליק 5"]);
  });

  it("links a pipeline task id to the matching client's latest interaction", () => {
    recordPipelineClientUpsert(
      {
        name: "טל",
        role: "buyer",
        interactions: [{ summary: "פגישה קצרה", kind: "פגישה", property_address: "רוטשילד 1" }]
      },
      "c-1",
      "created"
    );
    recordPipelineTask({ title: "לשלוח הצעה", client_name: "טל", due_time: "מחר" }, "t-99");
    const ix = getDemoCrmState().clients[0]?.interactions?.[0];
    expect(ix?.relatedTaskIds).toEqual(["t-99"]);
  });

  it("updates existing demo property notes instead of duplicating by address", () => {
    recordPipelineProperty({ address: "הירדן 12", owner_client_name: "דני", general_notes: "קיים" }, "p-1");
    recordPipelineProperty(
      {
        address: "הירדן 12",
        owner_client_name: "דני",
        price_note: "משוב אחרי ביקור"
      },
      "p-2"
    );
    expect(getDemoCrmState().properties).toHaveLength(1);
    const prop = getDemoCrmState().properties[0];
    expect(prop?.priceNote).toContain("משוב אחרי ביקור");
    expect(prop?.generalNotes).toContain("קיים");
    expect(prop?.id).toBe("p-2");
  });

  it("records property with optional owner", () => {
    recordPipelineProperty(
      {
        address: "ביאליק 23",
        city: "רמת גן",
        rooms: 3.5,
        asking_price: 2_850_000,
        price_note: "לבדוק שוק",
        general_notes: "פתוחה לבלעדיות בהערכת שווי",
        owner_client_name: "מיכל כהן",
        features: ["חניה בטאבו", "קומה 2", "בלי מעלית"]
      },
      "p-1"
    );
    const prop = getDemoCrmState().properties[0];
    expect(prop?.address).toBe("ביאליק 23");
    expect(prop?.priceNote).toBe("לבדוק שוק");
    expect(prop?.generalNotes).toContain("בלעדיות");
    expect(prop?.ownerClientName).toBe("מיכל כהן");
    expect(prop?.features).toEqual(["חניה בטאבו", "קומה 2", "בלי מעלית"]);
  });
});
