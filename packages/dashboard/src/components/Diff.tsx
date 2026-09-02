/** The before/after diff — the product's whole thesis, made legible.
 * Red is what was there, green is what Sean wrote. */
import type { JSX } from "react";

function lines(s: string): string[] {
  const t = (s ?? "").replace(/\r\n/g, "\n");
  if (t === "") return [];
  return t.split("\n");
}

export function Diff(props: {
  before: string;
  after: string;
  label?: string;
  /** cap very long payloads so a diff bomb can't blow out the layout */
  max?: number;
}): JSX.Element {
  const cap = props.max ?? 1200;
  const before = (props.before ?? "").slice(0, cap);
  const after = (props.after ?? "").slice(0, cap);
  const del = lines(before);
  const add = lines(after);
  const empty = del.length === 0 && add.length === 0;
  return (
    <div className="diff">
      {props.label ? (
        <div className="diff-h">
          <span aria-hidden="true">±</span>
          {props.label}
        </div>
      ) : null}
      <div className="diff-body">
        {empty ? (
          <div className="diffline ctx">(no content)</div>
        ) : (
          <>
            {del.map((l, i) => (
              <div className="diffline del" key={`d${i}`}>
                <span className="sign" aria-hidden="true">
                  −
                </span>
                <span>{l === "" ? " " : l}</span>
              </div>
            ))}
            {add.map((l, i) => (
              <div className="diffline add" key={`a${i}`}>
                <span className="sign" aria-hidden="true">
                  +
                </span>
                <span>{l === "" ? " " : l}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
