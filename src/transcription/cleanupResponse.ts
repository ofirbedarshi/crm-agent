export interface CleanupResult {
  cleaned_text: string;
  confidence_estimate: number;
  unclear_parts: string[];
}

/** Parse and validate GPT JSON cleanup response with safe fallbacks. */
export function parseCleanupJson(content: string, rawFallback: string): CleanupResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { cleaned_text: rawFallback, confidence_estimate: 0.5, unclear_parts: [] };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { cleaned_text: rawFallback, confidence_estimate: 0.5, unclear_parts: [] };
  }

  const obj = parsed as Record<string, unknown>;

  const cleaned =
    typeof obj.cleaned_text === "string" && obj.cleaned_text.trim().length > 0
      ? obj.cleaned_text.trim()
      : rawFallback;

  let confidence = Number(obj.confidence_estimate);
  if (!Number.isFinite(confidence)) confidence = 0.75;
  confidence = Math.min(1, Math.max(0, confidence));

  const unclear: string[] = Array.isArray(obj.unclear_parts)
    ? (obj.unclear_parts as unknown[]).filter(
        (x): x is string => typeof x === "string" && x.trim().length > 0
      )
    : [];

  return { cleaned_text: cleaned, confidence_estimate: confidence, unclear_parts: unclear };
}
