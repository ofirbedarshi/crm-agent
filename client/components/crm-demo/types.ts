/** סוג לקוח */
export type ClientKind = "קונה" | "מוכר" | "שניהם";

/** סטטוס לקוח */
export type ClientStatus = "חדש" | "חם" | "קר" | "בטיפול";

/** העדפות חיפוש / תיאור צורך */
export interface ClientPreferences {
  city?: string;
  areas?: string[];
  rooms?: number;
  budget?: number;
  /** תכונות חופשיות (מרפסת, חניה, קומה גבוהה…) */
  features?: string[];
  flexibleEntry?: string;
}

export interface DemoClient {
  id: string;
  name: string;
  phone?: string;
  kind: ClientKind;
  status: ClientStatus;
  leadSource?: string;
  leadTemperature?: "חם" | "חמים" | "קר" | "לא ידוע";
  preferences: ClientPreferences;
  notes?: string;
}

export interface DemoProperty {
  id: string;
  /** כתובת מלאה או רחוב ומספר */
  address: string;
  city: string;
  rooms: number;
  price: number;
  /** שם לקוח בעל הנכס — ריק אם עדיין לא משויך */
  ownerClientName: string;
  notes?: string;
  priceNote?: string;
  generalNotes?: string;
  features?: string[];
}

/** פריט יומן מאוחד — פגישות, שיחות ומשימות */
export type CalendarEntryKind = "פגישה" | "שיחה" | "משימה";

export interface DemoCalendarEntry {
  id: string;
  title: string;
  clientName: string;
  date: string;
  time?: string;
  kind: CalendarEntryKind;
  description?: string;
}

export interface CrmDemoState {
  clients: DemoClient[];
  properties: DemoProperty[];
  calendar: DemoCalendarEntry[];
}
