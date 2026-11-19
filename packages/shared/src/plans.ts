export type Plan = "free" | "pro";

export const PLAN_LIMITS = {
  free: { projects: 1, messagesPerMonth: 100, knowledgeSources: 3 },
  pro: { projects: 5, messagesPerMonth: 2000, knowledgeSources: 25 },
} as const satisfies Record<Plan, {
  projects: number;
  messagesPerMonth: number;
  knowledgeSources: number;
}>;
