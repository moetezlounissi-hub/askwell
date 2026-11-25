import type { Metadata } from "next";
import { APP_NAME, PublicKeySchema } from "@askwell/shared";
import { parseParentOrigin } from "../../lib/widget/embed/protocol";
import { ChatPanel } from "./chat-panel";

export const metadata: Metadata = { title: `Chat | ${APP_NAME}`, robots: { index: false } };

export default async function EmbedPage({
  searchParams,
}: {
  searchParams: Promise<{ parentOrigin?: string | string[]; key?: string | string[] }>;
}) {
  const { parentOrigin, key } = await searchParams;
  const publicKey = PublicKeySchema.safeParse(key);
  return <ChatPanel key={publicKey.data} publicKey={publicKey.data ?? null} parentOrigin={parseParentOrigin(
    typeof parentOrigin === "string" ? parentOrigin : undefined,
  )} />;
}
