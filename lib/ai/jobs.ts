import "server-only";

import { runCourseGeneration } from "@/lib/ai/generate";

const globalForJobs = globalThis as unknown as {
  __freedemyJobs?: Map<string, Promise<void>>;
};

const jobs = globalForJobs.__freedemyJobs ?? new Map<string, Promise<void>>();
globalForJobs.__freedemyJobs = jobs;

/**
 * Starts a course build in the background and returns immediately. The course
 * row is the source of truth for progress, so a restart mid-build shows up as a
 * stale status the dashboard can retry.
 */
export function startCourseJob(params: {
  courseId: string;
  userId: string;
  videoId: string;
}): void {
  if (jobs.has(params.courseId)) return;

  const job = runCourseGeneration(params)
    .catch((error) => {
      console.error(`[generation] unhandled failure for ${params.courseId}`, error);
    })
    .finally(() => {
      jobs.delete(params.courseId);
    });

  jobs.set(params.courseId, job);
}

export function isCourseJobRunning(courseId: string): boolean {
  return jobs.has(courseId);
}
