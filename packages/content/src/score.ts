/** MarketMuse-documented Content Score: Σ min(2, mentions) over ≤50 topics, scaled 0–100. */

export function countMentions(haystack: string, needle: string): number {
  if (!needle.trim()) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  while (from <= h.length - n.length) {
    const i = h.indexOf(n, from);
    if (i < 0) break;
    count += 1;
    from = i + n.length;
  }
  return count;
}

export function contentScore(text: string, topics: string[]): number {
  const list = topics.filter((t) => t.trim()).slice(0, 50);
  if (list.length === 0) return 0;
  let sum = 0;
  for (const t of list) sum += Math.min(2, countMentions(text, t));
  return (sum / (2 * list.length)) * 100;
}
