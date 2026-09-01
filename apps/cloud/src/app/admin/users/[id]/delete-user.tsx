"use client";
import { useState } from "react";
import { deleteUser } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

/**
 * GDPR erase / delete a user. Gated behind typing the user's exact email so a
 * misclick cannot destroy an account. Posts to the deleteUser server action,
 * which re-checks the confirmation and writes an audit row.
 */
export function DeleteUser({ userId, email }: { userId: string; email: string }) {
  const [confirm, setConfirm] = useState("");
  const matches = confirm.trim().toLowerCase() === email.toLowerCase();

  return (
    <form action={deleteUser} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <Field label={`Type "${email}" to confirm deletion`} htmlFor="confirmEmail">
        <Input
          id="confirmEmail"
          name="confirmEmail"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={email}
          autoComplete="off"
        />
      </Field>
      <Button type="submit" variant="danger" disabled={!matches}>
        Delete user & erase data
      </Button>
    </form>
  );
}
