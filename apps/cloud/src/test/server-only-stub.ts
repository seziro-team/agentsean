/**
 * Stands in for Next's `server-only` guard under vitest.
 *
 * The real module throws if it is pulled into a client bundle. That check is
 * meaningless in a node test runner, and without a stub every server module
 * importing it is untestable — which is why the billing apply path had no
 * tests at all, despite deciding whether a paying customer gets what they
 * paid for.
 */
export const isServerOnlyStub = true;
