import {
  WidgetConfigRequestSchema,
  type ApiError,
  type ApiErrorCode,
  type WidgetConfigResponse,
} from "@askwell/shared";
import { NextResponse } from "next/server";
import { protectWidgetConfig } from "../../../../lib/arcjet";
import { lookupWidgetConfig } from "../../../../lib/widget/config/lookup";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET",
  "Cache-Control": "no-store",
};

function configError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status, headers });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = WidgetConfigRequestSchema.safeParse({
    params: undefined,
    query: Object.fromEntries(searchParams),
    body: request.body === null ? undefined : null,
  });
  if (!input.success || searchParams.getAll("key").length !== 1) {
    return configError(400, "validation_error", "Provide a valid widget key.");
  }

  const { key } = input.data.query;
  try {
    const decision = await protectWidgetConfig(request, key);
    if (decision.isErrored()) {
      console.warn("Arcjet could not check the widget config rate limit.");
    } else if (decision.isDenied() && decision.reason.isRateLimit()) {
      return configError(429, "rate_limited", "Too many requests. Try again later.");
    }
  } catch {
    console.warn("Arcjet could not check the widget config rate limit.");
  }

  try {
    const config = await lookupWidgetConfig(key);
    if (!config) return configError(404, "not_found", "Widget not found.");
    return NextResponse.json<WidgetConfigResponse>(config, { headers });
  } catch {
    return configError(500, "internal_error", "Could not load the widget.");
  }
}
