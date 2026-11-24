import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "./route";

const { lookupWidgetConfig } = vi.hoisted(() => ({ lookupWidgetConfig: vi.fn() }));
const { protectWidgetConfig } = vi.hoisted(() => ({ protectWidgetConfig: vi.fn() }));
vi.mock("../../../../lib/widget/config/lookup", () => ({ lookupWidgetConfig }));
vi.mock("../../../../lib/arcjet", () => ({ protectWidgetConfig }));

const url = "https://app.example.com/api/widget/config";
const headers = { Origin: "https://customer.example.org" };

beforeEach(() => {
  vi.resetAllMocks();
  lookupWidgetConfig.mockResolvedValue(DEFAULT_WIDGET_CONFIG);
  protectWidgetConfig.mockResolvedValue({
    isErrored: () => false,
    isDenied: () => false,
  });
});

it("serves the public config to another origin without credentials", async () => {
  const response = await GET(new Request(`${url}?key=pk_example`, { headers }));

  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.has("Access-Control-Allow-Credentials")).toBe(false);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect(await response.json()).toEqual(DEFAULT_WIDGET_CONFIG);
  expect(lookupWidgetConfig).toHaveBeenCalledExactlyOnceWith("pk_example");
});

it.each(["", "?key=invalid", "?key=pk_one&key=pk_two", "?key=pk_one&owner=other"])(
  "rejects invalid query %s before accessing the database",
  async (query) => {
    const response = await GET(new Request(url + query, { headers }));

    expect(response.status).toBe(400);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toMatchObject({ error: { code: "validation_error" } });
    expect(lookupWidgetConfig).not.toHaveBeenCalled();
  },
);

it("returns a cross-origin 404 for an unknown key", async () => {
  lookupWidgetConfig.mockResolvedValue(null);
  const response = await GET(new Request(`${url}?key=pk_missing`, { headers }));

  expect(response.status).toBe(404);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(await response.json()).toMatchObject({ error: { code: "not_found" } });
});

it("refuses a rate-limited cross-origin request before accessing the database", async () => {
  protectWidgetConfig.mockResolvedValue({
    isErrored: () => false,
    isDenied: () => true,
    reason: { isRateLimit: () => true },
  });
  const request = new Request(`${url}?key=pk_example`, { headers });
  const response = await GET(request);

  expect(protectWidgetConfig).toHaveBeenCalledExactlyOnceWith(request, "pk_example");
  expect(response.status).toBe(429);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(await response.json()).toMatchObject({ error: { code: "rate_limited" } });
  expect(lookupWidgetConfig).not.toHaveBeenCalled();
});

it.each(["error decision", "rejected request"])("logs an Arcjet %s and serves the config", async (failure) => {
  if (failure === "error decision") {
    protectWidgetConfig.mockResolvedValue({ isErrored: () => true });
  } else {
    protectWidgetConfig.mockRejectedValue(new Error("Arcjet timed out"));
  }
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const response = await GET(new Request(`${url}?key=pk_example`, { headers }));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await response.json()).toEqual(DEFAULT_WIDGET_CONFIG);
    expect(warn).toHaveBeenCalledExactlyOnceWith("Arcjet could not check the widget config rate limit.");
  } finally {
    warn.mockRestore();
  }
});

it("returns a generic cross-origin error on a database failure", async () => {
  lookupWidgetConfig.mockRejectedValue(new Error("private database details"));
  const response = await GET(new Request(`${url}?key=pk_example`, { headers }));

  expect(response.status).toBe(500);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(await response.json()).toEqual({
    error: { code: "internal_error", message: "Could not load the widget." },
  });
});

it("allows a GET preflight from any origin", () => {
  const response = OPTIONS();

  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET");
});
