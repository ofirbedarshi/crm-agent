import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runCrmAgent } from "../pipeline/runCrmAgent";
import type { SupportedAction } from "../types/parser";

function summarizeAction(action: SupportedAction): string {
  if (action.type === "create_or_update_client") {
    const lines: string[] = [`* create_or_update_client (${action.data.name})`, `  👤 לקוח: ${action.data.name}`];
    const preferences: string[] = [];
    if (action.data.preferences?.property_type) {
      preferences.push(action.data.preferences.property_type);
    }
    if (action.data.preferences?.city) {
      preferences.push(action.data.preferences.city);
    }
    if (action.data.preferences?.budget !== undefined) {
      preferences.push(`תקציב: ${action.data.preferences.budget.toLocaleString("he-IL")}`);
    }
    if (action.data.preferences?.entry_date) {
      preferences.push(`כניסה: ${action.data.preferences.entry_date}`);
    }

    if (preferences.length > 0) {
      lines.push("  🔍 חיפוש:");
      for (const item of preferences) {
        lines.push(`  * ${item}`);
      }
    }

    return lines.join("\n");
  }
  return `* create_task (${action.data.title})`;
}

async function main(): Promise<void> {
  const rl = readline.createInterface({ input, output });

  console.log("CRM Agent Demo CLI");
  console.log("Type a message in Hebrew and press Enter.");
  console.log('Type "exit" to quit.\n');

  try {
    while (true) {
      let userInputRaw: string;
      try {
        userInputRaw = await rl.question("> ");
      } catch (error) {
        if (
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "ERR_USE_AFTER_CLOSE"
        ) {
          break;
        }
        throw error;
      }

      const userInput = userInputRaw.trim();

      if (userInput.toLowerCase() === "exit") {
        console.log("Goodbye.");
        break;
      }

      if (!userInput) {
        console.log("Please enter a message.\n");
        continue;
      }

      try {
        const result = await runCrmAgent(userInput);
        console.log("\n🤖 Response:");
        console.log(result.response);
        console.log("\n📊 Actions:");
        if (result.validActions.length === 0) {
          console.log("* none");
        } else {
          for (const action of result.validActions) {
            console.log(summarizeAction(action));
          }
        }
        console.log("");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log("\n⚠️ Error:");
        console.log(message);
        console.log("");
      }
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
