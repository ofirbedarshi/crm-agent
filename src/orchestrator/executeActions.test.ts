import { beforeEach, describe, expect, it } from "vitest";
import { getDemoCrmState, resetDemoCrmStore } from "../crm/demoCrmStore";
import { getFakeCrmState, resetFakeCrm } from "../crm/fakeCrmAdapter";
import { executeActions } from "./executeActions";

describe("executeActions", () => {
  beforeEach(() => {
    resetFakeCrm();
    resetDemoCrmStore();
  });

  it("reports created then updated for same client name", () => {
    const first = executeActions([
      { type: "create_or_update_client", data: { name: "דניאל", role: "buyer" } }
    ]);
    expect(first).toHaveLength(1);
    expect(first[0]?.clientOperation).toBe("created");

    const second = executeActions([
      {
        type: "create_or_update_client",
        data: { name: "דניאל", role: "owner", preferences: { city: "חיפה" } }
      }
    ]);
    expect(second).toHaveLength(1);
    expect(second[0]?.clientOperation).toBe("updated");
    expect(getFakeCrmState().clients[0]?.preferences?.city).toBe("חיפה");

    const third = executeActions([
      {
        type: "create_or_update_client",
        data: { name: "דניאל", preferences: { areas: ["תל אביב"] } }
      }
    ]);
    expect(third).toHaveLength(1);
    expect(third[0]?.clientOperation).toBe("updated");
    expect(getFakeCrmState().clients[0]?.preferences?.city).toBe("חיפה");
    expect(getFakeCrmState().clients[0]?.preferences?.areas).toEqual(["תל אביב"]);
  });

  it("does not set clientOperation for tasks", () => {
    const results = executeActions([
      { type: "create_task", data: { title: "להתקשר", client_name: "דניאל" } }
    ]);
    expect(results[0]?.clientOperation).toBeUndefined();
    expect(results[0]?.actionType).toBe("create_task");
  });

  it("creates property rows in fake CRM and demo snapshot", () => {
    executeActions([
      {
        type: "create_or_update_property",
        data: {
          address: "ביאליק 23",
          city: "רמת גן",
          rooms: 3.5,
          features: ["קומה 2", "ללא מעלית"],
          asking_price: 2_850_000,
          price_note: "לאמת מול שוק",
          owner_client_name: "מיכל כהן"
        }
      }
    ]);
    const p = getFakeCrmState().properties[0];
    expect(p?.address).toBe("ביאליק 23");
    expect(p?.asking_price).toBe(2_850_000);
    expect(getDemoCrmState().properties[0]?.address).toBe("ביאליק 23");
    expect(getDemoCrmState().properties[0]?.priceNote).toBe("לאמת מול שוק");
  });
});
