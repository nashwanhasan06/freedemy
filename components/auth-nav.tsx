import Link from "next/link";

import { SignOutButton } from "@/components/sign-out-button";
import { displayName, getCurrentUser, type CurrentUser } from "@/lib/auth";

const linkClass =
  "rounded-lg px-2 py-1.5 text-[0.85rem] font-medium text-muted-foreground transition-colors hover:text-foreground";

type AuthNavProps = {
  /** Pass the page's already-resolved session to skip a second cookie lookup. */
  user?: CurrentUser | null;
};

/**
 * Auth-aware header nav: visitors get Sign in / Sign up, signed-in students
 * get their name and Sign out. Server component — it reads the session cookie
 * on every render, so the header always matches the real session.
 */
export async function AuthNav({ user: resolved }: AuthNavProps = {}) {
  const user = resolved === undefined ? await getCurrentUser() : resolved;

  if (!user) {
    return (
      <>
        <Link href="/login" className={linkClass}>
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg bg-primary/10 px-3 py-1.5 text-[0.85rem] font-medium text-primary transition-colors hover:bg-primary/20"
        >
          Sign up
        </Link>
      </>
    );
  }

  return (
    <>
      <span className="hidden text-[0.8rem] text-muted-foreground sm:inline">
        {displayName(user.name)}
      </span>
      <SignOutButton />
    </>
  );
}
