import type { ExtractPage } from "./types.js";

/** Jina Reader keyless, 20 RPM. */
export async function jinaRead(
  url: string,
  opts?: { fetch?: typeof fetch },
): Promise<ExtractPage> {
  const fetchFn = opts?.fetch ?? fetch;
  const res = await fetchFn(`https://r.jina.ai/${url}`, {
    headers: { accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`Jina Reader HTTP ${res.status}`);
  const text = await res.text();
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  return {
    url,
    text,
    provider: "jina",
    ...(titleMatch?.[1] ? { title: titleMatch[1].trim() } : {}),
  };
}
