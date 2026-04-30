import { expect, test } from "@playwright/test";

function extractBotMessages(allMessages: string[]): string[] {
  return allMessages.filter((message) => message !== "חושב...");
}

test("clarification flow resolves to action response", async ({ page }) => {
  await page.goto("/");

  const input = page.getByPlaceholder("כתבו הודעה...");
  const sendButton = page.getByRole("button", { name: "שליחה" });
  const allBubbles = page.locator(".message-bubble");
  const botBubbles = page.locator(".message-bubble.message-bot");

  await input.fill("תזכיר לי להתקשר מחר");
  await sendButton.click();

  await expect(allBubbles.filter({ hasText: "חושב..." })).toHaveCount(0, { timeout: 30_000 });

  const firstBotReply = (await botBubbles.last().innerText()).trim();
  expect(firstBotReply.length).toBeGreaterThan(0);
  expect(firstBotReply).toMatch(/\?/);

  await input.fill("תזכיר לי להתקשר לדני מחר בבוקר");
  await sendButton.click();

  await expect(allBubbles.filter({ hasText: "חושב..." })).toHaveCount(0, { timeout: 30_000 });

  const botMessages = extractBotMessages(await botBubbles.allTextContents());
  expect(botMessages.length).toBeGreaterThanOrEqual(2);

  const finalReply = botMessages[botMessages.length - 1]!.trim();
  expect(finalReply).not.toEqual(firstBotReply);
  expect(finalReply).toMatch(/יצרתי|עדכנתי|ביצעתי|הבנתי/);
});
