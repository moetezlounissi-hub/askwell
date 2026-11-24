import "server-only";

import arcjet, { fixedWindow } from "@arcjet/next";

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
