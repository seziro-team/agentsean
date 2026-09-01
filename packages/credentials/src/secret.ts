const REDACTED = "[redacted]";
const INSPECT = Symbol.for("nodejs.util.inspect.custom");

/**
 * A secret that cannot accidentally appear in logs, JSON, or util.inspect.
 * Call `unwrap()` at the point of use. Never log the result.
 */
export class Secret<T extends string = string> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  unwrap(): T {
    return this.#value;
  }

  toString(): string {
    return REDACTED;
  }

  toJSON(): string {
    return REDACTED;
  }

  valueOf(): string {
    return REDACTED;
  }

  [INSPECT](): string {
    return REDACTED;
  }
}
