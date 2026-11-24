import { DEFAULT_WIDGET_CONFIG } from "@askwell/shared";
import { beforeEach, expect, it, vi } from "vitest";
import { createServiceClient } from "../../supabase/service";
import { lookupWidgetConfig, resolveWidgetProject } from "./lookup";

const { from, select, eq, maybeSingle } = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../supabase/service", () => ({ createServiceClient: () => ({ from }) }));

const widgetConfig = {
  button_color: "#123456",
  position: "top-left",
  label: "Need help?",
  animation: "slide",
  header_text: "Support",
  show_badge: false,
  project_id: "private-project-id",
};

beforeEach(() => {
  vi.resetAllMocks();
  from.mockReturnValue({ select });
  select.mockReturnValue({ eq });
  eq.mockReturnValue({ maybeSingle });
});

it("uses the shared Free defaults and badge even if custom values were stored", async () => {
  maybeSingle.mockResolvedValue({
    data: { accounts: { plan: "free" }, widget_configs: widgetConfig },
    error: null,
  });

  expect(await lookupWidgetConfig("pk_free")).toEqual(DEFAULT_WIDGET_CONFIG);
  expect(from).toHaveBeenCalledExactlyOnceWith("projects");
  expect(eq).toHaveBeenCalledExactlyOnceWith("public_key", "pk_free");
});

it("returns only the six public Pro fields", async () => {
  maybeSingle.mockResolvedValue({
    data: { id: "private-project-id", accounts: { plan: "pro" }, widget_configs: widgetConfig },
    error: null,
  });

  expect(await lookupWidgetConfig("pk_pro")).toEqual({
    buttonColor: "#123456",
    position: "top-left",
    label: "Need help?",
    animation: "slide",
    headerText: "Support",
    showBadge: false,
  });
});

it("resolves the internal project ID and current plan by public key", async () => {
  maybeSingle.mockResolvedValue({
    data: { id: "private-project-id", accounts: { plan: "pro" }, widget_configs: widgetConfig },
    error: null,
  });
  await expect(resolveWidgetProject(createServiceClient(), "pk_pro")).resolves.toMatchObject({
    id: "private-project-id",
    plan: "pro",
  });
  expect(eq).toHaveBeenCalledExactlyOnceWith("public_key", "pk_pro");
});

it("returns null for an unknown project and throws on a database error", async () => {
  maybeSingle
    .mockResolvedValueOnce({ data: null, error: null })
    .mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });

  await expect(lookupWidgetConfig("pk_missing")).resolves.toBeNull();
  await expect(lookupWidgetConfig("pk_example")).rejects.toThrow("Could not load widget config.");
});
