import { beforeEach, expect, it, vi } from "vitest";
import { OPTIONS, POST } from "./route";

const { protect, resolveProject, runTurn } = vi.hoisted(() => ({
  protect: vi.fn(),
  resolveProject: vi.fn(),
  runTurn: vi.fn(),
}));

vi.mock("../../../../lib/arcjet", () => ({ protectWidgetChat: protect }));
vi.mock("../../../../lib/supabase/service", () => ({ createServiceClient: () => ({}) }));
vi.mock("../../../../lib/widget/config/lookup", () => ({ resolveWidgetProject: resolveProject }));
vi.mock("../../../../lib/widget/chat/turn", () => ({ runChatTurn: runTurn }));

const payload = { key: "pk_test", visitorId: "visitor-demo", message: "What are your hours?" };

function request(body = JSON.stringify(payload)) {
  return new Request("https://widget.example/api/widget/chat", {
    method: "POST",
    headers: { Origin: "https://host.example", "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  protect.mockResolvedValue({
    isDenied: () => false, isAllowed: () => true, isErrored: () => false, results: [],
  });
  resolveProject.mockResolvedValue({ id: "project-id", plan: "free" });
  runTurn.mockResolvedValue({
    status: "ok",
    response: { conversationId: "thread-id", reply: "We open at 9 AM." },
  });
});

it("allows cross-origin JSON POST preflight", () => {
  const response = OPTIONS();
  expect(response.status).toBe(204);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  expect(response.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type");
});

it.each([
  "{",
  JSON.stringify({ ...payload, message: "x".repeat(1_001) }),
  JSON.stringify({ ...payload, conversationId: "invalid" }),
])("rejects invalid input before protection or quota", async (body) => {
  const response = await POST(request(body));
  expect(response.status).toBe(400);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  expect(protect).not.toHaveBeenCalled();
  expect(runTurn).not.toHaveBeenCalled();
});

it.each([
  [true, 429, "rate_limited"],
  [false, 403, "message_blocked"],
])("returns the Arcjet refusal without resolving the project", async (limited, status, code) => {
  protect.mockResolvedValue({
    isDenied: () => true,
    reason: { isRateLimit: () => limited },
  });

  const response = await POST(request());
  expect(response.status).toBe(status);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  await expect(response.json()).resolves.toMatchObject({ error: { code } });
  expect(resolveProject).not.toHaveBeenCalled();
  expect(runTurn).not.toHaveBeenCalled();
});

it.each([
  { isErrored: () => true, results: [] },
  { isErrored: () => false, results: [{ conclusion: "ERROR" }] },
])("stops the request if protection cannot verify it", async (decision) => {
  protect.mockResolvedValue({ isDenied: () => false, isAllowed: () => true, ...decision });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(runTurn).not.toHaveBeenCalled();
});

it("refuses an unknown public key before starting a turn", async () => {
  resolveProject.mockResolvedValue(null);
  const response = await POST(request());
  expect(response.status).toBe(404);
  expect(runTurn).not.toHaveBeenCalled();
});

it.each([
  ["not_found", 404],
  ["limit_exceeded", 429],
])("maps a %s turn to HTTP %s", async (status, httpStatus) => {
  runTurn.mockResolvedValue({ status });
  const response = await POST(request());
  expect(response.status).toBe(httpStatus);
  await expect(response.json()).resolves.toMatchObject({ error: { code: status } });
});

it("returns the saved chat turn with CORS", async () => {
  const chatRequest = request();
  const response = await POST(chatRequest);
  expect(protect).toHaveBeenCalledExactlyOnceWith(chatRequest, payload.key, payload.message);
  expect(resolveProject).toHaveBeenCalledExactlyOnceWith({}, payload.key);
  expect(runTurn).toHaveBeenCalledExactlyOnceWith({}, "project-id", "free", payload);
  expect(response.status).toBe(200);
  expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  await expect(response.json()).resolves.toEqual({ conversationId: "thread-id", reply: "We open at 9 AM." });
});
