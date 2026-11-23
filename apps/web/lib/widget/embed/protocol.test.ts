import { describe, expect, it } from "vitest";
import { isParentInit, parseParentOrigin } from "./protocol";

describe("parseParentOrigin", () => {
  it.each(["https://example.com", "http://localhost:8080"])("accepts the exact origin %s", (origin) => {
    expect(parseParentOrigin(origin)).toBe(origin);
  });

  it.each([undefined, "*", "null", "https://example.com/", "https://example.com?a=b", "file:///tmp/widget.html"])(
    "rejects an invalid or opaque origin %s",
    (origin) => expect(parseParentOrigin(origin)).toBeNull(),
  );
});

describe("isParentInit", () => {
  const parent = {} as Window;
  const origin = "https://example.com";
  const event = { source: parent, origin, data: { type: "askwell:init" } };

  it("accepts initialization from the bound parent and origin", () => {
    expect(isParentInit(event, parent, origin)).toBe(true);
  });

  it("rejects siblings, a parent at a different origin, and unsupported messages", () => {
    expect(isParentInit({ ...event, source: {} as Window }, parent, origin)).toBe(false);
    expect(isParentInit({ ...event, origin: "https://other.example.com" }, parent, origin)).toBe(false);
    expect(isParentInit({ ...event, data: null }, parent, origin)).toBe(false);
    expect(isParentInit({ ...event, data: { type: "askwell:close" } }, parent, origin)).toBe(false);
  });
});
