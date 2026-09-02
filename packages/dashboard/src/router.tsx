/** Client-side routing + the grouped navigation model.
 *
 * The set of paths here MUST stay a subset of the daemon's SPA_PATHS
 * (packages/daemon/src/spa.ts), because the daemon only serves index.html for
 * those exact routes on a hard refresh. We group them for the sidebar but never
 * invent a new URL. */
import { useEffect, useState } from "react";
import type { JSX } from "react";
import {
  IconHome,
  IconList,
  IconCheck,
  IconDiff,
  IconBolt,
  IconDoc,
  IconSearch,
  IconKey,
  IconGauge,
  IconSparkle,
  IconPin,
  IconLink,
  IconGlobe,
  IconSpider,
  IconGear,
  IconCard,
} from "./components/icons.js";

export type Ctx = {
  siteId: string | undefined;
  origin: string | undefined;
  go: (p: string) => void;
};

type Icon = (p: { className?: string }) => JSX.Element;

export type NavItem = {
  path: string;
  label: string;
  icon: Icon;
  /** which overview count to surface as a badge, if any */
  badge?: "findings" | "approvals";
};

export type NavGroup = { heading: string; items: NavItem[] };

/** The grouped sidebar. Overview is the hub; the rest are grouped by intent. */
export const NAV: NavGroup[] = [
  {
    heading: "Start here",
    items: [{ path: "/", label: "Overview", icon: IconHome }],
  },
  {
    heading: "Work",
    items: [
      { path: "/findings", label: "Findings", icon: IconList, badge: "findings" },
      { path: "/approvals", label: "Approvals", icon: IconCheck, badge: "approvals" },
      { path: "/changes", label: "Activity", icon: IconDiff },
      { path: "/automations", label: "Automations", icon: IconBolt },
    ],
  },
  {
    heading: "Content",
    items: [
      { path: "/content", label: "Content", icon: IconDoc },
      { path: "/keywords", label: "Keywords", icon: IconKey },
      { path: "/reports", label: "Reports", icon: IconDoc },
    ],
  },
  {
    heading: "Insight",
    items: [
      { path: "/search", label: "Search", icon: IconSearch },
      { path: "/evidence", label: "Evidence", icon: IconGauge },
      { path: "/ai", label: "AI visibility", icon: IconSparkle },
      { path: "/local", label: "Local", icon: IconPin },
      { path: "/mentions", label: "Mentions", icon: IconLink },
    ],
  },
  {
    heading: "Setup",
    items: [
      { path: "/connect", label: "Connect Google", icon: IconGlobe },
      { path: "/crawls", label: "Crawls", icon: IconSpider },
      { path: "/settings", label: "Settings", icon: IconGear },
      { path: "/billing", label: "Billing", icon: IconCard },
    ],
  },
];

/** Flattened label lookup for titles etc. */
export const LABEL: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items).map((i) => [i.path, i.label]),
);

/** History-based path hook. `/connect` is a real daemon HTML page, so we let
 * the browser navigate to it rather than intercepting. */
export function usePath(): [string, (p: string) => void] {
  const [path, setPath] = useState(() => location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const go = (p: string) => {
    if (p === location.pathname) return;
    history.pushState(null, "", p);
    setPath(p);
    // scroll the content region back to top on navigation
    document.querySelector(".content")?.scrollTo({ top: 0 });
  };
  return [path, go];
}
