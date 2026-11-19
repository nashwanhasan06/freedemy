"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { CourseFormState } from "@/lib/actions/types";
import { startCourseJob } from "@/lib/ai/jobs";
import { loadPlaylist, PlaylistError, type Playlist } from "@/lib/ai/playlist";
import { requireUser } from "@/lib/auth";
import type { DbClient } from "@/lib/storage";
import { userDb } from "@/lib/storage/server";

const YOUTUBE_URL =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** A list= parameter means the user wants the whole playlist, not one video. */
const PLAYLIST_URL = /[?&]list=([A-Za-z0-9_-]{6,})/;

function parseVideoId(value: string): string | null {
  return value.trim().match(YOUTUBE_URL)?.[1] ?? null;
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Playlist videos are the build's work queue. Missing rows mean a restart. */
async function ensureCourseVideos(
  db: DbClient,
  courseId: string,
  playlist: Playlist,
): Promise<string | null> {
  const rows = playlist.entries.map((entry, index) => ({
    course_id: courseId,
    position: index,
    video_id: entry.videoId,
    title: entry.title,
    duration_seconds: entry.durationSeconds,
  }));

  const { error } = await db
    .from("course_videos")
    .upsert(rows, { onConflict: "course_id,video_id", ignoreDuplicates: true });
  return error?.message ?? null;
}

export async function createCourseAction(
  _state: CourseFormState,
  formData: FormData,
): Promise<CourseFormState> {
  const user = await requireUser("/#paste");
  const rawUrl = field(formData, "url");

  // list= wins over v=: pasting watch?v=…&list=… means the whole playlist.
  const playlistId = rawUrl.match(PLAYLIST_URL)?.[1] ?? null;
  const videoId = playlistId ? null : parseVideoId(rawUrl);

  if (!playlistId && !videoId) {
    return {
      error:
        "That isn't a YouTube video link. Paste one like youtube.com/watch?v=… or youtu.be/… (a playlist link works too).",
    };
  }

  // Read the playlist before creating anything, so a bad or oversized playlist
  // never leaves a course row behind.
  let playlist: Playlist | null = null;
  if (playlistId) {
    try {
      playlist = await loadPlaylist(playlistId);
    } catch (error) {
      return {
        error:
          error instanceof PlaylistError
            ? error.message
            : "Could not read that playlist. Check the link and try again.",
      };
    }
  }

  const sourceId = playlistId ?? (videoId as string);
  const db = await userDb();

  const { data: existing, error: existingError } = await db
    .from("courses")
    .select("id,slug,status")
    .eq("user_id", user.id)
    .eq("video_id", sourceId)
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

    const { error: restartError } = await db
      .from("courses")
      .update({ status: "queued", stage: "Queued", error: null })
      .eq("id", existing.id);

    if (restartError) return { error: restartError.message };

    if (playlist) {
      const videosError = await ensureCourseVideos(db, existing.id, playlist);
      if (videosError) return { error: videosError };
    }

    startCourseJob({ courseId: existing.id, userId: user.id, videoId: sourceId });
    redirect(`/generating?course=${existing.id}`);
  }

  const { data: created, error } = await db
    .from("courses")
    .insert({
      user_id: user.id,
      slug: sourceId,
      title: playlist ? playlist.title : "Preparing your course…",
      source_url: rawUrl,
      video_id: sourceId,
      status: "queued",
      stage: "Queued",
    })
    .select("id")
    .single();

  if (error || !created) {
    return { error: error?.message ?? "Could not create the course." };
  }

  const courseId = created.id as string;
  if (playlist) {
    const videosError = await ensureCourseVideos(db, courseId, playlist);
    if (videosError) return { error: videosError };
  }

  startCourseJob({ courseId, userId: user.id, videoId: sourceId });

  revalidatePath("/dashboard");
  redirect(`/generating?course=${courseId}`);
}

export async function retryCourseAction(courseId: string): Promise<void> {
  const user = await requireUser("/dashboard");
  const db = await userDb();

  const { data: course } = await db
    .from("courses")
    .select("id,video_id")
    .eq("id", courseId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!course) {
    redirect("/dashboard");
  }

  await db
    .from("courses")
    .update({ status: "queued", stage: "Queued", error: null })
    .eq("id", course.id);

  // Playlist courses: give every failed video a fresh set of tries (the
  // single-video path has no rows here, so this is a no-op for it).
  await db
    .from("course_videos")
    .update({ status: "queued", attempts: 0, error: null })
    .eq("course_id", course.id)
    .eq("status", "failed");

  startCourseJob({ courseId: course.id as string, userId: user.id, videoId: course.video_id as string });
  revalidatePath("/dashboard");
  redirect(`/generating?course=${course.id}`);
}

export async function deleteCourseAction(
  courseId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser("/dashboard");
  const db = await userDb();

  const { error } = await db
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
