import type { ApiError, ApiErrorCode } from "@askwell/shared";
import { NextResponse } from "next/server";

export function projectError(status: number, code: ApiErrorCode, message: string) {
  return NextResponse.json<ApiError>({ error: { code, message } }, { status });
}
