import { describe, expect, it } from "vitest";
import { buildPipelineInput } from "./buildPipelineInput";

describe("buildPipelineInput", () => {
  it("returns bare message when history empty", () => {
    expect(buildPipelineInput("שלום", [])).toBe("שלום");
  });

  it("prefixes prior transcript", () => {
    expect(
      buildPipelineInput("חדש", [
        { role: "user", text: "א" },
        { role: "bot", text: "ב" }
      ])
    ).toBe("הקשר שיחה קודם:\nuser: א\nbot: ב\n\nהודעה חדשה:\nחדש");
  });
});
