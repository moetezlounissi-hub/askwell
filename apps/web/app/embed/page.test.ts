import { describe, expect, it } from "vitest";
import EmbedPage from "./page";

describe("/embed", () => {
  it.each([
    ["https://host.example", "https://host.example"],
    [["https://host.example", "https://other.example"], null],
    ["*", null],
  ])("passes only a single exact parent origin to the chat panel", async (input, expected) => {
    const panel = await EmbedPage({ searchParams: Promise.resolve({ parentOrigin: input }) });
    expect(panel.props.parentOrigin).toBe(expected);
  });
});

it.each([
  ["pk_support", "pk_support"],
  [["pk_support", "pk_other"], null],
  ["invalid", null],
  [undefined, null],
])("passes only a valid public key to the panel", async (key, expected) => {
  const panel = await EmbedPage({ searchParams: Promise.resolve({ key }) });
  expect(panel.props.publicKey).toBe(expected);
});
