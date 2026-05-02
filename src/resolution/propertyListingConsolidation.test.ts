import { describe, expect, it } from "vitest";
import { consolidateListingPatchesFromInteractionAddresses } from "./propertyListingConsolidation";

describe("consolidateListingPatchesFromInteractionAddresses", () => {
  it("appends listing merge when interactions cite one known address and model omitted property action", () => {
    const props = [
      {
        id: "p1",
        address: "הירדן 12",
        asking_price: 3_000_000,
        owner_client_name: "דני בעלים"
      }
    ];

    const out = consolidateListingPatchesFromInteractionAddresses(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "איתי",
            interactions: [{ summary: "סלון חיובי; מטבח קטן", property_address: "הירדן 12" }]
          }
        },
        {
          type: "create_task",
          data: { title: "פולואפ", due_time: "מחר בערב", client_name: "איתי" }
        }
      ],
      props
    );

    const prop = out.find((a) => a.type === "create_or_update_property");
    expect(prop?.type).toBe("create_or_update_property");
    if (prop?.type === "create_or_update_property") {
      expect(prop.data.address).toBe("הירדן 12");
      expect(prop.data.owner_client_name).toBe("דני בעלים");
      expect(prop.data.general_notes).toBeUndefined();
      expect(prop.data.price_note).toBeUndefined();
    }
  });

  it("treats property_addresses the same as property_address for consolidation", () => {
    const props = [{ id: "p1", address: "הירדן 12", owner_client_name: "דני בעלים" }];
    const out = consolidateListingPatchesFromInteractionAddresses(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "איתי",
            interactions: [{ summary: "משוב מהשטח", property_addresses: ["הירדן 12"] }]
          }
        }
      ],
      props
    );
    expect(out.some((a) => a.type === "create_or_update_property")).toBe(true);
  });

  it("is a no-op when create_or_update_property already exists", () => {
    const out = consolidateListingPatchesFromInteractionAddresses(
      [
        {
          type: "create_or_update_property",
          data: { address: "הירדן 12", owner_client_name: "דני בעלים", general_notes: "exists" }
        }
      ],
      [{ id: "p1", address: "הירדן 12", owner_client_name: "דני בעלים" }]
    );
    expect(out).toHaveLength(1);
  });

  it("appends listing stub without owner when CRM has no row but interactions cite one address", () => {
    const out = consolidateListingPatchesFromInteractionAddresses(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "איתי",
            interactions: [{ summary: "סלון חיובי; מטבח קטן", property_address: "הירדן 12" }]
          }
        }
      ],
      []
    );

    const prop = out.find((a) => a.type === "create_or_update_property");
    expect(prop?.type).toBe("create_or_update_property");
    if (prop?.type === "create_or_update_property") {
      expect(prop.data.address).toBe("הירדן 12");
      expect(prop.data.owner_client_name).toBeUndefined();
      expect(prop.data.general_notes).toBeUndefined();
    }
  });

  it("links persisted listing without owner using address-only merge action", () => {
    const out = consolidateListingPatchesFromInteractionAddresses(
      [
        {
          type: "create_or_update_client",
          data: {
            name: "איתי",
            interactions: [{ summary: "משוב קצר מהשטח", property_address: "הירדן 12" }]
          }
        }
      ],
      [{ id: "p1", address: "הירדן 12", asking_price: 3_000_000 }]
    );

    const prop = out.find((a) => a.type === "create_or_update_property");
    expect(prop?.type).toBe("create_or_update_property");
    if (prop?.type === "create_or_update_property") {
      expect(prop.data.address).toBe("הירדן 12");
      expect(prop.data.owner_client_name).toBeUndefined();
      expect(prop.data.general_notes).toBeUndefined();
      expect(prop.data.asking_price).toBeUndefined();
    }
  });
});
