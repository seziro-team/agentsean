/** The product arc, made visible: connect → observe → propose → fix → verify.
 * The current step is derived from real data so a first-run user always knows
 * what happens next. */
import type { JSX } from "react";
import { IconCheck } from "./icons.js";

type StepState = "done" | "active" | "pending";

function Step(props: {
  n: number;
  title: string;
  detail: string;
  state: StepState;
}): JSX.Element {
  return (
    <div className={`arc-step ${props.state}`}>
      <div className="n">
        <span className="pip">
          {props.state === "done" ? <IconCheck className="ico" /> : props.n}
        </span>
        step {props.n}
      </div>
      <div className="h">{props.title}</div>
      <div className="d">{props.detail}</div>
    </div>
  );
}

export function Arc(props: {
  go: (p: string) => void;
  connected: boolean;
  observeLeft: number | null;
  openFindings: number;
  applied: number;
  queued: number;
}): JSX.Element {
  const observing = props.observeLeft !== null && props.observeLeft > 0;
  // Determine the single active step. Earlier steps are done.
  let active = 2; // default: proposing/observing
  if (!props.connected) active = 0;
  else if (observing) active = 1;
  else if (props.queued > 0) active = 2;
  else if (props.applied > 0) active = 4;
  else if (props.openFindings > 0) active = 2;

  const stateOf = (i: number): StepState =>
    i < active ? "done" : i === active ? "active" : "pending";

  const observeDetail = observing
    ? `${props.observeLeft} day${props.observeLeft === 1 ? "" : "s"} left before Sean proposes`
    : props.connected
      ? "Baseline complete"
      : "7-day baseline, so changes are measured against a real before";

  return (
    <section aria-label="Progress" className="arc">
      <Step
        n={1}
        title="Connected"
        detail={props.connected ? "Site crawled and scored" : "Add your site to begin"}
        state={stateOf(0)}
      />
      <Step n={2} title="Observing" detail={observeDetail} state={stateOf(1)} />
      <Step
        n={3}
        title="Proposing"
        detail={
          props.openFindings > 0
            ? `${props.openFindings} finding${props.openFindings === 1 ? "" : "s"} to work through`
            : "Sean surfaces prioritised fixes"
        }
        state={stateOf(2)}
      />
      <Step
        n={4}
        title="Fixing"
        detail={
          props.queued > 0
            ? `${props.queued} waiting on your approval`
            : "Safe fixes auto-apply; risky ones wait for you"
        }
        state={stateOf(3)}
      />
      <Step
        n={5}
        title="Verify / revert"
        detail={
          props.applied > 0
            ? `${props.applied} applied — review or revert any of them`
            : "Every write is a reversible diff"
        }
        state={stateOf(4)}
      />
    </section>
  );
}
