"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { deleteCourseAction } from "@/lib/actions/courses";
import { cn } from "@/lib/utils";

const ARM_MS = 8000;

/**
 * Two-step delete: first press arms the button, a second press within 8s
 * runs the server action (which is owner-scoped and cascades to lessons,
 * exercises and progress).
 */
export function CourseDeleteButton({
  courseId,
  title,
  className,
}: {
  courseId?: string;
  title: string;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!courseId) return null;

  function handleDelete() {
    if (!armed) {
      setArmed(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setArmed(false), ARM_MS);
      return;
    }

    if (timer.current) clearTimeout(timer.current);
    startTransition(async () => {
      const result = await deleteCourseAction(courseId as string);
      if (result.ok) {
        setArmed(false);
        toast.success(`Deleted “${title}”`);
      } else {
        setArmed(false);
        toast.error(result.error ?? "Couldn’t delete that course. Try again.");
      }
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={pending}
      aria-label={armed ? `Confirm deleting ${title}` : `Delete ${title}`}
      className={cn(
        "h-8 w-full gap-1.5 text-[0.75rem]",
        armed
          ? "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
          : "text-muted-foreground hover:text-destructive",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" />
      )}
      {pending ? "Deleting…" : armed ? "Click again to confirm" : "Delete"}
    </Button>
  );
}
