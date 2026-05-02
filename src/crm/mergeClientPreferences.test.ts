import { describe, expect, it } from "vitest";
import { mergeClientPreferences } from "./mergeClientPreferences";

describe("mergeClientPreferences", () => {
  it("replaces areas from patch while preserving unrelated scalar prefs", () => {
    const merged = mergeClientPreferences(
      { areas: ["רמת גן"], budget: 100 },
      { areas: ["תל אביב"] }
    );
    expect(merged?.areas).toEqual(["תל אביב"]);
    expect(merged?.budget).toBe(100);
  });

  it("returns patch when no existing prefs", () => {
    expect(mergeClientPreferences(undefined, { city: "חיפה" })).toEqual({ city: "חיפה" });
  });
});
