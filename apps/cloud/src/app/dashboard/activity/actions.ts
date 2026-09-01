"use server";

export type RevertState = { status: "idle" | "unavailable"; message?: string };

/**
 * Revert a change.
 *
 * The executor's revert cycle (snapshot → rollback) runs INSIDE the customer's
 * daemon, which holds the credentials — the control plane never does (see
 * ARCHITECTURE.md §2/§4). So a revert from here would be dispatched to the
 * daemon over the relay, and that dispatch path is not wired yet. Until it is,
 * this returns an explicit "unavailable" state rather than pretending to revert.
 */
export async function revertChange(
  _prev: RevertState,
  _formData: FormData,
): Promise<RevertState> {
  return {
    status: "unavailable",
    message:
      "Reverts run in your daemon, which holds the credentials. Dispatching " +
      "reverts from the cloud is coming soon — for now run `sean revert <id>` " +
      "on your daemon host.",
  };
}
