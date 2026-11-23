import type { Metadata } from "next";
import { APP_NAME } from "@askwell/shared";
import { parseParentOrigin } from "../../lib/widget/embed/protocol";
import { ChatPanel } from "./chat-panel";

export const metadata: Metadata = { title: `Chat | ${APP_NAME}`, robots: { index: false } };

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ parentOrigin?: string | string[] }>;
}) {
  const { parentOrigin } = await searchParams;
  return <ChatPanel parentOrigin={parseParentOrigin(
    typeof parentOrigin === "string" ? parentOrigin : undefined,
  )} />;
}
