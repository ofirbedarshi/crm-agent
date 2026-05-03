import { describe, expect, it } from "vitest";
import { parseCleanupJson } from "./cleanupResponse";

describe("parseCleanupJson", () => {
  it("accepts valid payload", () => {
    const r = parseCleanupJson(
      JSON.stringify({ cleaned_text: "תקבע לי פגישה", confidence_estimate: 0.9, unclear_parts: ["בוקר"] }),
      "fallback"
    );
    expect(r.cleaned_text).toBe("תקבע לי פגישה");
    expect(r.confidence_estimate).toBe(0.9);
    expect(r.unclear_parts).toEqual(["בוקר"]);
  });

  it("falls back on invalid JSON", () => {
    const r = parseCleanupJson("not json", "raw");
    expect(r.cleaned_text).toBe("raw");
    expect(r.confidence_estimate).toBe(0.5);
    expect(r.unclear_parts).toEqual([]);
  });

  it("clamps confidence above 1", () => {
    const r = parseCleanupJson(JSON.stringify({ cleaned_text: "x", confidence_estimate: 99 }), "");
    expect(r.confidence_estimate).toBe(1);
  });

  it("clamps confidence below 0", () => {
    const r = parseCleanupJson(JSON.stringify({ cleaned_text: "x", confidence_estimate: -1 }), "");
    expect(r.confidence_estimate).toBe(0);
  });

  it("falls back when cleaned_text is empty string", () => {
    const r = parseCleanupJson(JSON.stringify({ cleaned_text: "  ", confidence_estimate: 0.8 }), "fallback");
    expect(r.cleaned_text).toBe("fallback");
  });
});
