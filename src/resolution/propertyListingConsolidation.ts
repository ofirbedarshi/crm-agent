import type { FakeProperty } from "../crm/fakeCrmAdapter";
import type { ClientInteractionPatch, SupportedAction } from "../types/parser";

function normalizeListingAddress(addr: string): string {
  return addr.trim().replace(/\s+/g, " ");
}

function normalizedAddressesFromInteractionPatch(patch: ClientInteractionPatch): string[] {
  const raw = [
    patch.property_address?.trim(),
    ...(patch.property_addresses ?? []).map((x) => x.trim()).filter(Boolean)
  ].filter(Boolean) as string[];
  const keys = [...new Set(raw.map((a) => normalizeListingAddress(a)))];
  return keys;
}

/**
 * **Pipeline phase — property linkage (after identity resolution on actions).**
 *
 * When validated actions include client `interactions[]` with `property_address` and/or
 * `property_addresses`, and the batch has no `create_or_update_property` yet:
 *
 * - Interactions must cite **exactly one** normalized listing address (otherwise ambiguous → no-op).
 * - Append a minimal structural `create_or_update_property`: address + optional `owner_client_name`
 *   copied only from an SSOT listing row when one matches (demo keeps visit narrative on the client
 *   interaction only — never copies summaries onto listing notes here).
 *
 * Inputs are **structured parser output + CRM snapshot only** — no regex/heuristics on raw user text.
 */
export function consolidateListingPatchesFromInteractionAddresses(
  actions: SupportedAction[],
  persistedProperties: FakeProperty[]
): SupportedAction[] {
  if (actions.some((a) => a.type === "create_or_update_property")) {
    return actions;
  }

  const citedNormalizedAddresses = new Set<string>();
  for (const a of actions) {
    if (a.type !== "create_or_update_client") {
      continue;
    }
    for (const inter of a.data.interactions ?? []) {
      for (const key of normalizedAddressesFromInteractionPatch(inter)) {
        citedNormalizedAddresses.add(key);
      }
    }
  }

  if (citedNormalizedAddresses.size !== 1) {
    return actions;
  }

  const normalizedAddr = [...citedNormalizedAddresses][0]!;
  const existing = persistedProperties.find(
    (p) => normalizeListingAddress(p.address) === normalizedAddr
  );

  if (existing?.owner_client_name?.trim()) {
    const injected: SupportedAction = {
      type: "create_or_update_property",
      data: {
        address: existing.address.trim(),
        owner_client_name: existing.owner_client_name.trim()
      }
    };
    return [...actions, injected];
  }

  if (existing) {
    const injected: SupportedAction = {
      type: "create_or_update_property",
      data: {
        address: existing.address.trim()
      }
    };
    return [...actions, injected];
  }

  const injected: SupportedAction = {
    type: "create_or_update_property",
    data: {
      address: normalizedAddr
    }
  };

  return [...actions, injected];
}
