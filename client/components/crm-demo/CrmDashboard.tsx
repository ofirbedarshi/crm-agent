import { useCallback, useEffect, useMemo, useState } from "react";
import { useCrmDemo } from "./CrmDemoContext";
import type {
  CalendarEntryKind,
  ClientPreferences,
  DemoCalendarEntry,
  DemoClient,
  DemoClientInteraction,
  DemoProperty
} from "./types";

type TabId = "clients" | "properties" | "calendar";

const TABS: { id: TabId; label: string }[] = [
  { id: "clients", label: "לקוחות" },
  { id: "properties", label: "נכסים" },
  { id: "calendar", label: "יומן" }
];

function formatPrice(n: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0
  }).format(n);
}

function formatPreferences(p: ClientPreferences): string {
  const parts: string[] = [];
  if (p.city) {
    parts.push(`עיר ${p.city}`);
  }
  if (p.areas && p.areas.length > 0) {
    parts.push(`אזורים ${p.areas.join(", ")}`);
  }
  if (p.rooms !== undefined) {
    parts.push(`${p.rooms} חדרים`);
  }
  if (p.budget !== undefined) {
    parts.push(`תקציב עד ${formatPrice(p.budget)}`);
  }
  if (p.features && p.features.length > 0) {
    parts.push(p.features.join(", "));
  }
  if (p.flexibleEntry) {
    parts.push(`גמישות כניסה: ${p.flexibleEntry}`);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

function calendarKindEmoji(kind: CalendarEntryKind): string {
  if (kind === "פגישה") {
    return "🟢";
  }
  if (kind === "שיחה") {
    return "🔵";
  }
  return "🟡";
}

function normalizeStreetToken(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function normalizeClientKey(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function calendarEntriesForClient(
  clientName: string,
  calendar: DemoCalendarEntry[]
): DemoCalendarEntry[] {
  const key = normalizeClientKey(clientName);
  if (!key) return [];
  return calendar.filter((e) => normalizeClientKey(e.clientName) === key);
}

function propertiesMatchingAddresses(
  tokens: string[] | undefined,
  allProperties: DemoProperty[]
): DemoProperty[] {
  if (!tokens?.length) {
    return [];
  }
  const norms = tokens.map(normalizeStreetToken).filter(Boolean);
  return allProperties.filter((p) => {
    const addr = normalizeStreetToken(p.address);
    return norms.some((t) => addr.includes(t) || t.includes(addr));
  });
}

function calendarEntriesByIds(
  ids: string[] | undefined,
  calendar: DemoCalendarEntry[]
): DemoCalendarEntry[] {
  if (!ids?.length) {
    return [];
  }
  const wanted = new Set(ids);
  return calendar.filter((e) => wanted.has(e.id));
}

function groupCalendarByDate(entries: DemoCalendarEntry[]): [string, DemoCalendarEntry[]][] {
  const map = new Map<string, DemoCalendarEntry[]>();
  for (const e of entries) {
    const list = map.get(e.date);
    if (list) {
      list.push(e);
    } else {
      map.set(e.date, [e]);
    }
  }
  return Array.from(map.entries());
}

function EmptyHint() {
  return <p className="crm-empty-hint">אין נתונים להצגה</p>;
}

function ClientDetailPanel({
  client,
  properties,
  calendar,
  onClose
}: {
  client: DemoClient;
  properties: DemoProperty[];
  calendar: DemoCalendarEntry[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const timeline = useMemo(
    () => [...(client.interactions ?? [])].reverse(),
    [client.interactions]
  );

  const clientCalendar = useMemo(
    () => calendarEntriesForClient(client.name, calendar),
    [client.name, calendar]
  );

  const clientCalendarByDate = useMemo(
    () => groupCalendarByDate(clientCalendar),
    [clientCalendar]
  );

  return (
    <>
      <button type="button" className="crm-panel-backdrop" aria-label="סגור פאנל" onClick={onClose} />
      <aside className="crm-detail-panel" aria-modal="true" role="dialog" aria-labelledby="crm-detail-title">
        <div className="crm-detail-panel-header">
          <h2 id="crm-detail-title" className="crm-detail-panel-title">
            {client.name}
          </h2>
          <button type="button" className="crm-detail-close" onClick={onClose}>
            סגור
          </button>
        </div>
        <div className="crm-detail-scroll">
          <section className="crm-detail-section">
            <h3 className="crm-detail-heading">פרטי לקוח</h3>
            <dl className="crm-detail-dl">
              <div>
                <dt>סוג</dt>
                <dd>
                  <span className="crm-badge crm-badge-muted">{client.kind}</span>
                </dd>
              </div>
              <div>
                <dt>סטטוס</dt>
                <dd>
                  <span className="crm-badge">{client.status}</span>
                </dd>
              </div>
              <div>
                <dt>מקור ליד</dt>
                <dd>{client.leadSource ?? "—"}</dd>
              </div>
              <div>
                <dt>בשלות ליד</dt>
                <dd>{client.leadTemperature ?? "—"}</dd>
              </div>
              <div className="crm-detail-dl-full">
                <dt>העדפות</dt>
                <dd>{formatPreferences(client.preferences)}</dd>
              </div>
            </dl>
          </section>

          <section className="crm-detail-section">
            <h3 className="crm-detail-heading">יומן</h3>
            {clientCalendar.length === 0 ? (
              <p className="crm-detail-muted">אין אירועים ביומן ללקוח זה.</p>
            ) : (
              <div className="crm-cal-timeline">
                {clientCalendarByDate.map(([date, items]) => (
                  <section key={date} className="crm-cal-day">
                    <h4 className="crm-cal-day-title">{date}</h4>
                    <ul className="crm-cal-items">
                      {items.map((item) => (
                        <li key={item.id} className="crm-cal-item">
                          <span className="crm-cal-emoji" aria-hidden="true">
                            {calendarKindEmoji(item.kind)}
                          </span>
                          <div className="crm-cal-body">
                            <div className="crm-cal-line">
                              <strong>{item.title}</strong>
                              {item.time ? (
                                <span className="crm-cal-time"> ({item.time})</span>
                              ) : null}
                            </div>
                            <div className="crm-cal-meta">
                              <span className="crm-cal-kind">{item.kind}</span>
                              {item.description ? (
                                <span className="crm-cal-desc"> — {item.description}</span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>

          <section className="crm-detail-section">
            <h3 className="crm-detail-heading">אינטרקציות</h3>
            {timeline.length === 0 ? (
              <p className="crm-detail-muted">אין אינטרקציות עדיין.</p>
            ) : (
              <ul className="crm-interaction-list">
                {timeline.map((ix: DemoClientInteraction) => {
                  const linkedProps = propertiesMatchingAddresses(ix.propertyAddresses, properties);
                  const linkedTasks = calendarEntriesByIds(ix.relatedTaskIds, calendar);
                  return (
                    <li key={ix.id} className="crm-interaction-card">
                      <div className="crm-interaction-card-head">
                        {ix.kind ? (
                          <span className="crm-badge crm-badge-muted">{ix.kind}</span>
                        ) : (
                          <span className="crm-badge crm-badge-muted">אינטרקציה</span>
                        )}
                        <span className="crm-interaction-when">{ix.recordedAt}</span>
                      </div>
                      <p className="crm-interaction-summary">{ix.summary}</p>
                      {ix.propertyAddresses && ix.propertyAddresses.length > 0 ? (
                        <div className="crm-interaction-sub">
                          <span className="crm-interaction-sub-label">כתובות באינטרקציה:</span>
                          <ul className="crm-interaction-addresses">
                            {ix.propertyAddresses.map((addr) => (
                              <li key={addr}>{addr}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {linkedProps.length > 0 ? (
                        <div className="crm-interaction-sub">
                          <span className="crm-interaction-sub-label">נכסים תואמים במערכת:</span>
                          <ul className="crm-interaction-properties">
                            {linkedProps.map((p) => (
                              <li key={p.id}>
                                <strong>{p.address}</strong>
                                {p.city ? `, ${p.city}` : ""} · {p.rooms} חדרים · {formatPrice(p.price)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {linkedTasks.length > 0 ? (
                        <div className="crm-interaction-sub">
                          <span className="crm-interaction-sub-label">משימות קשורות:</span>
                          <ul className="crm-interaction-tasks">
                            {linkedTasks.map((t) => (
                              <li key={t.id}>
                                <strong>{t.title}</strong>
                                <span className="crm-interaction-task-meta">
                                  {" "}
                                  · {t.kind} · {t.date}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}

function PropertyCard({ p }: { p: DemoProperty }) {
  const hasGranularNotes = Boolean(p.priceNote || p.generalNotes);
  return (
    <>
      <div className="crm-card-title">
        {p.address}, {p.city}
      </div>
      <div className="crm-card-meta">
        {p.rooms} חדרים · {formatPrice(p.price)}
      </div>
      {p.features && p.features.length > 0 ? (
        <div className="crm-card-features">תכונות: {p.features.join(" · ")}</div>
      ) : null}
      <div className="crm-card-owner">בעל נכס: {p.ownerClientName}</div>
      {p.priceNote ? <div className="crm-card-notes">מחיר: {p.priceNote}</div> : null}
      {p.generalNotes ? <div className="crm-card-notes">הערות: {p.generalNotes}</div> : null}
      {!hasGranularNotes && p.notes ? <div className="crm-card-notes">{p.notes}</div> : null}
    </>
  );
}

const RESET_CONFIRM =
  "למחוק את כל הנתונים בשרת?\nזיכרון הדמו יתאפס (לקוחות, נכסים, יומן וגם מתאם הצ׳אט הפנימי).";

export default function CrmDashboard() {
  const { clients, properties, calendar, pollError, resetDemoData } = useCrmDemo();

  const [activeTab, setActiveTab] = useState<TabId>("clients");
  const [detailClientId, setDetailClientId] = useState<string | null>(null);

  const calendarByDate = useMemo(() => groupCalendarByDate(calendar), [calendar]);

  const detailClient = useMemo(
    () => (detailClientId ? clients.find((c) => c.id === detailClientId) : undefined),
    [clients, detailClientId]
  );

  const closeDetailPanel = useCallback(() => setDetailClientId(null), []);

  return (
    <div className="crm-dashboard" dir="rtl">
      <header className="crm-header">
        <div className="crm-header-title">
          <h1 className="crm-title">הדגמת CRM</h1>
          <p className="crm-subtitle">
            {pollError ? (
              <span className="crm-poll-error"> · לא ניתן להתחבר לשרת — בדקו ש־השרת רץ</span>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="crm-reset-btn"
          onClick={() => {
            void (async () => {
              if (!window.confirm(RESET_CONFIRM)) {
                return;
              }
              try {
                await resetDemoData();
              } catch {
                window.alert("לא ניתן לאפס — וודאו שהשרת רץ והכתובת ב־VITE_API_URL נכונה.");
              }
            })();
          }}
        >
          נקה נתונים
        </button>
      </header>

      <nav className="crm-tabs" role="tablist" aria-label="ניווט ראשי">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={`crm-tab ${activeTab === tab.id ? "crm-tab-active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="crm-main">
        {activeTab === "clients" ? (
          <div className="crm-panel">
            <table className="crm-table">
              <thead>
                <tr>
                  <th scope="col">שם</th>
                  <th scope="col">סוג</th>
                  <th scope="col">סטטוס</th>
                  <th scope="col">מקור ליד</th>
                  <th scope="col">בשלות ליד</th>
                  <th scope="col">העדפות</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyHint />
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr
                      key={c.id}
                      className="crm-table-row-clickable"
                      onClick={() => setDetailClientId(c.id)}
                    >
                      <td>{c.name}</td>
                      <td>
                        <span className="crm-badge crm-badge-muted">{c.kind}</span>
                      </td>
                      <td>
                        <span className="crm-badge">{c.status}</span>
                      </td>
                      <td>{c.leadSource ?? "—"}</td>
                      <td>{c.leadTemperature ?? "—"}</td>
                      <td className="crm-table-prefs">{formatPreferences(c.preferences)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : null}

        {activeTab === "properties" ? (
          <div className="crm-panel">
            <ul className="crm-card-grid">
              {properties.length === 0 ? (
                <li className="crm-card crm-card-empty">
                  <EmptyHint />
                </li>
              ) : (
                properties.map((p) => (
                  <li key={p.id} className="crm-card">
                    <PropertyCard p={p} />
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}

        {activeTab === "calendar" ? (
          <div className="crm-panel">
            <div className="crm-cal-timeline">
              {calendar.length === 0 ? (
                <EmptyHint />
              ) : (
                calendarByDate.map(([date, items]) => (
                  <section key={date} className="crm-cal-day">
                    <h2 className="crm-cal-day-title">{date}</h2>
                    <ul className="crm-cal-items">
                      {items.map((item) => (
                        <li key={item.id} className="crm-cal-item">
                          <span className="crm-cal-emoji" aria-hidden="true">
                            {calendarKindEmoji(item.kind)}
                          </span>
                          <div className="crm-cal-body">
                            <div className="crm-cal-line">
                              <strong>{item.title}</strong>
                              {item.time ? (
                                <span className="crm-cal-time"> ({item.time})</span>
                              ) : null}
                              <span className="crm-cal-client"> · {item.clientName}</span>
                            </div>
                            <div className="crm-cal-meta">
                              <span className="crm-cal-kind">{item.kind}</span>
                              {item.description ? (
                                <span className="crm-cal-desc"> — {item.description}</span>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))
              )}
            </div>
          </div>
        ) : null}
      </main>

      {detailClient ? (
        <ClientDetailPanel
          client={detailClient}
          properties={properties}
          calendar={calendar}
          onClose={closeDetailPanel}
        />
      ) : null}
    </div>
  );
}
