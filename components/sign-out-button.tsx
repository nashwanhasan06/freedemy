"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/actions/auth";
import { cn } from "@/lib/utils";

/**
 * Sign-out as a real form submit. Base UI's Button defaults to `type="button"`
 * (see `useButton`), so without an explicit `type="submit"` the form never
 * submits — that was why Sign out silently did nothing.
 */
export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        aria-label="Sign out"
        className={cn("h-8 gap-1.5 px-2.5 text-[0.8rem]", className)}
      >
        <LogOut className="size-3.5" />
        <span className="hidden sm:inline">Sign out</span>
      </Button>
    </form>
  );
}
