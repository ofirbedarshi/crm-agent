import {
  createOrUpdateClient,
  createOrUpdateProperty,
  createTask,
  type FakeClient
} from "../crm/fakeCrmAdapter";
import {
  recordPipelineClientUpsert,
  recordPipelineProperty,
  recordPipelineTask
} from "../crm/demoCrmStore";
import type { SupportedAction } from "../types/parser";

export interface ActionExecutionResult {
  actionType: SupportedAction["type"];
  success: boolean;
  entityId?: string;
  /** Set only for create_or_update_client (CRM adapter outcome). */
  clientOperation?: "created" | "updated";
  /** Present after successful create_or_update_client — merged CRM snapshot for replies. */
  clientSnapshot?: FakeClient;
}

export function executeActions(actions: SupportedAction[]): ActionExecutionResult[] {
  return actions.map((action) => {
    if (action.type === "create_or_update_client") {
      const { client, operation } = createOrUpdateClient(action.data);
      recordPipelineClientUpsert(action.data, client.id, operation);
      return {
        actionType: action.type,
        success: true,
        entityId: client.id,
        clientOperation: operation,
        clientSnapshot: client
      };
    }

    if (action.type === "create_or_update_property") {
      const prop = createOrUpdateProperty(action.data);
      recordPipelineProperty(action.data, prop.id);
      return {
        actionType: action.type,
        success: true,
        entityId: prop.id
      };
    }

    const task = createTask(action.data);
    recordPipelineTask(action.data, task.id);
    return { actionType: action.type, success: true, entityId: task.id };
  });
}
