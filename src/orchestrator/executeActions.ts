import { createOrUpdateClient, createTask } from "../crm/fakeCrmAdapter";
import type { SupportedAction } from "../types/parser";

export interface ActionExecutionResult {
  actionType: SupportedAction["type"];
  success: boolean;
  entityId?: string;
}

export function executeActions(actions: SupportedAction[]): ActionExecutionResult[] {
  return actions.map((action) => {
    if (action.type === "create_or_update_client") {
      const client = createOrUpdateClient(action.data);
      return { actionType: action.type, success: true, entityId: client.id };
    }

    const task = createTask(action.data);
    return { actionType: action.type, success: true, entityId: task.id };
  });
}
