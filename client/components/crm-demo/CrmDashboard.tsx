import { useMemo, useState } from "react";
import { useCrmDemo } from "./CrmDemoContext";
import type { CalendarEntryKind, ClientPreferences, DemoCalendarEntry } from "./types";

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

const RESET_CONFIRM =
  "למחוק את כל הנתונים בשרת?\nזיכרון הדמו יתאפס (לקוחות, נכסים, יומן וגם מתאם הצ׳אט הפנימי).";

export default function CrmDashboard() {
  const { clients, properties, calendar, pollError, resetDemoData } = useCrmDemo();

  const [activeTab, setActiveTab] = useState<TabId>("clients");

  const calendarByDate = useMemo(() => groupCalendarByDate(calendar), [calendar]);

  return (
    <div className="crm-dashboard" dir="rtl">
      <header className="crm-header">
        <div className="crm-header-title">
          <h1 className="crm-title">הדגמת CRM</h1>
          <p className="crm-subtitle">
            נתונים בזיכרון השרת — מתעדכנים מהצ׳אט כשמבוצעות פעולות, ונדגם כאן כל כמה שניות
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
                  <th scope="col">טלפון</th>
                  <th scope="col">סוג</th>
                  <th scope="col">סטטוס</th>
                  <th scope="col">מקור ליד</th>
                  <th scope="col">בשלות ליד</th>
                  <th scope="col">העדפות</th>
                  <th scope="col">הערות</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <EmptyHint />
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr key={c.id}>
                      <td>{c.name}</td>
                      <td>{c.phone ?? "—"}</td>
                      <td>
                        <span className="crm-badge crm-badge-muted">{c.kind}</span>
                      </td>
                      <td>
                        <span className="crm-badge">{c.status}</span>
                      </td>
                      <td>{c.leadSource ?? "—"}</td>
                      <td>{c.leadTemperature ?? "—"}</td>
                      <td className="crm-table-prefs">{formatPreferences(c.preferences)}</td>
                      <td>{c.notes ?? "—"}</td>
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
                    <div className="crm-card-title">
                      {p.address}, {p.city}
                    </div>
                    <div className="crm-card-meta">
                      {p.rooms} חדרים · {formatPrice(p.price)}
                    </div>
                    <div className="crm-card-owner">בעל נכס: {p.ownerClientName}</div>
                    {p.notes ? <div className="crm-card-notes">{p.notes}</div> : null}
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
    </div>
  );
}
