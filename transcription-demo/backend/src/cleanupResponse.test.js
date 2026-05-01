import assert from "node:assert";
import test from "node:test";
import { parseCleanupJson } from "./cleanupResponse.js";

test("parseCleanupJson accepts valid payload", () => {
  const r = parseCleanupJson(
    JSON.stringify({
      cleaned_text: "תקבע לי פגישה",
      confidence_estimate: 0.9,
      unclear_parts: ["בוקר"],
    }),
    "fallback",
  );
  assert.strictEqual(r.cleaned_text, "תקבע לי פגישה");
  assert.strictEqual(r.confidence_estimate, 0.9);
  assert.deepStrictEqual(r.unclear_parts, ["בוקר"]);
});

test("parseCleanupJson falls back on invalid JSON", () => {
  const r = parseCleanupJson("not json", "raw");
  assert.strictEqual(r.cleaned_text, "raw");
  assert.strictEqual(r.confidence_estimate, 0.5);
  assert.deepStrictEqual(r.unclear_parts, []);
});

test("parseCleanupJson clamps confidence", () => {
  const high = parseCleanupJson(JSON.stringify({ cleaned_text: "x", confidence_estimate: 99 }), "");
  assert.strictEqual(high.confidence_estimate, 1);
  const low = parseCleanupJson(JSON.stringify({ cleaned_text: "x", confidence_estimate: -1 }), "");
  assert.strictEqual(low.confidence_estimate, 0);
});
