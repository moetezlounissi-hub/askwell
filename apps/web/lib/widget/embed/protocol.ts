export type PanelMessage =
  | { type: "askwell:ready" }
  | { type: "askwell:close" }
  | { type: "askwell:resize"; height: number }
  | { type: "askwell:unread"; count: 1 };

export function parseParentOrigin(value: string | undefined): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === value
      ? url.origin
      : null;
  } catch {
    return null;
  }
}

export function isParentInit(
  event: Pick<MessageEvent<unknown>, "source" | "origin" | "data">,
  parent: Window,
  origin: string,
): boolean {
  const { data } = event;
  return event.source === parent &&
    event.origin === origin &&
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    data.type === "askwell:init";
}
