const VISITOR_KEY = "askwell:visitor:v1";

export function getVisitorId(browser: {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  crypto: Crypto;
}): string {
  const createId = () => [...browser.crypto.getRandomValues(new Uint8Array(16))]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  try {
    const storage = browser.localStorage;
    const saved = storage.getItem(VISITOR_KEY);
    if (saved && /^[a-f0-9]{32}$/.test(saved)) return saved;

    const id = createId();
    try {
      storage.setItem(VISITOR_KEY, id);
    } catch {
      // Use this ID for the current panel when storage is full or blocked.
    }
    return id;
  } catch {
    return createId();
  }
}
