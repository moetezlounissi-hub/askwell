"use client";

import { APP_NAME, DEFAULT_WIDGET_CONFIG, MAX_MESSAGE_CHARACTERS } from "@askwell/shared";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { isParentInit, type PanelMessage } from "../../lib/widget/embed/protocol";
import { getVisitorId } from "../../lib/widget/embed/visitor";
import styles from "./panel.module.css";

const PREFERRED_HEIGHT = 560;
const MOCK_REPLY_DELAY_MS = 1000;

type Message = { id: string; author: "visitor" | "support"; text: string };

export function ChatPanel({ parentOrigin }: { parentOrigin: string | null }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [verifiedOrigin, setVerifiedOrigin] = useState<string | null>(null);
  const visitorId = useRef<string | null>(null);
  const verifiedParent = useRef<{ window: Window; origin: string } | null>(null);
  const replyTimer = useRef<number | null>(null);
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
    if (replyTimer.current !== null) window.clearTimeout(replyTimer.current);
  }, []);

  useEffect(() => {
    const list = messageList.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, isTyping]);

  function sendToParent(message: PanelMessage) {
    const parent = verifiedParent.current;
    parent?.window.postMessage(message, parent.origin);
  }

  function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || text.length > MAX_MESSAGE_CHARACTERS || replyTimer.current !== null) return;

    const id = `${visitorId.current ??= getVisitorId(window)}-${messages.length}`;
    setMessages((previous) => [...previous, { id, author: "visitor", text }]);
    setDraft("");
    setIsTyping(true);
    replyTimer.current = window.setTimeout(() => {
      replyTimer.current = null;
      setMessages((previous) => [...previous, {
        id: `${id}-reply`,
        author: "support",
        text: "Thanks for your message! This is a demo reply.",
      }]);
      setIsTyping(false);
      sendToParent({ type: "askwell:unread", count: 1 });
    }, MOCK_REPLY_DELAY_MS);
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
        {messages.length === 0 && <p className={styles.empty}>How can we help?</p>}
        {messages.map(({ id, author, text }) => (
          <p key={id} className={author === "visitor" ? styles.visitor : styles.reply}>
            <span className={styles.srOnly}>{author === "visitor" ? "You: " : "Support: "}</span>
            {text}
          </p>
        ))}
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
        />
        <button type="submit" disabled={isTyping || !draft.trim()}>Send</button>
      </form>
      {DEFAULT_WIDGET_CONFIG.showBadge && (
        <p className={styles.badge}>Powered by {APP_NAME}</p>
      )}
    </main>
  );
}
