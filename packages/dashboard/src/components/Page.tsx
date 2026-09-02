/** Layout + presentational primitives shared by every view. */
import { useState } from "react";
import type { JSX, ReactNode } from "react";
import { IconCopy } from "./icons.js";

export function PageHeader(props: {
  kicker?: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <header className="page-head">
      <div className="spread">
        <div style={{ minWidth: 0 }}>
          {props.kicker ? <span className="kicker">{props.kicker}</span> : null}
          <h2>{props.title}</h2>
        </div>
        {props.actions ? <div className="row">{props.actions}</div> : null}
      </div>
      {props.lead ? (
        <p className="lead" style={{ marginTop: 8 }}>
          {props.lead}
        </p>
      ) : null}
    </header>
  );
}

export function Card(props: {
  title?: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <section className={`card${props.className ? ` ${props.className}` : ""}`}>
      {props.title ? (
        <div className="card-h">
          <h3>{props.title}</h3>
          {props.sub ? <span className="sub">{props.sub}</span> : null}
        </div>
      ) : null}
      {props.children}
    </section>
  );
}

export function Stat(props: {
  label: string;
  value: ReactNode;
  foot?: ReactNode;
  plain?: boolean;
}): JSX.Element {
  return (
    <div className="stat">
      <div className="lbl">{props.label}</div>
      <div className={`val${props.plain ? " plain" : ""}`}>{props.value}</div>
      {props.foot ? <div className="foot">{props.foot}</div> : null}
    </div>
  );
}

export function Pill(props: {
  children: ReactNode;
  n?: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span className={`pill${props.className ? ` ${props.className}` : ""}`}>
      {props.children}
      {props.n !== undefined ? <span className="n">{props.n}</span> : null}
    </span>
  );
}

export function Badge(props: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <span className={`badge${props.className ? ` ${props.className}` : ""}`}>
      {props.children}
    </span>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
  ariaLabel: string;
}): JSX.Element {
  return (
    <div className="seg" role="tablist" aria-label={props.ariaLabel}>
      {props.options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={props.value === o.value}
          className={props.value === o.value ? "on" : ""}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Note(props: {
  children: ReactNode;
  variant?: "warn" | "good";
  icon?: JSX.Element;
}): JSX.Element {
  return (
    <div className={`inline-note${props.variant ? ` ${props.variant}` : ""}`}>
      {props.icon ? <span className="ic">{props.icon}</span> : null}
      <span>{props.children}</span>
    </div>
  );
}

/** A copyable shell command, styled like the marketing site's `.cmd`. */
export function Cmd({ command }: { command: string }): JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <span className="cmd">
      <span className="p" aria-hidden="true">
        $
      </span>
      <code style={{ flex: 1 }}>{command}</code>
      <button
        type="button"
        className={copied ? "done" : ""}
        aria-label={copied ? "Copied" : "Copy command"}
        onClick={() => {
          void navigator.clipboard?.writeText(command).then(
            () => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            },
            () => undefined,
          );
        }}
      >
        {copied ? "Copied" : <IconCopy className="ico" />}
      </button>
    </span>
  );
}

/** Small helper: a labelled form field. */
export function Field(props: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
}): JSX.Element {
  return (
    <div className="field">
      <label htmlFor={props.htmlFor}>{props.label}</label>
      {props.children}
      {props.hint ? <span className="hint">{props.hint}</span> : null}
    </div>
  );
}
