import "server-only";

import arcjet, { detectPromptInjection, fixedWindow, shield } from "@arcjet/next";

const widgetConfigProtection = arcjet({
  key: process.env.ARCJET_KEY ?? "",
  characteristics: ["ip.src", "route", "publicKey"],
  rules: [fixedWindow({ mode: "LIVE", window: "1m", max: 60 })],
});

export function protectWidgetConfig(request: Request, publicKey: string) {
  return widgetConfigProtection.protect(request, {
    route: "/api/widget/config",
    publicKey,
  });
}

const widgetChatProtection = arcjet({
  key: process.env.ARCJET_KEY ?? "",
  characteristics: ["ip.src", "route", "publicKey"],
  rules: [
    shield({ mode: "LIVE" }),
    fixedWindow({ mode: "LIVE", window: "1m", max: 20 }),
    detectPromptInjection({ mode: "LIVE" }),
  ],
});

export function protectWidgetChat(request: Request, publicKey: string, message: string) {
  return widgetChatProtection.protect(request, {
    route: "/api/widget/chat",
    publicKey,
    detectPromptInjectionMessage: message,
  });
}
