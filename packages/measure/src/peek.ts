/**
 * Peeking takes the null false-positive rate from 4.7% to 22.9%.
 * planned_end is immutable once running; no verdict before that date.
 */

export type PeekDecision =
  | { allowed: true; provisional: false }
  | { allowed: false; provisional: true; reason: string };

export function analysisDateReached(plannedEnd: string, now: Date): boolean {
  return now.toISOString().slice(0, 10) >= plannedEnd;
}

export function guardPeeking(
  plannedEnd: string,
  now: Date,
  peekingBlocked = true,
): PeekDecision {
  if (analysisDateReached(plannedEnd, now)) {
    return { allowed: true, provisional: false };
  }
  if (!peekingBlocked) {
    return {
      allowed: false,
      provisional: true,
      reason: `Provisional — not a decision. Analysis date is ${plannedEnd}.`,
    };
  }
  return {
    allowed: false,
    provisional: true,
    reason: `Peeking blocked until ${plannedEnd}. Daily peeking raises the null false-positive rate from 4.7% to 22.9%.`,
  };
}

export class PlannedEndImmutableError extends Error {
  override readonly name = "PlannedEndImmutableError";
  constructor() {
    super(
      "planned_end is immutable once the experiment is running. Extending a running test manufactures false positives.",
    );
  }
}
