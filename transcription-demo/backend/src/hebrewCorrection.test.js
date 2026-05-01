import assert from "node:assert";
import test from "node:test";
import { applyHebrewPostCorrection } from "./hebrewCorrection.js";

/**
 * Easy to extend: add more rows with raw/model/expected.
 */
const CASES = [
  {
    name: "fix common ASR confusion תקווה -> תקבע in command context",
    raw: "קיצר תקווה לי פגישה למחר בשעה שמונה בבוקר",
    model: "קיצר תקווה לי פגישה למחר בשעה שמונה בבוקר",
    expected: "קיצר תקבע לי פגישה למחר בשעה שמונה בבוקר.",
  },
  {
    name: "keep proper names unchanged",
    raw: "תקווה לי פגישה עם אורן חדד מחר בבוקר",
    model: "תקווה לי פגישה עם אורן חדד מחר בבוקר",
    expected: "תקבע לי פגישה עם אורן חדד מחר בבוקר.",
  },
  {
    name: "normalize punctuation spacing",
    raw: "קיצר,תקבע לי פגישה למחר",
    model: "קיצר,תקבע לי פגישה למחר",
    expected: "קיצר, תקבע לי פגישה למחר.",
  },
  {
    name: "do not touch sentence already good",
    raw: "תזכירי לי להתקשר לדניאל היום בערב",
    model: "תזכירי לי להתקשר לדניאל היום בערב",
    expected: "תזכירי לי להתקשר לדניאל היום בערב.",
  },
];

for (const c of CASES) {
  test(c.name, () => {
    assert.strictEqual(applyHebrewPostCorrection(c.raw, c.model), c.expected);
  });
}
