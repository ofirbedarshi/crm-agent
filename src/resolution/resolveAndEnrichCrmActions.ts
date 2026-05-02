import type { FakeClient, FakeProperty } from "../crm/fakeCrmAdapter";
import { mergeClientPreferences } from "../crm/mergeClientPreferences";
import type { SupportedAction } from "../types/parser";
import { consolidateListingPatchesFromInteractionAddresses } from "./propertyListingConsolidation";

export interface ResolveAndEnrichResult {
  validActions: SupportedAction[];
  clarifications: string[];
  rejectedActions: Array<{ actionType: string; reason: string }>;
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cloneClientsForOverlay(clients: FakeClient[]): FakeClient[] {
  return clients.map((c) => ({
    ...c,
    ...(c.preferences ? { preferences: { ...c.preferences } } : {})
  }));
}

/**
 * Resolve a parser name reference against CRM clients using deterministic rules:
 * - ≥2 words: exact normalized match on client.name only (no substring, no prefix expansion).
 * - 1 word: match by first token of client.name only.
 */
function resolveClientRef(
  parserRef: string,
  clients: FakeClient[]
): { match: FakeClient } | { ambiguous: FakeClient[] } | { notFound: true } {
  const norm = normalizeWhitespace(parserRef);
  const tokens = norm.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) {
    return { notFound: true };
  }

  if (tokens.length >= 2) {
    const exact = clients.filter((c) => normalizeWhitespace(c.name) === norm);
    if (exact.length === 1) return { match: exact[0]! };
    if (exact.length > 1) return { ambiguous: exact };
    return { notFound: true };
  }

  // Single word: first-token match
  const word = tokens[0]!;
  const matches = clients.filter((c) => {
    const firstToken = normalizeWhitespace(c.name).split(/\s+/).filter(Boolean)[0];
    return firstToken === word;
  });
  if (matches.length === 1) return { match: matches[0]! };
  if (matches.length > 1) return { ambiguous: matches };
  return { notFound: true };
}

function clarificationAmbiguousRef(nameDisplayed: string, candidates: FakeClient[]): string {
  const fullNames = candidates
    .map((c) => c.name)
    .sort()
    .join(", ");
  return `יש כמה לקוחות בשם ${nameDisplayed} (${fullNames}), למי התכוונת?`;
}

function clarificationClientNotFound(name: string, isSingleWord: boolean): string {
  if (isSingleWord) {
    return `לא קיים לקוח בשם ${name}, מה השם המלא?`;
  }
  return `לא קיים לקוח בשם ${name} במערכת — בדוק שהשם מדויק כפי שמופיע בכרטיס הלקוח.`;
}

export function resolveAndEnrichCrmActions(
  actions: SupportedAction[],
  /** Persisted CRM clients only (SSOT), before applying this batch. */
  persistedClients: FakeClient[],
  /** Persisted listings (SSOT) — used in the property-linkage phase after person resolution. */
  persistedProperties: FakeProperty[] = []
): ResolveAndEnrichResult {
  const out: SupportedAction[] = [];
  const clarifications: string[] = [];
  const rejectedActions: Array<{ actionType: string; reason: string }> = [];

  /** Running view of CRM plus clients introduced earlier in this action batch (same response). */
  let overlay = cloneClientsForOverlay(persistedClients);

  for (const action of actions) {
    if (action.type === "create_task") {
      const rawClient = action.data.client_name?.trim();
      if (!rawClient) {
        clarifications.push(
          "חסר שיוך לקוח למשימה — צריך שם מלא כדי לקשר משימה לישות במערכת."
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name missing after validation"
        });
        continue;
      }

      const resolved = resolveClientRef(rawClient, overlay);

      if ("match" in resolved) {
        out.push({
          ...action,
          data: { ...action.data, client_name: resolved.match.name }
        });
        continue;
      }

      if ("ambiguous" in resolved) {
        clarifications.push(
          clarificationAmbiguousRef(normalizeWhitespace(rawClient), resolved.ambiguous)
        );
        rejectedActions.push({ actionType: action.type, reason: "ambiguous task client_name" });
        continue;
      }

      // notFound
      const normClient = normalizeWhitespace(rawClient);
      const isSingle = normClient.split(/\s+/).filter(Boolean).length === 1;
      if (isSingle) {
        clarifications.push(clarificationClientNotFound(normClient, true));
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name does not resolve to any CRM client"
        });
        continue;
      }

      // Multi-word name not in CRM: auto-create a bare client card so the task can proceed
      const synthetic: FakeClient = { id: `pending:${normClient}`, name: normClient };
      overlay.push(synthetic);
      out.push({ type: "create_or_update_client", data: { name: normClient } });
      out.push({ ...action, data: { ...action.data, client_name: normClient } });
      continue;
    }

    if (action.type === "create_or_update_property") {
      let rawOwner = action.data.owner_client_name?.trim();
      if (!rawOwner) {
        const ownersOnly = overlay.filter((c) => c.role === "owner");
        if (ownersOnly.length === 1) {
          rawOwner = normalizeWhitespace(ownersOnly[0]!.name);
        }
      }
      if (!rawOwner) {
        out.push(action);
        continue;
      }

      const resolved = resolveClientRef(rawOwner, overlay);

      if ("match" in resolved) {
        out.push({
          ...action,
          data: { ...action.data, owner_client_name: resolved.match.name }
        });
        continue;
      }

      if ("ambiguous" in resolved) {
        clarifications.push(
          clarificationAmbiguousRef(normalizeWhitespace(rawOwner), resolved.ambiguous)
        );
        rejectedActions.push({
          actionType: action.type,
          reason: "ambiguous property owner_client_name"
        });
        continue;
      }

      // notFound
      const isSingle = normalizeWhitespace(rawOwner).split(/\s+/).filter(Boolean).length === 1;
      clarifications.push(clarificationClientNotFound(normalizeWhitespace(rawOwner), isSingle));
      rejectedActions.push({
        actionType: action.type,
        reason: "property owner_client_name does not resolve to any CRM client"
      });
      continue;
    }

    // create_or_update_client
    const rawName = normalizeWhitespace(action.data.name);
    const resolved = resolveClientRef(rawName, overlay);

    if ("match" in resolved) {
      const canonical = resolved.match.name;
      const mergedPrefs = mergeClientPreferences(resolved.match.preferences, action.data.preferences);
      const nextData = { ...action.data, name: canonical };
      if (mergedPrefs !== undefined && Object.keys(mergedPrefs).length > 0) {
        nextData.preferences = mergedPrefs;
      } else {
        delete nextData.preferences;
      }

      const updatedClient: FakeClient = {
        ...resolved.match,
        ...(action.data.role !== undefined ? { role: action.data.role } : {}),
        ...(action.data.lead_source !== undefined ? { lead_source: action.data.lead_source } : {}),
        ...(action.data.lead_temperature !== undefined
          ? { lead_temperature: action.data.lead_temperature }
          : {})
      };
      if (mergedPrefs !== undefined && Object.keys(mergedPrefs).length > 0) {
        updatedClient.preferences = mergedPrefs;
      }

      overlay = overlay.map((c) =>
        normalizeWhitespace(c.name) === normalizeWhitespace(canonical) ? updatedClient : c
      );

      out.push({ ...action, data: nextData });
      continue;
    }

    if ("ambiguous" in resolved) {
      clarifications.push(clarificationAmbiguousRef(rawName, resolved.ambiguous));
      rejectedActions.push({
        actionType: action.type,
        reason: "ambiguous create_or_update_client name"
      });
      continue;
    }

    // notFound — new client creation
    const nameTokens = rawName.split(/\s+/).filter(Boolean);
    if (nameTokens.length < 2) {
      // Single-word name slipped past validation — reject with last-name question
      clarifications.push(`מה שם המשפחה של ${rawName}?`);
      rejectedActions.push({
        actionType: action.type,
        reason: "client name must include first and last name"
      });
      continue;
    }

    const synthetic: FakeClient = {
      id: `pending:${rawName}`,
      name: rawName,
      ...(action.data.role !== undefined ? { role: action.data.role } : {}),
      ...(action.data.lead_source !== undefined ? { lead_source: action.data.lead_source } : {}),
      ...(action.data.lead_temperature !== undefined
        ? { lead_temperature: action.data.lead_temperature }
        : {}),
      ...(action.data.preferences !== undefined ? { preferences: { ...action.data.preferences } } : {})
    };
    overlay.push(synthetic);

    const nextData = { ...action.data, name: rawName };
    if (action.data.preferences !== undefined) {
      nextData.preferences = action.data.preferences;
    } else {
      delete nextData.preferences;
    }

    out.push({ ...action, data: nextData });
  }

  const afterPropertyLinkage = consolidateListingPatchesFromInteractionAddresses(
    out,
    persistedProperties
  );

  return {
    validActions: afterPropertyLinkage,
    clarifications,
    rejectedActions
  };
}
