import "server-only";

import {
  DEFAULT_WIDGET_CONFIG,
  UpdateWidgetConfigBodySchema,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { createServiceClient } from "../../supabase/service";

export async function lookupWidgetConfig(publicKey: string): Promise<WidgetConfigResponse | null> {
  const { data, error } = await createServiceClient()
    .from("projects")
    .select("accounts(plan), widget_configs(button_color, position, label, animation, header_text, show_badge)")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) throw new Error("Could not load widget config.", { cause: error });
  if (!data) return null;

  const plan = data.accounts?.plan;
  if (plan === "free") return DEFAULT_WIDGET_CONFIG;

  const config = data.widget_configs;
  if (plan !== "pro" || !config) throw new Error("Widget configuration is incomplete.");

  return UpdateWidgetConfigBodySchema.parse({
    buttonColor: config.button_color,
    position: config.position,
    label: config.label,
    animation: config.animation,
    headerText: config.header_text,
    showBadge: config.show_badge,
  });
}
