import { describe, expect, it, vi } from "vitest";
import { getVisitorId } from "./visitor";

describe("getVisitorId", () => {
  it("reuses the generated ID from storage on later calls", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    };

    const id = getVisitorId({ localStorage: storage, crypto });
    expect(id).toMatch(/^[a-f0-9]{32}$/);
    expect(getVisitorId({ localStorage: storage, crypto })).toBe(id);
  });

  it("generates an ID when reading or writing storage throws", () => {
    const restricted = {
      crypto,
      get localStorage(): Storage {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    };
    const full = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => { throw new DOMException("Storage full", "QuotaExceededError"); }),
    };
    expect(getVisitorId(restricted)).toMatch(/^[a-f0-9]{32}$/);
    expect(getVisitorId({ localStorage: full, crypto })).toMatch(/^[a-f0-9]{32}$/);
  });
});
