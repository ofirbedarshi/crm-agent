export type SupportedActionType = "create_or_update_client" | "create_task";

export interface ClientPreferences {
  city?: string;
  property_type?: string;
  budget?: number;
  entry_date?: string;
}

export interface CreateOrUpdateClientAction {
  type: "create_or_update_client";
  data: {
    name: string;
    role?: "buyer" | "owner" | "unknown";
    preferences?: ClientPreferences;
  };
}

export interface CreateTaskAction {
  type: "create_task";
  data: {
    title: string;
    due_time?: string;
    client_name?: string;
  };
}

export type SupportedAction = CreateOrUpdateClientAction | CreateTaskAction;

export interface ParseMessageResult {
  actions: SupportedAction[];
  missing_info: string[];
  clarification_questions: string[];
}
