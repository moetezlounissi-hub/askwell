export const APP_NAME = "Askwell";

export const MAX_KNOWLEDGE_FILE_BYTES = 10485760;
export const MAX_MESSAGE_CHARACTERS = 1000;
export type Position = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type Animation = "fade" | "slide" | "scale";

export interface WidgetConfig {
  buttonColor: string;
  position: Position;
  label: string;
  animation: Animation;
  headerText: string;
  showBadge: boolean;
}

/** Server applies these defaults for Free; customization requires Pro. */
export const DEFAULT_WIDGET_CONFIG: Readonly<WidgetConfig> = {
  buttonColor: "#000000",
  position: "bottom-right",
  label: "Ask us",
  animation: "fade",
  headerText: APP_NAME,
  showBadge: true,
};
