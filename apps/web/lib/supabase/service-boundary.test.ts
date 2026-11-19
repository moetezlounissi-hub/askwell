import { expect, it } from "vitest";

it("rejects importing the service client outside the server module graph", async () => {
  await expect(import("./service")).rejects.toThrow(/cannot be imported from a Client Component/i);
});
