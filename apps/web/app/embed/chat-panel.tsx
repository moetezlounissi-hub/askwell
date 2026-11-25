"use client";

import { APP_NAME, DEFAULT_WIDGET_CONFIG, MAX_MESSAGE_CHARACTERS } from "@askwell/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendWidgetMessage } from "../../lib/widget/embed/chat";
import { isParentInit, type PanelMessage } from "../../lib/widget/embed/protocol";
import { getVisitorId } from "../../lib/widget/embed/visitor";
import styles from "./panel.module.css";

const PREFERRED_HEIGHT = 560;

type Message = { id: string; author: "visitor" | "support"; text: string };

export function ChatPanel({ parentOrigin, publicKey }: { parentOrigin: string | null; publicKey: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [verifiedOrigin, setVerifiedOrigin] = useState<string | null>(null);
  const visitorId = useRef<string | null>(null);
  const verifiedParent = useRef<{ window: Window; origin: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const conversationId = useRef<string | undefined>(undefined);
  const messageList = useRef<HTMLDivElement>(null);

  useEffect(() => {
    visitorId.current ??= getVisitorId(window);
    if (!parentOrigin || window.parent === window) return;

    const parent = window.parent;
    const origin = parentOrigin;
    function onMessage(event: MessageEvent<unknown>) {
      if (!isParentInit(event, parent, origin)) return;

      verifiedParent.current = { window: parent, origin };
      setVerifiedOrigin(origin);
      const resize: PanelMessage = { type: "askwell:resize", height: PREFERRED_HEIGHT };
      parent.postMessage(resize, origin);
    }

    window.addEventListener("message", onMessage);
    const ready: PanelMessage = { type: "askwell:ready" };
    parent.postMessage(ready, origin);
    return () => {
      window.removeEventListener("message", onMessage);
      verifiedParent.current = null;
    };
  }, [parentOrigin]);

  useEffect(() => () => {
    request.current?.abort();
  }, []);

  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isTyping, error]);

  function sendToParent(message: PanelMessage) {
    const parent = verifiedParent.current;
    parent?.window.postMessage(message, parent.origin);
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!publicKey || !text || text.length > MAX_MESSAGE_CHARACTERS || request.current) return;

    const visitor = visitorId.current ??= getVisitorId(window);
    const id = `${visitor}-${messages.length}`;
    const controller = new AbortController();
    request.current = controller;
    setMessages((previous) => [...previous, { id, author: "visitor", text }]);
    setDraft("");
    setError(null);
    setIsTyping(true);
    try {
      const reply = await sendWidgetMessage({
        key: publicKey, visitorId: visitor, conversationId: conversationId.current, message: text,
      }, controller.signal);
      if (controller.signal.aborted) return;

      conversationId.current = reply.conversationId;
      setMessages((previous) => [...previous, { id: `${id}-reply`, author: "support", text: reply.reply }]);
      sendToParent({ type: "askwell:unread", count: 1 });
    } catch (failure) {
      if (!controller.signal.aborted) {
        setError(failure instanceof Error ? failure.message : "Couldn’t send your message. Please try again.");
      }
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setIsTyping(false);
    }
  }

  return (
    <main className={styles.panel}>
      <header className={styles.header}>
        <h1>{DEFAULT_WIDGET_CONFIG.headerText}</h1>
        {parentOrigin && verifiedOrigin === parentOrigin && (
          <button type="button" aria-label="Close chat" onClick={() => sendToParent({ type: "askwell:close" })}>
            ×
          </button>
        )}
      </header>
      <div ref={messageList} className={styles.messages} role="log" aria-label="Chat messages">
        {messages.length === 0 && <p className={styles.empty}>{publicKey ? "How can we help?" : "Chat is unavailable."}</p>}
        {messages.map(({ id, author, text }) => (
          <p key={id} className={author === "visitor" ? styles.visitor : styles.reply}>
            <span className={styles.srOnly}>{author === "visitor" ? "You: " : "Support: "}</span>
            {text}
          </p>
        ))}
        {error && <p role="status" className={styles.typing}>{error}</p>}
        {isTyping && <p className={styles.typing}>Support is typing…</p>}
      </div>
      <form className={styles.composer} onSubmit={send}>
        <label htmlFor="chat-message" className={styles.srOnly}>Message</label>
        <input
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={MAX_MESSAGE_CHARACTERS}
          placeholder="Write a message…"
          autoComplete="off"
          disabled={!publicKey}
        />
        <button type="submit" disabled={!publicKey || isTyping || !draft.trim()}>Send</button>
      </form>
      {DEFAULT_WIDGET_CONFIG.showBadge && (
        <p className={styles.badge}>Powered by {APP_NAME}</p>
      )}
    </main>
  );
}
