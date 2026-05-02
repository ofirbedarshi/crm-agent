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

export interface CreateOrUpdateClientAction {
  type: "create_or_update_client";
  data: {
    name: string;
    role?: "buyer" | "owner" | "unknown";
    lead_source?: string;
    lead_temperature?: "hot" | "warm" | "cold" | "unknown";
    preferences?: ClientPreferences;
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
