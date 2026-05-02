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

/** Resolve a human-entered name token against CRM clients (exact match, else unique multi-token substring match). */
export function findMatchingClients(token: string, clients: FakeClient[]): FakeClient[] {
  const normalizedToken = normalizeWhitespace(token);
  if (!normalizedToken) {
    return [];
  }

  const rows = clients.map((c) => ({
    client: c,
    nn: normalizeWhitespace(c.name)
  }));

  const exact = rows.filter((r) => r.nn === normalizedToken).map((r) => r.client);
  if (exact.length > 0) {
    return exact;
  }

  const words = normalizedToken.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [];
  }

  return rows.filter((r) => words.every((w) => r.nn.includes(w))).map((r) => r.client);
}

function clarificationAmbiguous(kind: "client" | "task", rawToken: string, candidates: FakeClient[]): string {
  const names = candidates.map((c) => `«${c.name}»`).join(", ");
  if (kind === "task") {
    return `לא ברור על איזה לקוח מתכוונים מהכינוי «${rawToken}» כדי לקבוע את המשימה — האם מדובר ב${names}? תכתוב את השם המלא המדויק.`;
  }
  return `לא ברור על מי מתכוונים מהכינוי «${rawToken}» — במערכת יש את הלקוחות ${names}. תכתוב את השם המלא המדויק כדי שאעדכן את הנכון.`;
}

function clarificationMissingTaskClient(rawToken: string): string {
  return `לא מצאתי במערכת לקוח בשם «${rawToken}» כדי לשייך אליו משימה — תן שם מלא כפי שמופיע אצלך במערכת או צור קודם כרטיס לקוח.`;
}

function scrubWordToken(word: string): string {
  return word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function messageWords(rawUserMessage: string): string[] {
  return normalizeWhitespace(rawUserMessage)
    .split(/\s+/)
    .map(scrubWordToken)
    .filter((w) => w.length > 0);
}

function messageContainsFullClientName(rawUserMessage: string, canonicalName: string): boolean {
  return normalizeWhitespace(rawUserMessage).includes(normalizeWhitespace(canonicalName));
}

/** If the message is non-empty, any word matching >1 CRM row is treated as an ambiguous person reference. */
function firstAmbiguousWordInMessage(
  rawUserMessage: string,
  clients: FakeClient[]
): { word: string; candidates: FakeClient[] } | null {
  for (const w of messageWords(rawUserMessage)) {
    if (w.length < 2) {
      continue;
    }
    const hits = findMatchingClients(w, clients);
    if (hits.length > 1) {
      return { word: w, candidates: hits };
    }
  }
  return null;
}

/**
 * The model may output a full client name even when the user only said "דניאל".
 * Block that unless the user's text actually names the resolved client in full.
 */
function userReferenceBlocksSingleClientMatch(
  rawUserMessage: string,
  canonicalName: string,
  clients: FakeClient[]
): { word: string; candidates: FakeClient[] } | null {
  if (!normalizeWhitespace(rawUserMessage)) {
    return null;
  }
  if (messageContainsFullClientName(rawUserMessage, canonicalName)) {
    return null;
  }
  return firstAmbiguousWordInMessage(rawUserMessage, clients);
}

export function resolveAndEnrichCrmActions(
  actions: SupportedAction[],
  /** Persisted CRM clients only (SSOT), before applying this batch — used for strict matching once data exists. */
  persistedClients: FakeClient[],
  /** Latest user message (not including history) — used to catch under-specified names the model guessed. */
  rawUserMessage = "",
  /** Persisted listings (SSOT) — used in the property-linkage phase after person resolution. */
  persistedProperties: FakeProperty[] = []
): ResolveAndEnrichResult {
  const out: SupportedAction[] = [];
  const clarifications: string[] = [];
  const rejectedActions: Array<{ actionType: string; reason: string }> = [];

  /** Running view of CRM plus clients introduced earlier in this action batch (same OpenAI response). */
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

      const matches = findMatchingClients(rawClient, overlay);
      if (matches.length === 1) {
        const canonical = matches[0]!.name;
        const blocked = userReferenceBlocksSingleClientMatch(rawUserMessage, canonical, overlay);
        if (blocked) {
          clarifications.push(clarificationAmbiguous("task", blocked.word, blocked.candidates));
          rejectedActions.push({
            actionType: action.type,
            reason: "ambiguous user reference for task client"
          });
          continue;
        }
        out.push({
          ...action,
          data: {
            ...action.data,
            client_name: canonical
          }
        });
        continue;
      }

      if (matches.length === 0) {
        // No CRM rows yet: allow informal names (e.g. "דני") for reminders until SSOT has clients.
        if (persistedClients.length === 0) {
          out.push(action);
          continue;
        }
        clarifications.push(clarificationMissingTaskClient(rawClient));
        rejectedActions.push({
          actionType: action.type,
          reason: "task client_name does not resolve to any CRM client"
        });
        continue;
      }

      clarifications.push(clarificationAmbiguous("task", rawClient, matches));
      rejectedActions.push({
        actionType: action.type,
        reason: "ambiguous task client_name"
      });
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

      const matches = findMatchingClients(rawOwner, overlay);
      if (matches.length === 1) {
        const canonical = matches[0]!.name;
        const blocked = userReferenceBlocksSingleClientMatch(rawUserMessage, canonical, overlay);
        if (blocked) {
          clarifications.push(clarificationAmbiguous("task", blocked.word, blocked.candidates));
          rejectedActions.push({
            actionType: action.type,
            reason: "ambiguous user reference for property owner_client_name"
          });
          continue;
        }
        out.push({
          ...action,
          data: {
            ...action.data,
            owner_client_name: canonical
          }
        });
        continue;
      }

      if (matches.length === 0 && persistedClients.length === 0) {
        out.push(action);
        continue;
      }

      if (matches.length === 0) {
        clarifications.push(clarificationMissingTaskClient(rawOwner));
        rejectedActions.push({
          actionType: action.type,
          reason: "property owner_client_name does not resolve to any CRM client"
        });
        continue;
      }

      clarifications.push(clarificationAmbiguous("task", rawOwner, matches));
      rejectedActions.push({
        actionType: action.type,
        reason: "ambiguous property owner_client_name"
      });
      continue;
    }

    const rawName = normalizeWhitespace(action.data.name);
    const matches = findMatchingClients(rawName, overlay);

    if (matches.length === 1) {
      const canonical = matches[0]!.name;
      const blocked = userReferenceBlocksSingleClientMatch(rawUserMessage, canonical, overlay);
      if (blocked) {
        clarifications.push(clarificationAmbiguous("client", blocked.word, blocked.candidates));
        rejectedActions.push({
          actionType: action.type,
          reason: "ambiguous user reference for client upsert"
        });
        continue;
      }

      const mergedPrefs = mergeClientPreferences(matches[0]!.preferences, action.data.preferences);
      const nextData = { ...action.data, name: canonical };
      if (mergedPrefs !== undefined && Object.keys(mergedPrefs).length > 0) {
        nextData.preferences = mergedPrefs;
      } else {
        delete nextData.preferences;
      }

      const updatedClient: FakeClient = {
        ...matches[0]!,
        ...(action.data.role !== undefined ? { role: action.data.role } : {}),
        ...(action.data.lead_source !== undefined ? { lead_source: action.data.lead_source } : {}),
        ...(action.data.lead_temperature !== undefined ? { lead_temperature: action.data.lead_temperature } : {})
      };
      if (mergedPrefs !== undefined && Object.keys(mergedPrefs).length > 0) {
        updatedClient.preferences = mergedPrefs;
      }

      overlay = overlay.map((c) =>
        normalizeWhitespace(c.name) === normalizeWhitespace(canonical) ? updatedClient : c
      );

      out.push({
        ...action,
        data: nextData
      });
      continue;
    }

    if (matches.length === 0) {
      const synthetic: FakeClient = {
        id: `pending:${rawName}`,
        name: rawName,
        ...(action.data.role !== undefined ? { role: action.data.role } : {}),
        ...(action.data.lead_source !== undefined ? { lead_source: action.data.lead_source } : {}),
        ...(action.data.lead_temperature !== undefined ? { lead_temperature: action.data.lead_temperature } : {}),
        ...(action.data.preferences !== undefined ? { preferences: { ...action.data.preferences } } : {})
      };
      overlay.push(synthetic);

      const nextData = { ...action.data, name: rawName };
      if (action.data.preferences !== undefined) {
        nextData.preferences = action.data.preferences;
      } else {
        delete nextData.preferences;
      }

      out.push({
        ...action,
        data: nextData
      });
      continue;
    }

    clarifications.push(clarificationAmbiguous("client", rawName, matches));
    rejectedActions.push({
      actionType: action.type,
      reason: "ambiguous create_or_update_client name"
    });
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
