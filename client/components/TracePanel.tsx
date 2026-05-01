interface TracePanelProps {
  trace: Record<string, unknown> | null;
}

interface FlowStage {
  key: string;
  title: string;
  status: "success" | "warning" | "error";
  lines: string[];
  hint?: string;
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

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max).trim()}…`;
}

function formatMoneyHe(n: number): string {
  try {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0
    }).format(n);
  } catch {
    return `${n.toLocaleString("he-IL")} ₪`;
  }
}

function translatePipelineStage(stage: string): string {
  const map: Record<string, string> = {
    chat_route: "טיפול בבקשת הצ׳אט",
    parse: "פרשנות ההודעה",
    validate: "אימות הפעולות",
    execute: "ביצוע ב-CRM",
    response: "הכנת התגובה"
  };
  return map[stage] ?? stage;
}

function translateRejectedReason(reason: string): string {
  const map: Record<string, string> = {
    "client name is required": "חסר שם לקוח ברור — לא ניתן ליצור או לעדכן כרטיס ללא שם.",
    "task title is required": "חסר כותרת למשימה — לא ניתן לפתוח משימה ריקה."
  };
  return map[reason] ?? reason;
}

function missingInfoHuman(key: string): string {
  const map: Record<string, string> = {
    name: "שם מלא של הלקוח",
    client_name: "שם מלא של הלקוח",
    title: "ניסוח ברור של המשימה",
    task_title: "ניסוח ברור של המשימה"
  };
  return map[key] ?? key;
}

function roleHuman(role: unknown): string {
  if (role === "buyer") {
    return "מתעניין / קונה";
  }
  if (role === "owner") {
    return "בעל נכס";
  }
  if (role === "unknown") {
    return "לא סווג";
  }
  return "";
}

function describeClientAction(data: Record<string, unknown>): string {
  const name = asString(data.name) ?? "(ללא שם)";
  const role = roleHuman(data.role);
  const leadSource = asString(data.lead_source);
  const leadTemperature =
    data.lead_temperature === "hot"
      ? "חם"
      : data.lead_temperature === "warm"
        ? "חמים"
        : data.lead_temperature === "cold"
          ? "קר"
          : data.lead_temperature === "unknown"
            ? "לא ידוע"
            : undefined;
  const prefs = asRecord(data.preferences);
  const bits: string[] = [`לקוח: ${name}`];
  if (role) {
    bits.push(`תפקיד: ${role}`);
  }
  if (leadSource) {
    bits.push(`מקור ליד: ${leadSource}`);
  }
  if (leadTemperature) {
    bits.push(`בשלות: ${leadTemperature}`);
  }
  if (prefs) {
    const city = asString(prefs.city);
    const areas = asArray(prefs.areas).filter((x): x is string => typeof x === "string");
    const pt = asString(prefs.property_type);
    const budget = asNumber(prefs.budget);
    const features = asArray(prefs.features).filter((x): x is string => typeof x === "string");
    const flexibleEntry = asString(prefs.flexible_entry);
    const prefBits: string[] = [];
    if (city) {
      prefBits.push(`עיר ${city}`);
    }
    if (areas.length > 0) {
      prefBits.push(`אזורים ${areas.join(", ")}`);
    }
    if (pt) {
      prefBits.push(`סוג נכס ${pt}`);
    }
    if (budget !== undefined) {
      prefBits.push(`תקציב עד ${formatMoneyHe(budget)}`);
    }
    if (features.length > 0) {
      prefBits.push(`העדפות ${features.join(", ")}`);
    }
    if (flexibleEntry) {
      prefBits.push(`גמישות כניסה ${flexibleEntry}`);
    }
    if (prefBits.length > 0) {
      bits.push(`העדפות: ${prefBits.join(" · ")}`);
    }
  }
  return bits.join(" — ");
}

function describeTaskAction(data: Record<string, unknown>): string {
  const title = asString(data.title) ?? "(ללא כותרת)";
  const client = asString(data.client_name);
  const due = asString(data.due_time);
  const bits = [`משימה: ${title}`];
  if (client) {
    bits.push(`עבור ${client}`);
  }
  if (due) {
    bits.push(`מועד יעד: ${due}`);
  }
  return bits.join(" — ");
}

function describeParsedAction(action: unknown): string | null {
  const rec = asRecord(action);
  if (!rec) {
    return null;
  }
  const type = asString(rec.type);
  const data = asRecord(rec.data);
  if (!type || !data) {
    return null;
  }
  if (type === "create_or_update_client") {
    return `כרטיס לקוח — ${describeClientAction(
      data
    )}. יצירה מול עדכון נקבעים רק בשלב הביצוע, לפי קיום השם במערכת.`;
  }
  if (type === "create_task") {
    return `פתיחת משימה במערכת — ${describeTaskAction(data)}`;
  }
  return `פעולה מהסוג «${type}»`;
}

function describeAcceptedAction(action: unknown): string | null {
  return describeParsedAction(action);
}

function describeExecutionLine(exec: Record<string, unknown>, pairedAction: unknown): string {
  const ok = exec.success !== false;
  const outcome = ok ? "בוצע בהצלחה" : "נכשל";
  const fallbackType = asString(exec.actionType);

  if (fallbackType === "create_or_update_client") {
    const op = exec.clientOperation;
    const verb =
      op === "created"
        ? "נוצר כרטיס לקוח חדש"
        : op === "updated"
          ? "עודכן כרטיס לקוח קיים"
          : "כרטיס לקוח — לא דווח מהשרת אם נוצר או עודכן";
    const paired = asRecord(pairedAction);
    const data = paired ? asRecord(paired.data) : null;
    const detail = data ? describeClientAction(data) : "";
    return detail ? `${verb} — ${detail} — ${outcome}` : `${verb} — ${outcome}`;
  }

  const human = pairedAction ? describeParsedAction(pairedAction) : null;
  const core =
    human ??
    (fallbackType === "create_task"
      ? "יצירת משימה"
      : fallbackType ?? "פעולת CRM");
  return `${core} — ${outcome}`;
}

function collectTimingLines(timing: Record<string, unknown> | null): string[] {
  if (!timing || Object.keys(timing).length === 0) {
    return [];
  }
  const parts: string[] = [];
  const parseMs = asNumber(timing.parseMs);
  const validateMs = asNumber(timing.validateMs);
  const executeMs = asNumber(timing.executeMs);
  const responseMs = asNumber(timing.responseMs);
  const totalMs = asNumber(timing.totalMs);
  if (parseMs !== undefined) {
    parts.push(`פרשנות ${parseMs} ms`);
  }
  if (validateMs !== undefined) {
    parts.push(`אימות ${validateMs} ms`);
  }
  if (executeMs !== undefined) {
    parts.push(`CRM ${executeMs} ms`);
  }
  if (responseMs !== undefined) {
    parts.push(`תגובה ${responseMs} ms`);
  }
  if (parts.length === 0) {
    return [];
  }
  const tail =
    totalMs !== undefined ? ` · סה״כ כ-${Math.round(totalMs)} ms` : "";
  return [`מהירות שלבים: ${parts.join(" · ")}${tail}`];
}

function buildActionItems(
  clarificationQuestions: unknown[],
  rejectedActions: unknown[],
  missingFromValidation: unknown[],
  missingFromParser: unknown[]
): string[] {
  const items: string[] = [];

  for (const q of clarificationQuestions) {
    const s = asString(q);
    if (s) {
      items.push(s);
    }
  }

  for (const j of rejectedActions) {
    const r = asRecord(j);
    if (!r) {
      continue;
    }
    const reason = translateRejectedReason(asString(r.reason) ?? "");
    const actionType = asString(r.actionType);
    const label =
      actionType === "create_or_update_client"
        ? "כרטיס לקוח"
        : actionType === "create_task"
          ? "משימה"
          : actionType ?? "פעולה";
    items.push(`לטפל בדחייה (${label}): ${reason}`);
  }

  const missing = new Set<string>();
  for (const m of [...missingFromValidation, ...missingFromParser]) {
    const key = typeof m === "string" ? m : "";
    if (key) {
      missing.add(missingInfoHuman(key));
    }
  }
  for (const label of missing) {
    items.push(`להשלים מידע חסר: ${label}`);
  }

  return items;
}

function buildHebrewFlow(trace: Record<string, unknown>): {
  stages: FlowStage[];
  actionItems: string[];
  globalError: string | null;
  timingFooter: string[];
} {
  const input = asRecord(trace.input);
  const llm = asRecord(trace.llm);
  const parser = asRecord(trace.parser);
  const validation = asRecord(trace.validation);
  const crm = asRecord(trace.crm);
  const response = asRecord(trace.response);
  const error = asRecord(trace.error);
  const timing = asRecord(trace.timing);

  const rawMessage = asString(input?.rawMessage);
  const historyCount = typeof input?.historyCount === "number" ? input.historyCount : 0;

  const parserActions = asArray(parser?.actions);
  const validationValid = asArray(validation?.validActions);
  const rejectedActions = asArray(validation?.rejectedActions);
  const clarificationQuestions = asArray(validation?.clarificationQuestions);
  const validationMissing = asArray(validation?.missingInfo ?? validation?.missing_info);
  const parserMissing = asArray(parser?.missing_info);

  const executionResults = asArray(crm?.executionResults);

  const replyType = asString(response?.replyType);
  const formattedReply = asString(response?.formattedReply ?? response?.generatedResponse);

  const errorMessage = asString(error?.message);
  const errorStage = asString(error?.stage);

  const parseStatus = asString(llm?.parseStatus);
  const llmOk = llm && parseStatus !== "invalid_json";

  const globalError =
    errorMessage && errorStage
      ? `שגיאה בשלב «${translatePipelineStage(errorStage)}»: ${errorMessage}`
      : errorMessage
        ? `שגיאה: ${errorMessage}`
        : null;

  const stages: FlowStage[] = [];

  stages.push({
    key: "input",
    title: "קלט מהמשתמש",
    status: rawMessage ? "success" : "warning",
    lines: [
      rawMessage ? `הודעה שנשלחה לעיבוד: «${truncate(rawMessage, 480)}»` : "לא התקבלה הודעת משתמש ברורה.",
      historyCount > 0
        ? `נשמר הקשר מהשיחה: ${historyCount} הודעות קודמות במטמון הבקשה.`
        : "זו הודעה ראשונה בהקשר הנוכחי (אין היסטוריה שנדחפה לשרת בשלב זה)."
    ]
  });

  const llmLines: string[] = [];
  if (llm) {
    llmLines.push(`מודל: ${asString(llm.model) ?? "לא ידוע"}`);
    llmLines.push(
      parseStatus === "invalid_json"
        ? "התקבלה תשובה מהמודל שלא ניתן לפרסר כמבנה תקין — הוזן טיפול חירום בשלב הפרשנות."
        : "תשובת המודל פוענחה כמבנה תקין והועברה להמשך זיהוי פעולות."
    );
    const prompt = asString(llm.userPrompt);
    if (prompt) {
      llmLines.push(`פרומפט שנשלח לטיפול (תקציר): «${truncate(prompt, 280)}»`);
    }
    const rawText = asString(llm.rawResponseText);
    if (parseStatus === "invalid_json" && rawText) {
      llmLines.push(`קטע מהפלט הגולמי לצורך דיבוג: «${truncate(rawText, 220)}»`);
    }
  } else {
    llmLines.push("לא רושמה קריאה למודל ברמת המעקב (אולי השלב לא מולא או שהזרימה נקטעה מוקדם).");
  }

  stages.push({
    key: "llm",
    title: "הבנה בשפת טבע (מודל)",
    status: llm ? (llmOk ? "success" : "warning") : "warning",
    lines: llmLines,
    hint: llm && parseStatus === "invalid_json" ? "פעולה מומלצת: לבדוק את תצורת המודל או להקשיח הנחיות פורמט." : undefined
  });

  const parseLines: string[] = [];
  if (parserActions.length === 0) {
    parseLines.push("לא זוהו פעולות CRM מתוך ההודעה (או שהפרסור החזיר רשימה ריקה).");
  } else {
    parseLines.push(`זוהו ${parserActions.length} פעולות פוטנציאליות מהטקסט:`);
    parserActions.forEach((a, i) => {
      const line = describeParsedAction(a);
      parseLines.push(line ? `${i + 1}. ${line}` : `${i + 1}. לא ניתן לקרוא את מבנה הפעולה`);
    });
  }
  if (parserMissing.length > 0) {
    parseLines.push(
      `חוסרים שזוהו כבר בשלב הפרשנות: ${parserMissing.map((k) => missingInfoHuman(String(k))).join(", ")}`
    );
  }

  stages.push({
    key: "parser",
    title: "זיהוי פעולות",
    status: parserActions.length > 0 ? "success" : "warning",
    lines: parseLines
  });

  const validationLines: string[] = [];
  const validationStatus: FlowStage["status"] =
    rejectedActions.length > 0 || clarificationQuestions.length > 0 ? "warning" : "success";

  if (validationValid.length === 0) {
    validationLines.push("אף פעולה לא עברה את האימות ולכן לא תישלחנה קריאות ל-CRM בשלב הבא.");
  } else {
    validationLines.push(`פעולות שאושרו לאחר כללי העסק (${validationValid.length}):`);
    validationValid.forEach((a, i) => {
      const line = describeAcceptedAction(a);
      validationLines.push(line ? `${i + 1}. ${line}` : `${i + 1}. לא ניתן להציג את הפעולה`);
    });
  }

  if (rejectedActions.length > 0) {
    validationLines.push("פעולות שנחסמו באימות:");
    rejectedActions.forEach((row, i) => {
      const r = asRecord(row);
      const reason = translateRejectedReason(asString(r?.reason) ?? "");
      const actionType = asString(r?.actionType);
      const label =
        actionType === "create_or_update_client"
          ? "כרטיס לקוח"
          : actionType === "create_task"
            ? "יצירת משימה"
            : actionType ?? "פעולה לא ידועה";
      validationLines.push(`${i + 1}. ${label} — ${reason}`);
    });
  }

  if (clarificationQuestions.length > 0) {
    validationLines.push("נדרשת הבהרה מהמשתמש לפני המשך:");
    clarificationQuestions.forEach((q, i) => {
      const s = asString(q);
      if (s) {
        validationLines.push(`${i + 1}. ${s}`);
      }
    });
  }

  if (validationMissing.length > 0) {
    validationLines.push(
      `שדות חסרים ברמת האימות: ${validationMissing.map((k) => missingInfoHuman(String(k))).join(", ")}`
    );
  }

  stages.push({
    key: "validation",
    title: "אימות והצלבה",
    status: validationStatus,
    lines: validationLines,
    hint:
      rejectedActions.length > 0
        ? "פעולה מומלצת: לעדכן את ההודעה או להוסיף פרטים כדי שהפעולה תעבור אימות."
        : undefined
  });

  const crmLines: string[] = [];
  let crmStatus: FlowStage["status"] = "warning";

  if (executionResults.length > 0) {
    crmStatus = executionResults.every((r) => asRecord(r)?.success !== false) ? "success" : "warning";
    crmLines.push("מה שבוצע בפועל מול מתאם ה-CRM (בלי מזהים פנימיים):");
    executionResults.forEach((row, i) => {
      const ex = asRecord(row);
      if (!ex) {
        return;
      }
      const paired = validationValid[i];
      crmLines.push(`${i + 1}. ${describeExecutionLine(ex, paired)}`);
    });
  } else if (validationValid.length > 0 && clarificationQuestions.length === 0) {
    crmLines.push("ציפינו לביצוע פעולות שאושרו, אך לא נרשמו תוצאות ביצוע במעקב.");
    crmStatus = "warning";
  } else if (clarificationQuestions.length > 0) {
    crmLines.push("לא בוצעו קריאות CRM כי התקבלה תשובת הבהרה — צריך מענה מהמשתמש לפני המשך המסלול.");
    crmStatus = "warning";
  } else if (validationValid.length === 0) {
    crmLines.push("לא בוצעו קריאות CRM כי לא נותרו פעולות מאושרות.");
    crmStatus = "warning";
  } else {
    crmLines.push("לא בוצעו קריאות CRM בשלב זה.");
    crmStatus = "warning";
  }

  stages.push({
    key: "crm",
    title: "קריאות ל-CRM",
    status: crmStatus,
    lines: crmLines
  });

  const responseLines: string[] = [];
  let responseStatus: FlowStage["status"] = "success";
  if (replyType === "clarification") {
    responseStatus = "warning";
  }
  if (replyType === "fallback") {
    responseStatus = "warning";
  }
  if (errorMessage && !globalError?.includes(errorMessage)) {
    responseStatus = "error";
  }

  responseLines.push(
    replyType
      ? `סוג תגובה למשתמש: ${replyType === "actions" ? "אחרי פעולות שבוצעו" : replyType === "clarification" ? "שאלת הבהרה" : "ברירת מחדל / לא ברור"}`
      : "לא סווג סוג התגובה במעקב."
  );
  responseLines.push(
    formattedReply ? `טקסט שהמשתמש רואה: «${truncate(formattedReply, 420)}»` : "לא הוגדר טקסט תגובה במעקב."
  );

  stages.push({
    key: "response",
    title: "מה שהמשתמש מקבל בצ׳אט",
    status: responseStatus,
    lines: responseLines
  });

  const actionItems = buildActionItems(
    clarificationQuestions,
    rejectedActions,
    validationMissing,
    parserMissing
  );

  const timingFooter = collectTimingLines(timing);

  return { stages, actionItems, globalError, timingFooter };
}

function TracePanel({ trace }: TracePanelProps) {
  const flow = trace ? buildHebrewFlow(trace) : null;
  const stages = flow?.stages ?? [];

  return (
    <aside className="trace-panel" dir="rtl" lang="he">
      <header className="trace-panel-header">מסלול עיבוד ההודעה</header>
      <div className="trace-panel-body">
        {!trace ? (
          <p className="trace-panel-empty">
            עדיין אין מסלול להצגה. שלחו הודעה כדי לראות את השלבים והקריאות ל-CRM.
          </p>
        ) : (
          <>
            {flow?.globalError ? (
              <div className="trace-global-error" role="alert">
                {flow.globalError}
              </div>
            ) : null}

            <div className="trace-flow">
              {stages.map((stage, index) => (
                <div key={stage.key}>
                  <section className={`trace-stage trace-stage-${stage.status}`}>
                    <div className="trace-stage-kicker">שלב {index + 1}</div>
                    <div className="trace-stage-title">{stage.title}</div>
                    {stage.hint ? <p className="trace-stage-hint">{stage.hint}</p> : null}
                    <ul className="trace-stage-list">
                      {stage.lines.map((line, lineIndex) => (
                        <li key={`${stage.key}-${lineIndex}`}>{line}</li>
                      ))}
                    </ul>
                  </section>
                  {index < stages.length - 1 ? (
                    <div className="trace-stage-arrow" aria-hidden="true">
                      ↓
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {flow && flow.actionItems.length > 0 ? (
              <section className="trace-action-box" aria-label="מה לעשות עכשיו">
                <div className="trace-action-box-title">מה כדאי לטפל בהמשך</div>
                <ul className="trace-action-box-list">
                  {flow.actionItems.map((item, itemIndex) => (
                    <li key={`action-${itemIndex}`}>{item}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            {flow && flow.timingFooter.length > 0 ? (
              <footer className="trace-timing-footer">{flow.timingFooter[0]}</footer>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

export default TracePanel;
