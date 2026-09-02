/** Loading / error / empty primitives and an AsyncBoundary that renders the
 * right one from a react-query result. Every view routes its fetch through
 * these so all three states exist by construction. */
import type { JSX, ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { ApiError } from "../api.js";
import { IconWarn } from "./icons.js";
import { Cmd } from "./Page.js";

export function Loading({ label = "Loading…" }: { label?: string }): JSX.Element {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <div className="skel" style={{ height: 74 }} />
      <div className="skel" style={{ height: 74 }} />
      <div className="skel" style={{ height: 140 }} />
      <span className="small dim" style={{ textAlign: "center" }}>
        {label}
      </span>
    </div>
  );
}

/** Turn an unknown thrown value into a readable message. */
function messageOf(err: unknown): { message: string; status?: number } {
  if (err instanceof ApiError) {
    return { message: err.message, status: err.status };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: String(err) };
}

export function ErrorState({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}): JSX.Element {
  const { message, status } = messageOf(error);
  return (
    <div className="state err" role="alert">
      <div className="ic">
        <IconWarn className="ico" />
      </div>
      <h3>Could not load this</h3>
      <p>
        {status ? `${status} — ` : ""}
        {message || "The daemon did not respond as expected."}
      </p>
      <div className="actions">
        {onRetry ? (
          <button className="btn btn-ghost btn-sm" onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyState(props: {
  title: string;
  body?: ReactNode;
  command?: string;
  actions?: ReactNode;
  icon?: JSX.Element;
  inline?: boolean;
}): JSX.Element {
  return (
    <div className={`state${props.inline ? " inline" : ""}`}>
      {props.icon ? <div className="ic">{props.icon}</div> : null}
      <h3>{props.title}</h3>
      {props.body ? <p>{props.body}</p> : null}
      {props.command ? (
        <div className="actions">
          <Cmd command={props.command} />
        </div>
      ) : null}
      {props.actions ? <div className="actions">{props.actions}</div> : null}
    </div>
  );
}

/** Renders loading/error while a query resolves, then children with the data.
 * `isEmpty` lets a view declare its own "no data" state. */
export function AsyncBoundary<T>(props: {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  loading?: string;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
}): JSX.Element {
  const q = props.query;
  if (q.isPending)
    return <Loading {...(props.loading ? { label: props.loading } : {})} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const data = q.data as T;
  if (props.isEmpty?.(data) && props.empty) return <>{props.empty}</>;
  return <>{props.children(data)}</>;
}
