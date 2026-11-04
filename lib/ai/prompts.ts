import type { Lecture } from "@/lib/ai/transcript";
import { noteBody, type KeyTerm, type Lesson, type NoteBlock } from "@/lib/types";
import { formatClock } from "@/lib/format";

export const LANGUAGE_HINTS: { id: string; label: string; patterns: RegExp }[] = [
  { id: "python", label: "Python", patterns: /\bpython\b|\bpandas\b|\bnumpy\b|\bdjango\b|\bflask\b/i },
  { id: "javascript", label: "JavaScript", patterns: /\bjavascript\b|\bnode\.?js\b|\breact\b|\btypescript\b|\bexpress\b/i },
  { id: "typescript", label: "TypeScript", patterns: /\btypescript\b/i },
  { id: "java", label: "Java", patterns: /\bjava\b(?!script)|\bspring boot\b/i },
  { id: "csharp", label: "C#", patterns: /\bc#\b|\bcsharp\b|\b\.net\b|\bunity\b/i },
  { id: "cpp", label: "C++", patterns: /\bc\+\+\b|\bcpp\b|\bstl\b/i },
  { id: "go", label: "Go", patterns: /\bgolang\b|\bgo language\b/i },
  { id: "rust", label: "Rust", patterns: /\brust\b|\bcargo\b/i },
  { id: "sql", label: "SQL", patterns: /\bsql\b|\bpostgres\b|\bmysql\b|\bdatabase quer/i },
  { id: "html", label: "HTML/CSS", patterns: /\bhtml\b|\bcss\b|\btailwind\b/i },
];

/** Picks the language the lecture is really about, defaulting to Python. */
export function detectLanguage(lecture: Pick<Lecture, "title" | "description" | "cues">): string {
  const opening = `${lecture.title} ${lecture.description} ${lecture.cues
    .slice(0, 40)
    .map((cue) => cue.text)
    .join(" ")}`;

  let best = { id: "python", score: 0 };
  for (const language of LANGUAGE_HINTS) {
    const matches = opening.match(new RegExp(language.patterns.source, "gi"));
    const score = matches?.length ?? 0;
    if (score > best.score) best = { id: language.id, score };
  }
  return best.id;
}

export const JSON_RULES = `Rules:
- Return a single JSON object and nothing else. No markdown fences, no commentary.
- Every number of seconds is an absolute offset from the start of the video, as an integer.
- Never invent facts that are not in the transcript or description. If a detail is missing, stay general.
- All prose is written for a student who is learning to code. Be concrete and specific.`;

export function mapSystem(): string {
  return `You segment coding lectures into topic windows.
You receive one timecoded window of a YouTube transcript and return the topics it covers.
${JSON_RULES}
Shape: {"segments":[{"title":string,"start":number,"end":number,"points":string[]}]}
- 2 to 5 segments per window, ordered, non-overlapping, inside the window.
- "points" holds 2 to 4 short factual bullets, each naming something the speaker actually explains.`;
}

export function mapUser(params: {
  title: string;
  language: string;
  windowStart: number;
  windowEnd: number;
  transcript: string;
}): string {
  return `Lecture: ${params.title}
Primary language: ${params.language}
Window: ${formatClock(params.windowStart)} to ${formatClock(params.windowEnd)}

Transcript:
${params.transcript}`;
}

export function outlineSystem(): string {
  return `You are the curriculum architect for Freedemy, a coding-education platform.
You receive a list of timestamped topics extracted from one YouTube lecture and turn them into a course structure.
${JSON_RULES}
Shape: {"level":"Beginner"|"Intermediate"|"Advanced","modules":[{"title":string,"summary":string,"start":number,"end":number,"lessons":[{"title":string,"summary":string,"start":number,"end":number}]}]}
Rules for the structure:
- 3 to 8 modules, each with 2 to 4 lessons. Lessons are 4 to 20 minutes of video.
- The outline must cover the WHOLE video: the first module starts at second 0, the last module ends at the "Length" given in the prompt, and every module ends where the next one begins.
- A long lecture needs more modules, not fewer. Spread the timestamped topics across the full runtime instead of describing only the opening.
- If the description lists chapters, use them as the spine: every chapter belongs to a module.
- Module and lesson ranges must tile the video in order and must not overlap.
- A module title describes a skill ("Functions and scope"), not a timestamp.
- Keep the module count low enough that the course is finishable; merge thin topics.
- Lessons must line up with where the content actually appears in the timestamped topics.`;
}

export function outlineUser(params: {
  title: string;
  channel: string;
  language: string;
  duration: number;
  description: string;
  topics: { title: string; start: number; end: number; points: string[] }[];
}): string {
  return `Lecture: ${params.title}
Channel: ${params.channel}
Length: ${formatClock(params.duration)}
Language: ${params.language}

Description:
${params.description || "(no description)"}

Timestamped topics:
${params.topics
  .map(
    (topic) =>
      `- ${formatClock(topic.start)}–${formatClock(topic.end)} · ${topic.title}: ${topic.points.join("; ")}`,
  )
  .join("\n")}

Build the course over the full ${formatClock(params.duration)}. The last module must end at ${params.duration} seconds, not where the topics happen to stop.`;
}

/**
 * The assessment planner runs before any material is written. It decides how
 * each section should be tested, so every module gets the checks its content
 * actually needs instead of the same two-MCQ-one-code-one-answer template.
 */
export function planSystem(): string {
  return `You are the assessment designer for Freedemy, a coding-education platform.
You receive one module of a course built from a YouTube lecture: the module summary, the lessons in it and the timestamped topics each lesson covers.
Your job is to decide how each lesson should be tested. Another model writes the material from your plan, so a plan has to name the testing move and the exact idea, never just "a question about the lesson".
${JSON_RULES}
Shape: {"lessons":[{"title":string,"checks":[{"kind":"mcq"|"short"|"code","form":string,"focus":string}]}]}
How to plan:
- Start from what the material lets a student DO, then pick the check that would prove it: recall a definition, spot a wrong mental model, predict the output of a snippet, trace a process step by step, find the bug in broken code, write a small implementation, compare two designs, justify a trade-off, apply the idea to a new case.
- Two to four checks per lesson. Hard limits: at most 3 "mcq", at most 1 "short", at most 2 "code".
- Do not force one template across the module. A conceptual lesson (what a token is, how pretraining works, why a model hallucinates) is tested with mcq and short checks and no code at all. A hands-on lesson about writing or fixing code gets at least one code check. A lesson that walks through working code should include "predict the output" or "find the bug".
- Vary within the module: if one lesson uses "find the bug", another should test the same idea a different way, for example "explain the trade-off".
- "form" is the instruction the student will see ("predict the output", "find the bug in this loop", "trace the merge step", "explain why 256 bytes").
- "focus" is one line naming the single idea that check targets, in the speaker's own vocabulary, so the writer knows exactly what to build.
- Match the difficulty to where the lesson sits in the course: early checks test recognition, later checks test transfer.
- Return one entry per lesson given, in the same order and with the same titles.`;
}

export function planUser(params: {
  courseTitle: string;
  language: string;
  moduleTitle: string;
  moduleSummary: string;
  moduleStart: number;
  moduleEnd: number;
  lessons: { title: string; summary: string; start: number; end: number }[];
  topics: { title: string; start: number; end: number; points: string[] }[];
}): string {
  return `Course: ${params.courseTitle}
Language: ${params.language}
Module: ${params.moduleTitle} (${formatClock(params.moduleStart)}–${formatClock(params.moduleEnd)})
Module summary: ${params.moduleSummary}

What the speaker covers in this module:
${params.topics
  .map(
    (topic) => `- ${formatClock(topic.start)}–${formatClock(topic.end)} · ${topic.title}: ${topic.points.join("; ")}`,
  )
  .join("\n") || "(use the lesson summaries)"}

Lessons to plan, in order:
${params.lessons
  .map(
    (lesson, index) =>
      `${index + 1}. ${lesson.title} · ${formatClock(lesson.start)}–${formatClock(lesson.end)} · ${lesson.summary}`,
  )
  .join("\n")}

Plan the checks for each lesson.`;
}

export function lessonSystem(): string {
  return `You write one section of a coding course built from a YouTube lecture.
You receive the course, the module, the single lesson to write, the assignment plan for that lesson and the transcript of that lesson's slice.
${JSON_RULES}
Shape:
{"title":string,"summary":string,
 "keyTerms":[{"term":string,"definition":string}],
 "notes":[{"heading":string,"body":string}],
 "questions":[{"prompt":string,"options":string[],"answer":number,"misconception":string,"explanation":string,"at":number}],
 "shortAnswer":{"prompt":string,"keywords":string[],"model":string,"misconception":string,"explanation":string,"at":number}|null,
 "codeExercises":[{"prompt":string,"language":string,"starterCode":string,"hint":string,"solution":string,"explanation":string,"at":number}]}

Notes are the study material, so they carry most of the value:
- 3 or 4 blocks. Each block has a short heading and 120 to 220 words of flowing Markdown prose: paragraphs, lists, tables, worked examples, fenced code. Never a bare bullet dump, never "in this section we will".
- Build the idea the way the speaker builds it: the problem, the mechanism, a worked example with the speaker's own numbers, then the edge case or limitation.
- Use a fenced \`\`\`mermaid diagram whenever the lesson describes a process, pipeline, data flow, architecture, or a before/after comparison. Keep it valid mermaid (flowchart TD or LR, or sequenceDiagram): at most 12 nodes, short labels in square brackets, no parentheses or quotes inside labels, no styling directives, no HTML.
- Include one fenced code snippet in the lecture's language when the speaker shows code, an API call or a shape of data.
- Use a Markdown table when three or more things are being compared.
- **Bold** each term a student has to remember, and explain it in the same sentence the first time it appears.

Assessment rules:
- Follow the plan exactly: one exercise per planned check, in the planned order, using the planned form and focus. mcq go in "questions", the short check in "shortAnswer", code checks in "codeExercises".
- If the plan has no short check, "shortAnswer" is null. If it has no code check, "codeExercises" is [].
- mcq: four plausible options, exactly one correct "answer" index, a "misconception" naming the belief behind the most likely wrong pick, an "explanation" for after they answer.
- short: 3 to 5 keywords any good answer would contain, and a model answer of 2 to 4 sentences.
- code: a runnable "starterCode" stub with a TODO, a complete correct "solution", a one-sentence "hint" and an "explanation" of what it teaches. Under 20 lines, directly from this lesson.
- "at" is the second inside the lesson's range where that idea is covered.
- keyTerms: 3 to 6 terms with a one-sentence definition each. summary: 2 sentences on what this section teaches.`;
}

export function lessonUser(params: {
  courseTitle: string;
  language: string;
  moduleTitle: string;
  moduleSummary: string;
  lessonTitle: string;
  lessonSummary: string;
  lessonStart: number;
  lessonEnd: number;
  plan: { kind: string; form: string; focus: string }[];
  transcript: string;
}): string {
  return `Course: ${params.courseTitle}
Language: ${params.language}
Module: ${params.moduleTitle} — ${params.moduleSummary}
Section to write: ${params.lessonTitle} (${formatClock(params.lessonStart)}–${formatClock(params.lessonEnd)})
Outline note for this section: ${params.lessonSummary || "(none)"}

Assignment plan for this section:
${params.plan
  .map((check) => `- ${check.kind} · ${check.form} · ${check.focus}`)
  .join("\n")}

Transcript for this section:
${params.transcript}`;
}

export function gradeSystem(): string {
  return `You review a coding student's submitted answers. You are strict but fair.
${JSON_RULES}
Shape: {"results":[{"exerciseId":string,"correct":boolean,"score":number,"feedback":string,"errors":[{"severity":"error"|"warning"|"tip","message":string,"line":number,"code":string}]}],"summary":string}
Grading rules:
- Judge the code against the exercise brief, not against your own preferred style.
- A solution that works but is inefficient gets "correct": true with a "tip".
- When the exercise asks the student to predict an output, find a bug or trace a step, judge that specific ask rather than whether the code is generally good.
- Syntax errors, wrong output, missing requirements, unsafe input handling or off-by-one bugs are "error" rows that name the line and quote the offending code.
- "score" is an integer from 0 to the exercise's max points. Partial credit is allowed for code that mostly works.
- "feedback" is 1 to 3 sentences addressed to the student: what is wrong, why, and the next step. Never dump the full solution.
- For short answers, accept any answer that shows the key idea even if the wording differs.
- If the submission is empty, mark it incorrect and say so.`;
}

export function gradeUser(params: {
  lessonTitle: string;
  lessonSummary: string;
  language: string;
  exercises: {
    id: string;
    kind: "mcq" | "short" | "code";
    prompt: string;
    points: number;
    options?: string[];
    answerIndex?: number;
    keywords?: string[];
    solution?: string;
    submitted: string;
  }[];
}): string {
  return `Lesson: ${params.lessonTitle}
Lesson summary: ${params.lessonSummary}
Course language: ${params.language}

Exercises and the student's submissions:
${params.exercises
  .map((exercise) => {
    if (exercise.kind === "mcq") {
      return `--- exerciseId: ${exercise.id} (multiple choice, max ${exercise.points})
Question: ${exercise.prompt}
Options: ${(exercise.options ?? []).map((option, index) => `${index}: ${option}`).join(" | ")}
Correct option: ${exercise.answerIndex}
Student picked: ${exercise.submitted}`;
    }
    if (exercise.kind === "short") {
      return `--- exerciseId: ${exercise.id} (short answer, max ${exercise.points})
Question: ${exercise.prompt}
Reference keywords: ${(exercise.keywords ?? []).join(", ")}
Model answer: ${exercise.solution ?? "(none)"}
Student answer: ${exercise.submitted || "(empty)"}`;
    }
    return `--- exerciseId: ${exercise.id} (code, max ${exercise.points})
Task: ${exercise.prompt}
Reference solution:
${exercise.solution ?? "(none)"}
Student code:
${exercise.submitted || "(empty)"}`;
  })
  .join("\n\n")}`;
}

/**
 * The capstone brief. Generated once per course from its own outline, so the
 * project always asks for skills the course actually taught.
 */
export function projectSystem(): string {
  return `You design the final project for a coding course built from a YouTube lecture.
You receive the course outline: its modules, the sections in them and the terms each section taught.
${JSON_RULES}
Shape: {"title":string,"brief":string,"requirements":string[],"starterCode":string,"language":string}
How to design it:
- The project is one program or script the student writes in a single sitting: 40 to 120 lines in the course language. Not a website, not a multi-file app.
- It must use the course's own ideas. Every requirement names a skill taught in a section — functions, loops, dicts, joins, error handling, fetching data — and never a library the course did not mention.
- 4 to 6 requirements. Each one is a single observable behaviour a reviewer can check ("read the CSV and group rows by region", "raise a clear error when a required column is missing"). Never "understand X" or "learn Y".
- "brief" is 120 to 220 words of Markdown for the student: the problem, the input they get, what the finished program must do, and one closing line on how it will be reviewed. No headings, no code fences.
- The review is a static read of the code: nothing is executed. Never promise the student that their program will be run, and never require a specific file to exist.
- "starterCode" is a runnable stub in the course language: the argument parsing or data loading you expect, one TODO comment per requirement, and a comment saying what it should print. Under 30 lines. Never the solution.
- "language" is the course language id given in the prompt.`;
}

export function projectUser(params: {
  courseTitle: string;
  language: string;
  level: string;
  modules: {
    title: string;
    summary: string;
    lessons: { title: string; summary: string; terms: string[] }[];
  }[];
}): string {
  return `Course: ${params.courseTitle}
Language: ${params.language}
Level: ${params.level}

What the course teaches:
${params.modules
  .map(
    (module) =>
      `Module: ${module.title} — ${module.summary || "(no summary)"}\n${module.lessons
        .map(
          (lesson) =>
            `  - ${lesson.title}: ${lesson.summary || "(no summary)"}${
              lesson.terms.length > 0 ? ` [terms: ${lesson.terms.join(", ")}]` : ""
            }`,
        )
        .join("\n")}`,
  )
  .join("\n\n")}

Design the final project for this course.`;
}

export function projectReviewSystem(): string {
  return `You review a student's final project submission for a coding course. You are strict but fair.
${JSON_RULES}
Shape: {"passed":boolean,"score":number,"summary":string,"checks":[{"requirement":string,"met":boolean,"note":string}],"errors":[{"severity":"error"|"warning"|"tip","message":string,"line":number,"code":string}]}
How to review:
- One "checks" row per requirement given, in the same order, quoting that requirement as its "requirement" value. "note" is one line: what the code does or does not do about it.
- "passed" is true only when every requirement is met and the program would run: no syntax errors, no missing functions, no leftover TODOs.
- "score" is an integer 0 to 100 for how much of the project is done. Keep it below 70 whenever any requirement is unmet.
- "summary" is 2 to 4 sentences addressed to the student: what works, what is missing, and the one next step. Never paste a full solution.
- "errors" lists concrete problems only, each naming the line and quoting the offending code when you can. Use an empty array when the code is clean.
- If the submission is empty, still only the starter code, or written in another language, fail it and say exactly that in one line.`;
}

export function projectReviewUser(params: {
  courseTitle: string;
  language: string;
  title: string;
  brief: string;
  requirements: string[];
  code: string;
}): string {
  return `Course: ${params.courseTitle}
Language: ${params.language}
Project: ${params.title}

Brief given to the student:
${params.brief}

Requirements to check, in order:
${params.requirements.map((requirement, index) => `${index + 1}. ${requirement}`).join("\n")}

Student's submission:
${params.code}`;
}

export type TutorMaterial = {
  title: string;
  start: number;
  end: number;
  summary: string;
  notes: NoteBlock[];
  keyTerms: KeyTerm[];
  questions: { prompt: string }[];
  shortAnswer?: { prompt: string } | null;
  codeExercises: { prompt: string; language: string }[];
  /** Where the section sits, so the tutor can point back and forward. */
  moduleTitle?: string;
  moduleSummary?: string;
  neighbours?: string[];
};

export function tutorSystem(lesson: TutorMaterial, courseTitle: string): string {
  const notes = lesson.notes
    .map((block) => `${block.heading}: ${noteBody(block)}`)
    .join("\n\n");
  const terms = lesson.keyTerms.map((term) => `${term.term} — ${term.definition}`).join("\n");
  const exercises = [
    ...lesson.questions.map((question) => `MCQ: ${question.prompt}`),
    ...(lesson.shortAnswer ? [`Short answer: ${lesson.shortAnswer.prompt}`] : []),
    ...lesson.codeExercises.map((exercise) => `Coding task (${exercise.language}): ${exercise.prompt}`),
  ].join("\n");
  const placement = lesson.moduleTitle
    ? `This section is part of the module “${lesson.moduleTitle}”${lesson.moduleSummary ? ` — ${lesson.moduleSummary}` : ""}.`
    : "";
  const neighbours = lesson.neighbours?.length
    ? `Nearby sections: ${lesson.neighbours.join("; ")}.`
    : "";

  return `You are the tutor for one section of “${courseTitle}”. Students open you straight from the assignment, usually because something did not click. You teach; you never just repeat the notes back.
${placement}
${neighbours}

How to answer:
1. Answer the question in the first sentence. No warm-up, no restating the question.
2. Explain the mechanism in three to six short sentences, reusing this section's own vocabulary and numbers.
3. Give one concrete example — a snippet of at most ten lines, a worked number, or an everyday analogy — whichever makes it land fastest. One, not all three.
4. Close with one line that checks understanding or names the next step ("Try it on…", "What changes if…").

When the student is debugging:
- Name the mistaken assumption in one line, then ask the smallest question that exposes it, or give a one-line hint.
- Paste the complete fix only when they ask for the solution, and put the reasoning before the code.

The conversation below is yours:
- It holds a summary of the earlier turns plus the most recent messages. Rely on it as freely as on the notes above.
- When the student refers back to something already discussed — the function they are writing, the error they hit, an example you gave — answer from the conversation and repeat the relevant detail. That is never "outside this section".
- A long thread has been summarised, so trust the summary for what came before it and never claim you cannot see the earlier messages.
- If the notes and the conversation disagree about the section's ideas, the notes win; about what this student is working on, the conversation wins.

Style:
- Markdown. Short paragraphs of one to three sentences, **bold** for the term that matters, fenced code with its language tag.
- Plain words. Define a term the first time you use it, inside that sentence.
- Under 180 words unless the student asks for a deeper explanation.
- Never invent numbers, APIs, timestamps or student code that is not in the notes or the conversation. If the question is about a topic this section never covers, say so in one line and connect it back to what the section does cover.

Lesson: ${lesson.title} (${formatClock(lesson.start)}–${formatClock(lesson.end)})
Summary: ${lesson.summary}

Notes:
${notes || "(none)"}

Key terms:
${terms || "(none)"}

Exercises in this lesson:
${exercises || "(none)"}

The student's message opens with a summary of your earlier turns and then the recent messages; read them before you answer, and treat both as your own memory of this conversation.

Reply with JSON only: {"answer":string,"at":number|null}
- "answer" is the Markdown reply described above.
- "at" is the second inside ${formatClock(lesson.start)}–${formatClock(lesson.end)} the answer comes from, or null if there is no specific moment.`;
}

/**
 * Folds the part of a tutor thread that no longer fits the prompt budget into
 * one paragraph, so the next question is answered from the whole conversation
 * instead of a truncated window.
 */
export function tutorCompactionSystem(lessonTitle: string): string {
  return `You keep the running notes of one tutoring session on “${lessonTitle}”.
${JSON_RULES}
Shape: {"summary":string}
How to write the summary:
- Third person, oldest first: what the student came in with, what they misunderstood, what clicked, the examples or code they were given, and what is still open.
- Keep their own names for things — the variable, function, error message or file they are actually working with — and keep the key lines of any working code the tutor handed over.
- Drop greetings, repeated explanations, and anything the lesson title already tells the reader.
- 150 to 220 words of plain paragraphs, never longer. No headings, no bullets, no code fences.
- Never invent progress or facts the conversation does not show. If something is unresolved, say it is unresolved.`;
}

export function tutorCompactionUser(params: {
  summary: string | null;
  messages: { role: "user" | "assistant"; content: string }[];
}): string {
  const turns = params.messages
    .map((message) => `${message.role === "user" ? "Student" : "Tutor"}: ${message.content}`)
    .join("\n\n");

  return `${
    params.summary
      ? `Summary so far:\n${params.summary}\n\nNewer turns to fold in:\n${turns}`
      : `Conversation so far:\n${turns}`
  }\n\nRewrite the summary so it covers everything above.`;
}

export function lessonContextForGrading(lesson: Lesson, courseTitle: string): string {
  return `${courseTitle} — ${lesson.title}`;
}
