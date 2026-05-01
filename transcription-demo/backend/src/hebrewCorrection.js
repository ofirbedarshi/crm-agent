/**
 * Lightweight deterministic post-correction layer.
 * Keeps behavior predictable for known ASR issues while GPT handles broader cleanup.
 */
export function applyHebrewPostCorrection(rawText, modelCleanedText) {
  const base = String(modelCleanedText || rawText || "").trim();
  if (!base) return "";

  let text = base;

  // Common Hebrew ASR confusion in command phrasing: "תקווה לי ..." -> "תקבע לי ..."
  text = text.replace(/תקווה(?=\s+לי(?:\s|$))/g, "תקבע");
  text = text.replace(/תיקווה(?=\s+לי(?:\s|$))/g, "תקבע");

  // Keep punctuation readable and consistent.
  text = text.replace(/,\s*/g, ", ");
  text = text.replace(/\s{2,}/g, " ").trim();

  if (!/[.!?]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}
