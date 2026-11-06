import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { TutorChat } from "@/components/tutor/tutor-chat";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireUser } from "@/lib/auth";
import { getCourseBundle } from "@/lib/db/courses";
import { courseLessons } from "@/lib/course";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { TutorMessage } from "@/lib/actions/types";

export const metadata: Metadata = { title: "Assignment tutor" };
export const instant = false;

export default async function TutorPage({
  params,
  searchParams,
}: PageProps<"/course/[slug]/tutor">) {
  await connection();
  const { slug } = await params;
  const query = await searchParams;
  const user = await requireUser(`/course/${slug}/tutor`);
  const supabase = await createSupabaseServerClient();

  const bundle = await getCourseBundle(supabase, user.id, slug);
  if (!bundle) notFound();

  const lessons = courseLessons(bundle.course);
  if (bundle.course.status !== "ready" && lessons.length === 0) {
    redirect(`/generating?course=${bundle.course.id ?? ""}`);
  }

  const requested = typeof query.lesson === "string" ? query.lesson : "";
  const lesson = lessons.find((item) => item.id === requested) ?? lessons[0];

  if (!lesson) notFound();

  // Newest 60, reversed below: a long session must show its latest turns,
  // not the first 60 it ever had.
  const { data } = await supabase
    .from("tutor_messages")
    .select("id,role,content,at_seconds,created_at")
    .eq("user_id", user.id)
    .eq("lesson_id", lesson.id)
    .order("created_at", { ascending: false })
    .limit(60);

  const messages: TutorMessage[] = ((data ?? []) as {
    id: string;
    role: "user" | "assistant";
    content: string;
    at_seconds: number | null;
    created_at: string;
  }[])
    .slice()
    .reverse()
    .map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      at: message.at_seconds,
      createdAt: message.created_at,
    }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-8">
          <Brand className="min-w-0 shrink-0" />
          <div className="flex items-center gap-2">
            <SignOutButton className="h-8 px-2.5 text-[0.8rem]" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-8">
        <TutorChat
          courseSlug={slug}
          courseTitle={bundle.course.title}
          lessonId={lesson.id}
          lessonTitle={lesson.title}
          lessonSummary={lesson.summary}
          keyTerms={lesson.keyTerms}
          initialMessages={messages}
        />
      </main>
    </div>
  );
}
