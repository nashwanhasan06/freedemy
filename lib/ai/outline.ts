/**
 * The outline's hard geometry rules, as a pure module (no I/O) so the rules
 * can be table-tested directly.
 *
 * The hard rule: every section watches for 5–20 minutes. It is enforced by
 * construction here — `validateOutline`, `outlineFromTopics` and the resume
 * path all funnel through `normaliseOutline`, and `assertCompleteCoverage`
 * re-checks the persisted rows before `ready`.
 */

export type OutlineLesson = { title: string; summary: string; start: number; end: number };
export type OutlineModule = {
  title: string;
  summary: string;
  start: number;
  end: number;
  lessons: OutlineLesson[];
};
export type Outline = { level: string; modules: OutlineModule[] };

/** Hard floor of a section's watch time. A video shorter than this is the rule's only exception. */
export const LESSON_MIN_SECONDS = 5 * 60;
/** Hard ceiling of a section's watch time. */
export const LESSON_MAX_SECONDS = 20 * 60;
/** Every module carries at least this many lessons when its span can fit them. */
export const MIN_LESSONS_PER_MODULE = 4;
/** Defensive ceiling per module so one module cannot swallow the whole course. */
export const MAX_LESSONS_PER_MODULE = 40;
/** A non-tail module must be long enough for MIN_LESSONS_PER_MODULE × LESSON_MIN_SECONDS. */
export const MODULE_MIN_SECONDS = MIN_LESSONS_PER_MODULE * LESSON_MIN_SECONDS;

/** Title/summary caps, matching what `validateOutline` accepts from the model. */
const TITLE_CAP = 140;
const SUMMARY_CAP = 500;

/**
 * How far the last lesson may stop short of the end of the video before the
 * outline counts as incomplete. A 3.5 hour lecture gets ~6 minutes of slack.
 */
export function coverageSlack(duration: number): number {
  return Math.max(180, Math.round(duration * 0.02));
}

function clip(text: string, cap: number): string {
  if (text.length <= cap) return text;
  return `${text.slice(0, Math.max(0, cap - 1)).trimEnd()}…`;
}

/**
 * Deterministic merge of two titles: "A / B", capped — the model is never
 * re-asked to retitle a section the normaliser merged.
 */
function concatTitles(first: string, second: string): string {
  if (!first) return clip(second, TITLE_CAP);
  if (!second) return clip(first, TITLE_CAP);
  const joined = `${first} / ${second}`;
  if (joined.length <= TITLE_CAP) return joined;
  const room = TITLE_CAP - second.length - 3;
  return room >= 16 ? `${clip(first, room)} / ${second}` : clip(second, TITLE_CAP);
}

function joinSummaries(parts: string[]): string {
  const joined = parts.filter(Boolean).join(" ");
  return joined.length <= SUMMARY_CAP ? joined : clip(joined, SUMMARY_CAP);
}

function mergeModules(first: OutlineModule, second: OutlineModule): OutlineModule {
  return {
    title: concatTitles(first.title, second.title),
    summary: joinSummaries([first.summary, second.summary]),
    start: first.start,
    end: second.end,
    lessons: [...first.lessons, ...second.lessons],
  };
}

/**
 * Splits a module's span into sections that each run 5–20 minutes and tile
 * the module exactly. The model's own lesson boundaries are kept wherever
 * they fit inside that window; the rest falls back to an even split.
 *
 * The bounds are guarantees, not hopes:
 * - count ≤ span/MIN ⇒ every section is ≥ 5 minutes;
 * - count ≥ ceil(span/MAX) ⇒ every section is ≤ 20 minutes;
 * - each cut is taken inside a window (see `lower`/`upper`) that keeps the
 *   remaining sections feasible, so a snapped model boundary can never push
 *   a section out of range.
 */
function tileLessons(lessons: OutlineLesson[], start: number, end: number): OutlineLesson[] {
  const span = end - start;
  if (lessons.length === 0 || span < LESSON_MIN_SECONDS) return [];

  const minCount = Math.ceil(span / LESSON_MAX_SECONDS);
  const maxCount = Math.floor(span / LESSON_MIN_SECONDS);
  const wanted = Math.max(lessons.length, Math.min(MIN_LESSONS_PER_MODULE, maxCount));
  const count = Math.max(minCount, Math.min(maxCount, wanted));

  // Candidate cuts: where the model itself put lesson edges.
  const candidates: number[] = [];
  for (const lesson of lessons) {
    for (const edge of [lesson.start, lesson.end]) {
      const at = Math.round(edge);
      if (at > start && at < end) candidates.push(at);
    }
  }
  candidates.sort((a, b) => a - b);

  const bounds = [start];
  let previous = start;
  for (let index = 1; index < count; index += 1) {
    // Window where this cut keeps every remaining section inside [MIN, MAX].
    const lower = Math.max(previous + LESSON_MIN_SECONDS, end - (count - index) * LESSON_MAX_SECONDS);
    const upper = Math.min(previous + LESSON_MAX_SECONDS, end - (count - index) * LESSON_MIN_SECONDS);
    const ideal = Math.round(start + (span * index) / count);

    let at = Math.min(Math.max(ideal, lower), upper);
    for (const candidate of candidates) {
      if (candidate < lower) continue;
      if (candidate > upper) break;
      if (Math.abs(candidate - ideal) < Math.abs(at - ideal)) at = candidate;
    }
    bounds.push(at);
    previous = at;
  }
  bounds.push(end);

  // Titles come from the model lessons that actually overlap each slice —
  // slivers merge into one concatenated title; a lesson split across slices
  // gets a deterministic "(2)"/"(3)" suffix on the repeats.
  const seen = new Map<number, number>();
  return bounds.slice(0, -1).map((from, index) => {
    const to = bounds[index + 1];
    let picks = lessons
      .map((lesson, lessonIndex) => ({ lesson, lessonIndex }))
      .filter(({ lesson }) => lesson.start < to && lesson.end > from);

    if (picks.length === 0) {
      const middle = (from + to) / 2;
      let best = 0;
      let bestDistance = Infinity;
      lessons.forEach((lesson, lessonIndex) => {
        const distance = Math.abs((lesson.start + lesson.end) / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = lessonIndex;
        }
      });
      picks = [{ lesson: lessons[best], lessonIndex: best }];
    }

    let title = "";
    for (const { lesson } of picks) {
      if (!lesson.title) continue;
      title = title ? concatTitles(title, lesson.title) : clip(lesson.title, TITLE_CAP);
    }
    const key = picks[0].lessonIndex;
    const repeat = seen.get(key) ?? 0;
    seen.set(key, repeat + 1);
    if (repeat > 0) title = clip(`${title} (${repeat + 1})`, TITLE_CAP);

    return {
      title,
      summary: joinSummaries(picks.map((pick) => pick.lesson.summary)),
      start: from,
      end: to,
    };
  });
}

/**
 * Lays the outline over one continuous timeline: modules start where the
 * previous one ended, lessons cover their module with no gaps and no overlaps,
 * and every section lands in the hard 5–20 minute window.
 *
 * The final module is stretched over a tail gap no larger than coverageSlack —
 * anything bigger means the outline stopped early and is rejected upstream,
 * so stretching never hides a real gap.
 */
export function normaliseOutline(modules: OutlineModule[], duration: number): OutlineModule[] {
  const limit = duration > 0 ? duration : (modules.at(-1)?.end ?? 0);
  if (limit <= 0 || modules.length === 0) return [];

  // The rule's only exception: a video shorter than five minutes cannot hold
  // a five-minute section, so the whole run becomes a single section.
  if (limit < LESSON_MIN_SECONDS) {
    const first = modules[0];
    const source = first.lessons[0];
    return [
      {
        ...first,
        start: 0,
        end: limit,
        lessons: [
          {
            title: source?.title ?? first.title,
            summary: source?.summary ?? first.summary,
            start: 0,
            end: limit,
          },
        ],
      },
    ];
  }

  // Phase 1 — contiguous module ranges, each at least one section long. A
  // range too short even for one section folds into the previous module, and
  // a module whose model produced no lessons is skipped (the next module's
  // range then absorbs its time, as before).
  const groups: OutlineModule[] = [];
  let cursor = 0;
  for (const entry of modules) {
    if (cursor >= limit) break;
    if (entry.lessons.length === 0) continue;

    const start = cursor;
    const end = Math.min(Math.max(entry.end, entry.start, start + LESSON_MIN_SECONDS), limit);
    if (end - start < LESSON_MIN_SECONDS) {
      const previous = groups.at(-1);
      if (previous) {
        previous.end = end;
        previous.lessons.push(...entry.lessons);
      }
      cursor = end;
      continue;
    }

    groups.push({ title: entry.title, summary: entry.summary, start, end, lessons: [...entry.lessons] });
    cursor = end;
  }

  // Phase 2 — a module too thin to carry four five-minute sections joins its
  // neighbour (a thin first module pulls the next one in). Only the final
  // module is exempt: the tail may be shorter than the floor.
  for (;;) {
    const thin = groups.findIndex((group, index) => {
      if (index === groups.length - 1) return false;
      return group.end - group.start < MODULE_MIN_SECONDS;
    });
    if (thin < 0) break;

    if (thin === 0) {
      groups[0] = mergeModules(groups[0], groups[1]);
      groups.splice(1, 1);
    } else {
      groups[thin - 1] = mergeModules(groups[thin - 1], groups[thin]);
      groups.splice(thin, 1);
    }
  }

  // Phase 3 — tile every module's sections inside the hard window.
  const result: OutlineModule[] = [];
  for (const group of groups) {
    const lessons = tileLessons(group.lessons, group.start, group.end);
    if (lessons.length === 0) continue;
    result.push({ title: group.title, summary: group.summary, start: group.start, end: group.end, lessons });
  }

  // Phase 4 — stretch the final module over a small trailing gap and re-tile.
  const last = result.at(-1);
  if (last && last.end < limit && limit - last.end <= coverageSlack(limit)) {
    const lessons = tileLessons(last.lessons, last.start, limit);
    if (lessons.length > 0) result[result.length - 1] = { ...last, end: limit, lessons };
  }

  return result;
}
