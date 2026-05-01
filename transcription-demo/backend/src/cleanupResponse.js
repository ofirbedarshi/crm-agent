/**
 * Parse and validate GPT JSON cleanup response with safe fallbacks.
 */
export function parseCleanupJson(content, rawFallback) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return {
      cleaned_text: rawFallback,
      confidence_estimate: 0.5,
      unclear_parts: [],
    };
  }

  const cleaned =
    typeof parsed.cleaned_text === "string" && parsed.cleaned_text.trim().length > 0
      ? parsed.cleaned_text.trim()
      : rawFallback;

  let confidence = Number(parsed.confidence_estimate);
  if (!Number.isFinite(confidence)) confidence = 0.75;
  confidence = Math.min(1, Math.max(0, confidence));

  let unclear = [];
  if (Array.isArray(parsed.unclear_parts)) {
    unclear = parsed.unclear_parts.filter((x) => typeof x === "string" && x.trim().length > 0);
  }

  return {
    cleaned_text: cleaned,
    confidence_estimate: confidence,
    unclear_parts: unclear,
  };
}
