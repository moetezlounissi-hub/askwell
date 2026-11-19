import { describe, expect, it } from "vitest";
import {
  APP_NAME, DEFAULT_WIDGET_CONFIG, MAX_KNOWLEDGE_FILE_BYTES,
  MAX_MESSAGE_CHARACTERS, PLAN_LIMITS,
} from "./index";

describe("approved product defaults", () => {
  it("preserves the Free and Pro quota contract", () => {
    expect(PLAN_LIMITS).toEqual({
      free: { projects: 1, messagesPerMonth: 100, knowledgeSources: 3 },
      pro: { projects: 5, messagesPerMonth: 2000, knowledgeSources: 25 },
    });
  });
  it("preserves the Free widget defaults and shared app name", () => {
    expect(APP_NAME).toBe("Askwell");
    expect(DEFAULT_WIDGET_CONFIG).toEqual({
      buttonColor: "#000000", position: "bottom-right", label: "Ask us",
      animation: "fade", headerText: APP_NAME, showBadge: true,
    });
  });
  it("uses the approved byte and message limits", () => {
    expect(MAX_KNOWLEDGE_FILE_BYTES).toBe(10 * 1024 * 1024);
    expect(MAX_MESSAGE_CHARACTERS).toBe(1000);
  });
});
