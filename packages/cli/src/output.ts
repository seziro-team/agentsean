export function emit(
  jsonMode: boolean,
  payload: Record<string, unknown>,
  human: string,
): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify(payload) + "\n");
    return;
  }
  process.stdout.write(human.endsWith("\n") ? human : human + "\n");
}

export function emitError(
  jsonMode: boolean,
  payload: Record<string, unknown>,
  human: string,
): void {
  if (jsonMode) {
    process.stdout.write(JSON.stringify({ ok: false, ...payload }) + "\n");
    return;
  }
  process.stderr.write(human.endsWith("\n") ? human : human + "\n");
}
