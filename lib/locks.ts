/**
 * Study-mode rules: video-game sequential locking when rigorous mode is on.
 *
 * A section unlocks when the previous section's assignment passed (>= 70%).
 * A chapter's end exam unlocks once every section of that chapter passed, and
 * only a cleared exam (>= 80%) opens the next chapter. The exam itself is
 * always available — with rigorous mode off nothing is locked, so it can be
 * taken any time and only records a score; the gates apply when it is on.
 * Pure functions over the course outline and the student's saved grades — no
 * I/O, so the same rules run in the sidebar, the player's Next button and the
 * server actions that guard the exam.
 */

export const SECTION_PASS = 70;
export const CHAPTER_EXAM_PASS = 80;

/** Structural subset of Course the rules need (Course satisfies it). */
export type LockCourse = {
  chapters: { id: string; lessons: { id: string }[] }[];
};

/** Structural subset of GradeMap (GradeMap satisfies it). */
export type LockGrades = Record<string, { score: number }>;

/** Structural subset of the per-course quiz progress map. */
export type LockQuizzes = Record<string, { bestScore: number }>;

/**
 * "locked" only happens in rigorous mode (chapter incomplete or sealed);
 * otherwise the exam is always "available" or already "passed".
 */
export type ExamState = "locked" | "available" | "passed";

export type Locks = {
  rigorous: boolean;
  /** Whether the section's assignment has passed. */
  sectionPassed: (lessonId: string) => boolean;
  /** Whether the chapter itself is open (its predecessor's exam cleared). */
  chapterUnlocked: (chapterIndex: number) => boolean;
  /** Whether the student may open the section right now. */
  lessonUnlocked: (lessonId: string) => boolean;
  /** Every section of the chapter passed, so its end exam may be taken. */
  chapterComplete: (chapterIndex: number) => boolean;
  examState: (chapterIndex: number) => ExamState;
};

export function computeLocks(
  course: LockCourse,
  grades: LockGrades,
  quizzes: LockQuizzes,
  rigorous: boolean,
): Locks {
  const chapters = course.chapters;

  // lessonId -> { chapterIndex, positionInChapter }
  const locate = new Map<string, { chapterIndex: number; position: number }>();
  chapters.forEach((chapter, chapterIndex) => {
    chapter.lessons.forEach((lesson, position) => {
      locate.set(lesson.id, { chapterIndex, position });
    });
  });

  const sectionPassed = (lessonId: string): boolean =>
    (grades[lessonId]?.score ?? 0) >= SECTION_PASS;

  const chapterUnlocked = (chapterIndex: number): boolean => {
    if (!rigorous || chapterIndex <= 0) return true;
    const previous = chapters[chapterIndex - 1];
    if (!previous) return true;
    return (quizzes[previous.id]?.bestScore ?? 0) >= CHAPTER_EXAM_PASS;
  };

  const lessonUnlocked = (lessonId: string): boolean => {
    if (!rigorous) return true;
    const at = locate.get(lessonId);
    if (!at) return true;
    if (!chapterUnlocked(at.chapterIndex)) return false;
    const siblings = chapters[at.chapterIndex].lessons;
    // Every section before this one must have passed: levels open in order.
    return siblings.slice(0, at.position).every((lesson) => sectionPassed(lesson.id));
  };

  const chapterComplete = (chapterIndex: number): boolean => {
    const chapter = chapters[chapterIndex];
    if (!chapter) return false;
    return chapter.lessons.length > 0 && chapter.lessons.every((lesson) => sectionPassed(lesson.id));
  };

  const examState = (chapterIndex: number): ExamState => {
    const chapter = chapters[chapterIndex];
    if (!chapter) return "locked";
    // Only rigorous mode locks the exam; off, it is open whenever asked for.
    if (rigorous && (!chapterUnlocked(chapterIndex) || !chapterComplete(chapterIndex))) {
      return "locked";
    }
    return (quizzes[chapter.id]?.bestScore ?? 0) >= CHAPTER_EXAM_PASS
      ? "passed"
      : "available";
  };

  return { rigorous, sectionPassed, chapterUnlocked, lessonUnlocked, chapterComplete, examState };
}
