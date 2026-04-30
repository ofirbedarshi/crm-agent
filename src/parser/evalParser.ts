import "dotenv/config";
import { parseMessage } from "./parseMessage";

const demoInputs: string[] = [
  // 1) New buyer lead
  "דיברתי עם דניאל לוי, מחפש דירת 4 חדרים בגבעתיים, תקציב עד 3.2 מיליון.",
  "לקוחה חדשה בשם יעל כהן, מחפשת דירת 3 חדרים ברמת גן ורוצה כניסה מיידית.",

  // 2) Property owner
  "שוחחתי עם מיכל אברהם, היא בעלת דירה ברחוב ביאליק ברמת גן ורוצה למכור.",
  "בעל נכס בשם רועי נבון רוצה שנשווק לו פנטהאוז בצפון תל אביב.",

  // 3) Visit summary
  "היינו היום בסיור בדירה בגבעתיים עם משפחת פרץ, הם אהבו את המטבח אבל ביקשו לבדוק חניה.",
  "סיכום ביקור: הלקוח דניאל לוי רוצה לחשוב יומיים לפני שמתקדמים להצעה.",

  // 4) Multiple actions in one message
  "דיברתי עם נטע לוי, תפתחי לה לקוח חדש ותוסיפי משימה להתקשר אליה מחר בבוקר.",
  "אלי כהן מחפש בית פרטי בפתח תקווה וגם תיצור לי משימת פולואפ לעדכן אותו על נכסים חדשים ביום ראשון.",

  // 5) Ambiguous client
  "תעדכן את יוסי שהוא צריך להגיע לחתימה ביום שני.",
  "דיברתי עם כהן לגבי הדירה, תוסיף משימת המשך דחופה."
];

function printDivider(): void {
  console.log("\n" + "-".repeat(80));
}

async function runEval(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Missing OPENAI_API_KEY. Please export it before running eval:parser.");
    process.exit(1);
  }

  console.log("Parser evaluation started");
  console.log(`Total demo inputs: ${demoInputs.length}`);

  for (let i = 0; i < demoInputs.length; i += 1) {
    const input = demoInputs[i]!;
    printDivider();
    console.log(`Case ${i + 1}/${demoInputs.length}`);
    console.log(`Input: ${input}`);

    try {
      const parsed = await parseMessage(input);
      const hasActions = parsed.actions.length > 0;

      console.log("Parsed JSON:");
      console.log(JSON.stringify(parsed, null, 2));
      console.log(`Has actions: ${hasActions ? "YES" : "NO"}`);

      if (parsed.clarification_questions.length > 0) {
        console.log("Clarification questions:");
        for (const question of parsed.clarification_questions) {
          console.log(`- ${question}`);
        }
      } else {
        console.log("Clarification questions: none");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Parser error: ${message}`);
    }
  }

  printDivider();
  console.log("Parser evaluation finished");
}

runEval().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error("Fatal eval error:", message);
  process.exit(1);
});
