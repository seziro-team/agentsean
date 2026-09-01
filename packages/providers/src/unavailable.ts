import { ProviderRefusedError } from "./refuse.js";
import { freeEstimate } from "./rates.js";
import type {
  BacklinkOverview,
  BacklinksCapability,
  KeywordRow,
  ProviderCall,
  SerpCapability,
  SerpResult,
  VolumeCapability,
  VolumeRow,
} from "./types.js";

export function unavailableSerp(): SerpCapability {
  return {
    id: "none",
    available: false,
    serp(): ProviderCall<SerpResult> {
      return {
        estimate: freeEstimate("none", "serp", "unavailable", 0, "no licensed SERP provider"),
        async run(): Promise<SerpResult> {
          throw new ProviderRefusedError(
            "no_licensed_serp",
            "No licensed SERP provider configured. Sean never scrapes Google. Add a DataForSEO key to upgrade in place.",
          );
        },
      };
    },
  };
}

export function unavailableVolume(): VolumeCapability {
  return {
    id: "none",
    volume(): ProviderCall<VolumeRow[]> {
      return {
        estimate: freeEstimate("none", "volume", "unavailable", 0, "no volume provider"),
        async run() {
          return [];
        },
      };
    },
  };
}

export function unavailableBacklinks(): BacklinksCapability {
  return {
    id: "none",
    available: false,
    overview(): ProviderCall<BacklinkOverview> {
      return {
        estimate: freeEstimate("none", "backlinks", "unavailable", 0),
        async run(): Promise<BacklinkOverview> {
          throw new ProviderRefusedError(
            "no_backlinks_provider",
            "No backlink/authority provider configured. OpenPageRank is the free authority proxy; DataForSEO is the paid graph.",
          );
        },
      };
    },
  };
}

export function emptyKeywords(): { id: string; demand: () => ProviderCall<KeywordRow[]>; related: (seed: string) => ProviderCall<KeywordRow[]> } {
  return {
    id: "none",
    demand() {
      return {
        estimate: freeEstimate("none", "keywords", "empty", 0),
        async run() {
          return [];
        },
      };
    },
    related() {
      return {
        estimate: freeEstimate("none", "keywords", "empty", 0),
        async run() {
          return [];
        },
      };
    },
  };
}
