import { APP_NAME, type WidgetConfigResponse } from "@askwell/shared";

const script = document.currentScript;
if (script instanceof HTMLScriptElement && script.dataset.key) {
  const scriptOrigin = new URL(script.src).origin;
  const parentOrigin = window.location.origin;
  if (/^https?:\/\//.test(scriptOrigin) && /^https?:\/\//.test(parentOrigin)) {
    void install(script.dataset.key, scriptOrigin, parentOrigin).catch(() => {
      // An unavailable config should leave the host page untouched.
    });
  }
}

async function install(key: string, origin: string, parentOrigin: string) {
  const configUrl = new URL("/api/widget/config", origin);
  configUrl.searchParams.set("key", key);
  const response = await fetch(configUrl, { credentials: "omit" });
  if (!response.ok) return;

  const config: WidgetConfigResponse = await response.json();
  if (!document.body) {
    await new Promise<void>((resolve) => {
      document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
    });
  }

  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    :host{all:initial}
    .widget{position:fixed;z-index:2147483647;bottom:16px;right:16px;font:14px system-ui,sans-serif}
    .widget[data-position^=top]{bottom:auto;top:16px}
    .widget[data-position$=left]{right:auto;left:16px}
    button{position:relative;box-sizing:border-box;height:44px;max-width:calc(100vw - 32px);
      padding:0 16px;border:0;border-radius:24px;color:white;background:black;
      font:inherit;font-weight:600;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .unread{position:absolute;top:3px;right:4px;width:7px;height:7px;border-radius:50%;
      background:white;box-shadow:0 0 0 1px black}
    iframe{position:absolute;bottom:52px;right:0;width:min(380px,calc(100vw - 32px));
      height:560px;max-height:max(0px,calc(100vh - 84px));
      max-height:max(0px,calc(100dvh - 84px));border:0;border-radius:16px;background:white;
      box-shadow:0 12px 40px #0003;transform-origin:bottom right}
    .widget[data-position^=top] iframe{top:52px;bottom:auto;transform-origin:top right;--slide:-8px}
    .widget[data-position$=left] iframe{left:0;right:auto;transform-origin:bottom left}
    .widget[data-position=top-left] iframe{transform-origin:top left}
    @media(prefers-reduced-motion:no-preference){
      iframe[data-animation=fade]{animation:fade .2s ease-out}
      iframe[data-animation=slide]{animation:slide .2s ease-out}
      iframe[data-animation=scale]{animation:scale .2s ease-out}
    }
    @keyframes fade{from{opacity:0}}
    @keyframes slide{from{opacity:0;transform:translateY(var(--slide,8px))}}
    @keyframes scale{from{opacity:0;transform:scale(.96)}}
  `;

  const widget = document.createElement("div");
  widget.className = "widget";
  widget.dataset.position = config.position;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = config.label;
  button.style.backgroundColor = config.buttonColor;
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "chat-panel");
  const unread = document.createElement("span");
  unread.className = "unread";
  unread.hidden = true;
  button.append(unread);
  widget.append(button);
  shadow.append(style, widget);
  document.body.append(host);

  let frame: HTMLIFrameElement | undefined;

  function sendInit() {
    frame?.contentWindow?.postMessage({ type: "askwell:init" }, origin);
  }

  function close() {
    if (!frame || frame.hidden) return;
    frame.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.focus();
  }

  function onMessage(event: MessageEvent<unknown>) {
    if (!frame?.contentWindow || event.source !== frame.contentWindow || event.origin !== origin) return;
    const { data } = event;
    if (typeof data !== "object" || data === null || !("type" in data)) return;

    switch (data.type) {
      case "askwell:ready":
        sendInit();
        break;
      case "askwell:close":
        close();
        break;
      case "askwell:resize":
        if ("height" in data && typeof data.height === "number" && Number.isFinite(data.height)) {
          // CSS also clamps the height to the available viewport as it changes.
          frame.style.height = `${Math.max(0, data.height)}px`;
        }
        break;
      case "askwell:unread":
        if ("count" in data && data.count === 1 && frame.hidden) {
          unread.hidden = false;
          button.setAttribute("aria-label", `${config.label} (unread reply)`);
        }
        break;
    }
  }

  button.addEventListener("click", () => {
    if (frame && !frame.hidden) {
      close();
      return;
    }

    if (!frame) {
      const url = new URL("/embed", origin);
      url.searchParams.set("key", key);
      url.searchParams.set("parentOrigin", parentOrigin);
      frame = document.createElement("iframe");
      frame.id = "chat-panel";
      frame.title = `${APP_NAME} chat`;
      frame.dataset.animation = config.animation;
      frame.addEventListener("load", sendInit);
      window.addEventListener("message", onMessage);
      frame.src = url.href;
      widget.append(frame);
    }

    frame.hidden = false;
    unread.hidden = true;
    button.removeAttribute("aria-label");
    button.setAttribute("aria-expanded", "true");
  });
}
