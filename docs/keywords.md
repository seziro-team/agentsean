# Keywords, ranks, and providers

Phase 6 demand-side intelligence. The free default is GSC + Bing Webmaster.
A DataForSEO key upgrades the same jobs in place. Sean never scrapes Google.

## Free stack (zero paid keys)

| Capability | Source |
| --- | --- |
| Query demand | GSC Search Analytics (already synced) |
| Volume proxy | Bing Webmaster `GetKeywordStats` / `GetRelatedKeywords` |
| Expansion | Public autocomplete (not HTML SERP scraping) |
| Authority proxy | OpenPageRank (30k free lookups/month) |
| Performance | PageSpeed Insights / CrUX (Phase 2) |
| History | Wayback CDX |
| Extraction | Jina Reader keyless (20 RPM) |
| Entities | Wikidata |

## Paid stack

DataForSEO, quoted **before** the call and debited on the cost ledger after:

- SERP $0.60 / 1k (standard queue)
- Keywords Data $0.06 / task (up to 1,000 keywords)
- Labs $0.012 / task
- Backlinks $0.024 / req + $0.000036 / row

## Clustering

Draft clusters at cosine ≈ 0.78 on local embeddings (hash embedder when
EmbeddingGemma is not installed; Ollama `embeddinggemma` when `OLLAMA_HOST` is
set). Confirm merges with ≥ 3 shared top-10 URLs when a licensed SERP provider
is configured. Vectors are brute-force cosine; LanceDB is the escape hatch
above ~200k vectors and is not bundled.

Keyword difficulty is a per-site model on the user's own GSC top-10 labels, not
a vendor global score.

## Rank tracking

Weekly by default. Licensed vendor only (DataForSEO). Without a key the job
skips honestly and GSC position remains the free proxy.

T4: bundled Google SERP scraping does not exist. Dead options (Bing Search API,
Google CSE, Brave free, pytrends, Google Trends API, SerpApi) are refused.

## MCP

`sean mcp` is a stdio MCP server (`keyword_opportunities`, `keyword_clusters`,
`striking_distance`, `rank_snapshots`, `estimate_provider_cost`, `list_findings`).
`--json` lists the tools and exits. Sean can also *consume* OpenSEO if you
already run it (`sean connect openseo --api-key` plus `openseoMcpUrl`).

OpenSEO `formatters.ts` / `table.ts` are copied under MIT; see
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Agent Sean is not a fork.
