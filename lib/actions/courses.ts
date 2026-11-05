"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CourseFormState } from "@/lib/actions/types";
import { startCourseJob } from "@/lib/ai/jobs";
import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const YOUTUBE_URL =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

function parseVideoId(value: string): string | null {
  return value.trim().match(YOUTUBE_URL)?.[1] ?? null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createCourseAction(
  _state: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await requireUser("/#paste");
  const rawUrl = field(formData, "url");
  const videoId = parseVideoId(rawUrl);

  if (!videoId) {
    return {
      error:
        "That isn't a YouTube video link. Paste one like youtube.com/watch?v=… or youtu.be/…",
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingError } = await supabase
    .from("courses")
    .select("id,slug,status")
    .eq("user_id", user.id)
    .eq("video_id", videoId)
    .maybeSingle();

  if (existingError) {
    return { error: existingError.message };
  }

  if (existing) {
    if (existing.status === "ready") {
      redirect(`/course/${existing.slug}`);
    }
    if (existing.status !== "failed") {
      redirect(`/generating?course=${existing.id}`);
    }

    const { error: restartError } = await supabase
      .from("courses")
      .update({ status: "queued", stage: "Queued", error: null })
      .eq("id", existing.id);

    if (restartError) return { error: restartError.message };

    startCourseJob({ courseId: existing.id, userId: user.id, videoId });
    redirect(`/generating?course=${existing.id}`);
  }

  const { data: created, error } = await supabase
    .from("courses")
    .insert({
      user_id: user.id,
      slug: videoId,
      title: "Preparing your course…",
      source_url: rawUrl,
      video_id: videoId,
      status: "queued",
      stage: "Queued",
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Could not create the course." };
  }

  startCourseJob({ courseId: created.id as string, userId: user.id, videoId });

  revalidatePath("/dashboard");
  redirect(`/generating?course=${created.id}`);
}

export async function retryCourseAction(courseId: string): Promise<void> {
  const user = await requireUser("/dashboard");
  const supabase = await createSupabaseServerClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id,video_id")
    .eq("id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect("/dashboard");
  }

  await supabase
    .from("courses")
    .update({ status: "queued", stage: "Queued", error: null })
    .eq("id", course.id);

  startCourseJob({ courseId: course.id as string, userId: user.id, videoId: course.video_id as string });
  revalidatePath("/dashboard");
  redirect(`/generating?course=${course.id}`);
}

export async function deleteCourseAction(
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("courses")
    .delete()
    .eq("id", courseId)
    .eq("user_id", user.id);

  if (error) {
    return { ok: false, error: "Couldn’t delete that course. Try again." };
  }

  revalidatePath("/dashboard");
  return { ok: true };
}
