import { beforeEach, describe, expect, it } from "vitest";
import { getDemoCrmState, recordPipelineClientUpsert, recordPipelineTask, resetDemoCrmStore } from "./demoCrmStore";

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
});
