/** Bitsight 2026: OpenClaw accepted a 1-character gateway token. */
export const MIN_TOKEN_LENGTH = 32;
export const MIN_TOKEN_UNIQUE_CHARS = 8;

export class TokenStrengthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenStrengthError";
  }
}

export function assertTokenStrength(token: string): void {
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new TokenStrengthError(
      `Auth token must be at least ${MIN_TOKEN_LENGTH} characters. Short tokens are brute-forceable.`,
    );
  }
  if (new Set(token).size < MIN_TOKEN_UNIQUE_CHARS) {
    throw new TokenStrengthError(
      `Auth token must contain at least ${MIN_TOKEN_UNIQUE_CHARS} distinct characters.`,
    );
  }
}

export function envAuthToken(): string | undefined {
  const raw = process.env["SEAN_AUTH_TOKEN"]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}
