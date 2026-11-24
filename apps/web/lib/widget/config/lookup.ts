import "server-only";

import {
  DEFAULT_WIDGET_CONFIG,
  UpdateWidgetConfigBodySchema,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { createServiceClient } from "../../supabase/service";

export async function resolveWidgetProject(db: ReturnType<typeof createServiceClient>, publicKey: string) {
  const { data, error } = await db
    .from("projects")
    .select("id, accounts(plan), widget_configs(button_color, position, label, animation, header_text, show_badge)")
    .eq("public_key", publicKey)
    .maybeSingle();

  if (error) throw new Error("Could not load widget config.", { cause: error });
  if (!data) return null;

  const plan = data.accounts?.plan;
  if (plan !== "free" && plan !== "pro") throw new Error("Widget configuration is incomplete.");
  return { id: data.id, plan, config: data.widget_configs } as const;
}

export async function lookupWidgetConfig(publicKey: string): Promise<WidgetConfigResponse | null> {
  const project = await resolveWidgetProject(createServiceClient(), publicKey);
  if (!project) return null;
  if (project.plan === "free") return DEFAULT_WIDGET_CONFIG;

  const { config } = project;
  if (!config) throw new Error("Widget configuration is incomplete.");

  return UpdateWidgetConfigBodySchema.parse({
    buttonColor: config.button_color,
    position: config.position,
    label: config.label,
    animation: config.animation,
    headerText: config.header_text,
    showBadge: config.show_badge,
  });
}
