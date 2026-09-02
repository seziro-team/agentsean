/** The grouped sidebar: brand, site switcher, navigation, live/frozen status. */
import type { JSX, MouseEvent } from "react";
import { NAV } from "../router.js";
import type { NavItem } from "../router.js";
import { BrandMark } from "./icons.js";

type Site = { id: string; origin: string; name: string | null };

export function Nav(props: {
  path: string;
  go: (p: string) => void;
  sites: Site[];
  siteId: string | undefined;
  onSite: (id: string) => void;
  counts: { findings: number; approvals: number };
  halted: boolean;
}): JSX.Element {
  const badgeCount = (item: NavItem): number | null => {
    if (item.badge === "findings") return props.counts.findings || null;
    if (item.badge === "approvals") return props.counts.approvals || null;
    return null;
  };

  const onNav = (e: MouseEvent, path: string) => {
    // /connect is a server-rendered HTML page, not part of the SPA — let the
    // browser follow the link so the daemon serves it.
    if (path === "/connect") return;
    e.preventDefault();
    props.go(path);
  };

  return (
    <nav className="side" aria-label="Primary">
      <a
        className="brand"
        href="/"
        onClick={(e) => onNav(e, "/")}
        aria-label="Agent Sean — overview"
      >
        <BrandMark />
        <span>Agent Sean</span>
      </a>

      {props.sites.length > 0 ? (
        <div className="site-switch">
          <label htmlFor="site-switch">Site</label>
          <select
            id="site-switch"
            value={props.siteId ?? ""}
            onChange={(e) => props.onSite(e.target.value)}
          >
            {props.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.origin.replace(/^https?:\/\//, "")}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {NAV.map((group) => (
        <div className="nav-group" key={group.heading}>
          <div className="nav-h">{group.heading}</div>
          {group.items.map((item) => {
            const count = badgeCount(item);
            const active =
              item.path === "/" ? props.path === "/" : props.path.startsWith(item.path);
            return (
              <a
                key={item.path}
                href={item.path}
                className={`nav-link${active ? " active" : ""}`}
                aria-current={active ? "page" : undefined}
                onClick={(e) => onNav(e, item.path)}
              >
                <item.icon className="ico" />
                <span>{item.label}</span>
                {count !== null ? (
                  <span
                    className={`count${item.badge === "approvals" ? " alert" : ""}`}
                  >
                    {count}
                  </span>
                ) : null}
              </a>
            );
          })}
        </div>
      ))}

      <div className="side-foot">
        <span className="halt-mini">
          <span className={`dot ${props.halted ? "frozen" : "live"}`} />
          {props.halted ? "Writes frozen" : "Daemon live"}
        </span>
      </div>
    </nav>
  );
}
