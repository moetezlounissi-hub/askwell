import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { GET, OPTIONS } from "./route";

const { lookupWidgetConfig } = vi.hoisted(() => ({ lookupWidgetConfig: vi.fn() }));
vi.mock("../../../../lib/widget/config/lookup", () => ({ lookupWidgetConfig }));

const url = "https://app.example.com/api/widget/config";
const headers = { Origin: "https://customer.example.org" };

beforeEach(() => {
  vi.resetAllMocks();
  lookupWidgetConfig.mockResolvedValue(DEFAULT_WIDGET_CONFIG);
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
