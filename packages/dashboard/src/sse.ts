import { useEffect } from "react";
import type { QueryClient } from "@tanstack/react-query";

/** Exactly one EventSource per tab. Cookie carries the token; GET is Host-checked. */
export function useInvalidation(client: QueryClient, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const src = new EventSource("/api/events");
    const onMessage = (ev: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(ev.data) as { keys?: string[] };
        for (const key of parsed.keys ?? []) {
          void client.invalidateQueries({ queryKey: [key] });
        }
      } catch {
        // ignore malformed events
      }
    };
    src.addEventListener("message", onMessage);
    return () => {
      src.removeEventListener("message", onMessage);
      src.close();
    };
  }, [client, enabled]);
}
