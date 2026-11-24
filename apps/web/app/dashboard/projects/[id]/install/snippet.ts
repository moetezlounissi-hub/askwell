export function getInstallSnippet(appUrl: string | undefined, publicKey: string) {
  const url = appUrl && URL.parse(appUrl);
  if (!url || (url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
    return null;
  }

  const scriptUrl = new URL("/widget.js", url);
  return `<script src="${scriptUrl.href}" data-key="${publicKey}"></script>`;
}
