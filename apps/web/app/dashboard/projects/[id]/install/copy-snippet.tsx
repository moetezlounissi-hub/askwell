"use client";

import { useState } from "react";

export function CopySnippet({ snippet }: { snippet: string }) {
  const [status, setStatus] = useState("");

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setStatus("Snippet copied.");
    } catch {
      setStatus("Select the snippet and copy it manually.");
    }
  }

  return (
    <div className="mt-4">
      <label htmlFor="install-snippet" className="block font-semibold">Install snippet</label>
      <textarea
        id="install-snippet"
        className="my-2 w-full rounded-lg border border-black/25 bg-white p-3 font-mono text-sm"
        rows={3}
        readOnly
        value={snippet}
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button className="button button-small" type="button" onClick={copy}>Copy snippet</button>
        <p role="status">{status}</p>
      </div>
    </div>
  );
}
