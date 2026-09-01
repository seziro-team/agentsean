import { signOut } from "@/app/auth/actions";
import { Button } from "./ui/button";

/** Posts to the signOut server action. A real <button> inside a real <form>. */
export function SignOutButton() {
  return (
    <form action={signOut}>
      <Button type="submit" variant="ghost" size="sm" className="w-full justify-start">
        Sign out
      </Button>
    </form>
  );
}
