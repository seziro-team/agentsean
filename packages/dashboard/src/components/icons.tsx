/** Inline stroke icons (no dependency). 24x24 viewBox, currentColor. */
import type { JSX } from "react";

type P = { className?: string };

function svg(path: JSX.Element, props: P): JSX.Element {
  return (
    <svg
      className={props.className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

/** The product mark: a diff — red removed line, green added line, blue daemon
 * chevron. Copied from the marketing site so the brand is identical. */
export function BrandMark({ className }: P): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 132 132" aria-hidden="true">
      <rect
        x="2"
        y="2"
        width="128"
        height="128"
        rx="29"
        fill="#10141c"
        stroke="#2a3342"
        strokeWidth="3"
      />
      <rect x="30" y="38" width="9" height="9" rx="2" fill="#ff6a63" />
      <rect
        x="47"
        y="39.5"
        width="34"
        height="6"
        rx="3"
        fill="#ff6a63"
        fillOpacity=".42"
      />
      <rect x="30" y="61.5" width="9" height="9" rx="2" fill="#45d268" />
      <rect
        x="47"
        y="63"
        width="55"
        height="6"
        rx="3"
        fill="#45d268"
        fillOpacity=".9"
      />
      <path
        d="M31 84.5 41.5 93.5 31 102.5"
        stroke="#62a4ff"
        strokeWidth="6.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <rect
        x="51"
        y="86"
        width="30"
        height="15"
        rx="3.5"
        fill="#62a4ff"
        fillOpacity=".85"
      />
    </svg>
  );
}

export const IconHome = (p: P) =>
  svg(<path d="M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5" />, p);
export const IconList = (p: P) =>
  svg(<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />, p);
export const IconCheck = (p: P) => svg(<path d="m4 12 5 5L20 6" />, p);
export const IconDiff = (p: P) => svg(<path d="M12 3v6m-3-3h6M6 17h12M6 20h12" />, p);
export const IconBolt = (p: P) => svg(<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />, p);
export const IconDoc = (p: P) => svg(<path d="M6 2h8l4 4v16H6zM14 2v4h4" />, p);
export const IconSearch = (p: P) =>
  svg(<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14ZM20 20l-3.5-3.5" />, p);
export const IconKey = (p: P) =>
  svg(<path d="M15 7a4 4 0 1 1-4 4M11 11 3 19m3-3 2 2m-4 0 2 2" />, p);
export const IconGauge = (p: P) =>
  svg(<path d="M12 13 15.5 9.5M4 18a8 8 0 1 1 16 0" />, p);
export const IconSparkle = (p: P) =>
  svg(<path d="M12 3v18M3 12h18M6.5 6.5l11 11M17.5 6.5l-11 11" />, p);
export const IconPin = (p: P) =>
  svg(
    <path d="M12 21s7-5.5 7-11a7 7 0 0 0-14 0c0 5.5 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />,
    p,
  );
export const IconLink = (p: P) =>
  svg(
    <path d="M9 15 15 9M10 6l1-1a4 4 0 0 1 6 6l-1 1M14 18l-1 1a4 4 0 0 1-6-6l1-1" />,
    p,
  );
export const IconGlobe = (p: P) =>
  svg(
    <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9S14.5 18.5 12 21M12 3C9.5 5.5 8.5 9 8.5 12S9.5 18.5 12 21" />,
    p,
  );
export const IconSpider = (p: P) =>
  svg(
    <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M18 6l-2 2M8 16l-2 2" />,
    p,
  );
export const IconGear = (p: P) =>
  svg(
    <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM12 2.5l1.4 2.3 2.6-.6.4 2.7 2.4 1.2-1.1 2.5 1.1 2.5-2.4 1.2-.4 2.7-2.6-.6L12 21.5l-1.4-2.3-2.6.6-.4-2.7-2.4-1.2 1.1-2.5-1.1-2.5 2.4-1.2.4-2.7 2.6.6Z" />,
    p,
  );
export const IconCard = (p: P) => svg(<path d="M3 6h18v12H3zM3 10h18" />, p);
export const IconWarn = (p: P) =>
  svg(<path d="M12 3 2 20h20L12 3ZM12 9v5m0 3h.01" />, p);
export const IconInbox = (p: P) =>
  svg(<path d="M3 13h5l1.5 3h5L16 13h5M4 13 6 5h12l2 8v6H4z" />, p);
export const IconCopy = (p: P) => svg(<path d="M9 9h11v11H9zM5 15H4V4h11v1" />, p);
export const IconExternal = (p: P) =>
  svg(
    <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
    p,
  );
export const IconRefresh = (p: P) =>
  svg(
    <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />,
    p,
  );
export const IconArrow = (p: P) => svg(<path d="M5 12h14M13 6l6 6-6 6" />, p);
