export type SupportedActionType = "create_or_update_client" | "create_task" | "create_or_update_property";

export interface ClientPreferences {
  city?: string;
  areas?: string[];
  property_type?: string;
  budget?: number;
  entry_date?: string;
  features?: string[];
  flexible_entry?: string;
}

/** Free-text CRM touchpoint appended to the client timeline (visit, call, WhatsApp, etc.). */
export interface ClientInteractionPatch {
  summary: string;
  /** Primary listing for linkage / property merge (same as before). */
  property_address?: string;
  /** Extra listing addresses tied to the same touch (e.g. second property discussed in a call). */
  property_addresses?: string[];
  /** סוג המגע — e.g. פגישה, שיחה, הודעה (Hebrew labels or short English tokens). */
  kind?: string;
}

export interface ClientInteraction extends ClientInteractionPatch {
  id: string;
  recorded_at: string;
  /** Demo UI: task entity ids appended when a task for this client is recorded in the same pipeline batch. */
  related_task_ids?: string[];
}

export interface CreateOrUpdateClientAction {
  type: "create_or_update_client";
  data: {
    name: string;
    role?: "buyer" | "owner" | "unknown";
    lead_source?: string;
    lead_temperature?: "hot" | "warm" | "cold" | "unknown";
    preferences?: ClientPreferences;
    /** New interaction rows to append (e.g. post-visit summary). */
    interactions?: ClientInteractionPatch[];
  };
}

export interface CreateTaskAction {
  type: "create_task";
  data: {
    title: string;
    due_time?: string;
    /** Required before execution — ties task to a client entity (validated server-side). */
    client_name?: string;
  };
}

/** Listed asset / property for sale — physical details and pricing notes live here, not on the seller client card. */
export interface CreateOrUpdatePropertyAction {
  type: "create_or_update_property";
  data: {
    /** Full street + number; city may also appear in city */
    address: string;
    city?: string;
    rooms?: number;
    /** Free-form traits e.g. קומה, מעלית, חניה */
    features?: string[];
    asking_price?: number;
    /** e.g. need market-price validation */
    price_note?: string;
    general_notes?: string;
    /** Required before execution — must match seller client card name (validated server-side). */
    owner_client_name?: string;
  };
}

export type SupportedAction = CreateOrUpdateClientAction | CreateTaskAction | CreateOrUpdatePropertyAction;

export interface ParseMessageResult {
  actions: SupportedAction[];
  missing_info: string[];
  clarification_questions: string[];
}
