import type { ClientPreferences } from "../types/parser";

/** Deep-merge preference patches into existing CRM prefs (arrays/city/etc. keep prior values when omitted in patch). */
export function mergeClientPreferences(
  existing: ClientPreferences | undefined,
  patch: ClientPreferences | undefined
): ClientPreferences | undefined {
  if (!existing && !patch) {
    return undefined;
  }
  if (!existing) {
    return patch;
  }
  if (!patch) {
    return existing;
  }

  const merged: ClientPreferences = {
    ...existing,
    ...patch
  };

  if (patch.areas === undefined) {
    merged.areas = existing.areas;
  }
  if (patch.features === undefined) {
    merged.features = existing.features;
  }
  if (patch.city === undefined) {
    merged.city = existing.city;
  }
  if (patch.property_type === undefined) {
    merged.property_type = existing.property_type;
  }
  if (patch.budget === undefined) {
    merged.budget = existing.budget;
  }
  if (patch.entry_date === undefined) {
    merged.entry_date = existing.entry_date;
  }
  if (patch.flexible_entry === undefined) {
    merged.flexible_entry = existing.flexible_entry;
  }

  return merged;
}
