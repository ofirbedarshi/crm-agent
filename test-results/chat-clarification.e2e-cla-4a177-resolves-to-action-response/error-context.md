# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: chat-clarification.e2e.spec.ts >> clarification flow resolves to action response
- Location: tests/e2e/chat-clarification.e2e.spec.ts:7:1

# Error details

```
Error: expect(received).not.toEqual(expected) // deep equality

Expected: not "קרה משהו, ננסה שוב?"

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - region "System trace" [ref=e4]:
    - complementary [ref=e6]:
      - generic [ref=e7]: מסלול עיבוד ההודעה
      - paragraph [ref=e9]: עדיין אין מסלול להצגה. שלחו הודעה כדי לראות את השלבים והקריאות ל-CRM.
  - separator "שינוי רוחב בין מעקב מערכת לצ׳אט" [ref=e10]
  - region "צ׳אט CRM" [ref=e11]:
    - main [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]: CRM Chat
        - generic [ref=e15]:
          - generic [ref=e17]: תזכיר לי להתקשר מחר
          - generic [ref=e19]: קרה משהו, ננסה שוב?
          - generic [ref=e21]: תזכיר לי להתקשר לדני מחר בבוקר
          - generic [ref=e23]: קרה משהו, ננסה שוב?
        - generic [ref=e24]:
          - button "הקלט הודעה קולית" [ref=e25] [cursor=pointer]: 🎙
          - textbox "כתבו הודעה..." [ref=e26]
          - button "שליחה" [disabled] [ref=e27]
  - separator "שינוי רוחב בין צ׳אט להדגמת CRM" [ref=e28]
  - region "הדגמת CRM" [ref=e29]:
    - generic [ref=e30]:
      - generic [ref=e31]:
        - generic [ref=e32]:
          - heading "הדגמת CRM" [level=1] [ref=e33]
          - paragraph [ref=e34]: נתונים בזיכרון השרת — מתעדכנים מהצ׳אט כשמבוצעות פעולות, ונדגם כאן כל כמה שניות · לא ניתן להתחבר לשרת — בדקו ש־השרת רץ
        - button "נקה נתונים" [ref=e35] [cursor=pointer]
      - tablist "ניווט ראשי" [ref=e36]:
        - tab "לקוחות" [selected] [ref=e37] [cursor=pointer]
        - tab "נכסים" [ref=e38] [cursor=pointer]
        - tab "יומן" [ref=e39] [cursor=pointer]
      - main [ref=e40]:
        - table [ref=e42]:
          - rowgroup [ref=e43]:
            - row "שם טלפון סוג סטטוס מקור ליד בשלות ליד העדפות הערות" [ref=e44]:
              - columnheader "שם" [ref=e45]
              - columnheader "טלפון" [ref=e46]
              - columnheader "סוג" [ref=e47]
              - columnheader "סטטוס" [ref=e48]
              - columnheader "מקור ליד" [ref=e49]
              - columnheader "בשלות ליד" [ref=e50]
              - columnheader "העדפות" [ref=e51]
              - columnheader "הערות" [ref=e52]
          - rowgroup [ref=e53]:
            - row "אין נתונים להצגה" [ref=e54]:
              - cell "אין נתונים להצגה" [ref=e55]:
                - paragraph [ref=e56]: אין נתונים להצגה
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | 
  3  | function extractBotMessages(allMessages: string[]): string[] {
  4  |   return allMessages.filter((message) => message !== "חושב...");
  5  | }
  6  | 
  7  | test("clarification flow resolves to action response", async ({ page }) => {
  8  |   await page.goto("/");
  9  | 
  10 |   const input = page.getByPlaceholder("כתבו הודעה...");
  11 |   const sendButton = page.getByRole("button", { name: "שליחה" });
  12 |   const allBubbles = page.locator(".message-bubble");
  13 |   const botBubbles = page.locator(".message-bubble.message-bot");
  14 | 
  15 |   await input.fill("תזכיר לי להתקשר מחר");
  16 |   await sendButton.click();
  17 | 
  18 |   await expect(allBubbles.filter({ hasText: "חושב..." })).toHaveCount(0, { timeout: 30_000 });
  19 | 
  20 |   const firstBotReply = (await botBubbles.last().innerText()).trim();
  21 |   expect(firstBotReply.length).toBeGreaterThan(0);
  22 |   expect(firstBotReply).toMatch(/\?/);
  23 | 
  24 |   await input.fill("תזכיר לי להתקשר לדני מחר בבוקר");
  25 |   await sendButton.click();
  26 | 
  27 |   await expect(allBubbles.filter({ hasText: "חושב..." })).toHaveCount(0, { timeout: 30_000 });
  28 | 
  29 |   const botMessages = extractBotMessages(await botBubbles.allTextContents());
  30 |   expect(botMessages.length).toBeGreaterThanOrEqual(2);
  31 | 
  32 |   const finalReply = botMessages[botMessages.length - 1]!.trim();
> 33 |   expect(finalReply).not.toEqual(firstBotReply);
     |                          ^ Error: expect(received).not.toEqual(expected) // deep equality
  34 |   expect(finalReply).toMatch(/יצרתי|עדכנתי|ביצעתי|הבנתי/);
  35 | });
  36 | 
```