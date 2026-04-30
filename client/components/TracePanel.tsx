interface TracePanelProps {
  trace: Record<string, unknown> | null;
}

interface FlowStage {
  key: string;
  label: string;
  status: "success" | "warning" | "error";
  details: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function renderArraySummary(value: unknown): string {
  const items = asArray(value)
    .map((item) => asString(item) ?? JSON.stringify(item))
    .filter((item): item is string => typeof item === "string" && item.length > 0);
  if (items.length === 0) {
    return "none";
  }
  return items.join(" | ");
}

function buildStages(trace: Record<string, unknown>): FlowStage[] {
  const input = asRecord(trace.input);
  const llm = asRecord(trace.llm);
  const parser = asRecord(trace.parser);
  const validation = asRecord(trace.validation);
  const crm = asRecord(trace.crm);
  const response = asRecord(trace.response);
  const error = asRecord(trace.error);

  const parserActions = asArray(parser?.actions);
  const rejectedActions = asArray(validation?.rejectedActions);
  const clarificationQuestions = asArray(validation?.clarificationQuestions);
  const executionResults = asArray(crm?.executionResults);
  const replyType = asString(response?.replyType);
  const errorMessage = asString(error?.message);

  return [
    {
      key: "input",
      label: "1. Input Received",
      status: "success",
      details: [
        `Raw text: ${asString(input?.rawMessage) ?? "missing"}`,
        `History messages: ${String(input?.historyCount ?? 0)}`
      ]
    },
    {
      key: "llm",
      label: "2. LLM Request",
      status: llm ? "success" : "warning",
      details: [
        `Model: ${asString(llm?.model) ?? "unknown"}`,
        `Prompt sent: ${asString(llm?.userPrompt) ?? "missing"}`,
        `Raw LLM response: ${asString(llm?.rawResponseText) ?? "missing"}`
      ]
    },
    {
      key: "parser",
      label: "3. Parsing",
      status: parserActions.length > 0 ? "success" : "warning",
      details: [
        `Detected actions: ${parserActions.length}`,
        `Missing info: ${renderArraySummary(parser?.missing_info)}`
      ]
    },
    {
      key: "validation",
      label: "4. Validation",
      status:
        clarificationQuestions.length > 0 || rejectedActions.length > 0
          ? "warning"
          : "success",
      details: [
        `Accepted actions: ${asArray(validation?.validActions).length}`,
        `Rejected actions: ${rejectedActions.length}`,
        `Clarifications: ${renderArraySummary(validation?.clarificationQuestions)}`
      ]
    },
    {
      key: "crm",
      label: "5. CRM Execution",
      status: executionResults.length > 0 ? "success" : "warning",
      details: [
        `Executed operations: ${executionResults.length}`,
        `Result ids: ${renderArraySummary(
          executionResults.map((result) => asRecord(result)?.entityId).filter(Boolean)
        )}`
      ]
    },
    {
      key: "response",
      label: "6. Final Response",
      status: errorMessage ? "error" : replyType === "clarification" ? "warning" : "success",
      details: [
        `Response type: ${replyType ?? "unknown"}`,
        `Reply: ${asString(response?.formattedReply) ?? "missing"}`,
        errorMessage ? `Error: ${errorMessage}` : "Error: none"
      ]
    }
  ];
}

function TracePanel({ trace }: TracePanelProps) {
  const stages = trace ? buildStages(trace) : [];

  return (
    <aside className="trace-panel">
      <header className="trace-panel-header">System Trace</header>
      <div className="trace-panel-body">
        {trace ? (
          <div className="trace-flow">
            {stages.map((stage, index) => (
              <div key={stage.key}>
                <section className={`trace-stage trace-stage-${stage.status}`}>
                  <div className="trace-stage-title">{stage.label}</div>
                  <ul className="trace-stage-list">
                    {stage.details.map((detail) => (
                      <li key={detail}>{detail}</li>
                    ))}
                  </ul>
                </section>
                {index < stages.length - 1 ? <div className="trace-stage-arrow">↓</div> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="trace-panel-empty">No trace yet. Send a message to view the latest pipeline flow.</p>
        )}
      </div>
    </aside>
  );
}

export default TracePanel;
