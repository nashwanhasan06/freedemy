"use client";

import { ArrowLeft, ArrowUpRight, ListTree } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Brand } from "@/components/brand";
import { CoursePlayer } from "@/components/course-player";
import { Curriculum } from "@/components/curriculum";
import { AssignmentPanel } from "@/components/panels/assignment-panel";
import { NotesPanel } from "@/components/panels/notes-panel";
import { OverviewPanel } from "@/components/panels/overview-panel";
import { TutorPanel } from "@/components/panels/tutor-panel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adjacentLesson, courseLessons, seedGrades } from "@/lib/course";
import { formatLength } from "@/lib/format";
import type { Course, GradeMap, GradedLesson } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { YouTubePlayer } from "@/lib/youtube";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "notes", label: "Notes" },
  { value: "assignment", label: "Assignment" },
  { value: "tutor", label: "Tutor" },
];

export function CourseWorkspace({ course }: { course: Course }) {
  const lessons = useMemo(() => courseLessons(course), [course]);
  const [activeLessonId, setActiveLessonId] = useState(lessons[0]?.id ?? "");
  const [grades, setGrades] = useState<GradeMap>(() => seedGrades(course));
  const [tab, setTab] = useState("overview");
  const [autoPlayNext, setAutoPlayNext] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const playerRef = useRef<YouTubePlayer | null>(null);

  const activeLesson = useMemo(
    () => lessons.find((lesson) => lesson.id === activeLessonId) ?? lessons[0],
    [lessons, activeLessonId],
  );

  const completed = lessons.filter((lesson) => grades[lesson.id]).length;
  const progress = lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 100);
  const lessonIndex = lessons.findIndex((lesson) => lesson.id === activeLesson?.id);

  const selectLesson = useCallback((lessonId: string) => {
    setActiveLessonId(lessonId);
    setDrawerOpen(false);
    window.history.replaceState(null, "", `#lesson-${lessonId}`);
  }, []);

  // Deep links like /course/python-fundamentals#lesson-loops
  useEffect(() => {
    const applyHash = () => {
      const id = window.location.hash.replace(/^#lesson-/, "");
      if (id && lessons.some((lesson) => lesson.id === id)) {
        setActiveLessonId(id);
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [lessons]);

  const goToLesson = useCallback(
    (direction: -1 | 1) => {
      const target = adjacentLesson(course, activeLessonId, direction);
      if (target) selectLesson(target.id);
    },
    [course, activeLessonId, selectLesson],
  );

  const rewatch = useCallback((at: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(at, true);
    player.playVideo();
  }, []);

  const handleGraded = useCallback((lessonId: string, grade: GradedLesson) => {
    setGrades((current) => ({ ...current, [lessonId]: grade }));
  }, []);

  if (!activeLesson) return null;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-[1400px] items-center justify-between gap-4 px-4 sm:px-8">
          <Brand />

          <nav className="flex items-center gap-1.5 sm:gap-2">
            <div className="hidden items-center gap-2 sm:flex">
              <div
                role="progressbar"
                aria-label="Course progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                aria-valuetext={`${progress}%`}
                className="h-1.5 w-24 overflow-hidden rounded-full bg-muted"
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#2753ff] via-[#6366f1] to-[#7c3aed] transition-all duration-500 shadow-[0_0_8px_rgba(39,83,255,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span
                aria-hidden="true"
                className="w-9 text-right text-xs font-medium tabular-nums text-muted-foreground"
              >
                {progress}%
              </span>
            </div>

            <ThemeToggle />
          </nav>
        </div>
        <div
          role="progressbar"
          aria-label="Course progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
          aria-valuetext={`${progress}%`}
          className="h-0.5 w-full bg-muted sm:hidden"
        >
          <div
            className="h-full bg-gradient-to-r from-[#2753ff] via-[#6366f1] to-[#7c3aed] transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-8 lg:py-7">
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_352px]">
          <div className="min-w-0">
            {/* Not sticky on phones: the player is ~38% of the viewport there and panels
                scrolled underneath it, which ate taps. Desktop keeps the in-flow layout. */}
            <div className="relative -mx-4 bg-background/95 px-4 pt-1 pb-3 backdrop-blur-sm lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none">
              <Button
                variant="outline"
                size="sm"
                className="mb-3 h-8 gap-2 rounded-lg border-border bg-card px-3 text-xs font-semibold text-foreground shadow-xs transition-all hover:border-primary/50 hover:bg-accent/40 hover:text-primary"
                render={<Link href="/" />}
                nativeButton={false}
              >
                <ArrowLeft className="size-3.5" />
                <span>Back to home</span>
              </Button>

              <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-primary">
                    Section {lessonIndex + 1} of {lessons.length}
                  </span>
                  <h1 className="truncate text-base font-bold tracking-tight sm:text-lg">
                    {activeLesson.title}
                  </h1>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="truncate text-[0.8rem] font-medium text-foreground">{course.title}</p>
                  <p className="text-[0.7rem] text-muted-foreground">{course.channel}</p>
                </div>
              </div>
              <CoursePlayer
                videoId={course.videoId}
                lesson={activeLesson}
                playerRef={playerRef}
                autoPlayNext={autoPlayNext}
                onAutoPlayNextChange={setAutoPlayNext}
                onPrevious={() => goToLesson(-1)}
                onNext={() => goToLesson(1)}
                hasPrevious={lessonIndex > 0}
                hasNext={lessonIndex < lessons.length - 1}
              />
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <Tabs value={tab} onValueChange={(value) => setTab(String(value))} className="w-full">
                <div className="flex flex-col-reverse gap-2 border-b-2 border-border sm:flex-row sm:items-center sm:justify-between">
                  <TabsList
                    variant="line"
                    className="no-scrollbar w-full justify-start gap-1 rounded-none border-b-0 p-0 max-[359px]:grid max-[359px]:grid-cols-2 max-[359px]:gap-x-1 sm:w-auto"
                  >
                    {TABS.map((item) => (
                      <TabsTrigger
                        key={item.value}
                        value={item.value}
                        className="h-10 flex-none px-3 text-[0.82rem] font-medium data-active:font-semibold sm:px-4 sm:text-[0.84rem]"
                      >
                        {item.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-fit self-end gap-1.5 px-2.5 text-xs sm:ml-2 sm:self-auto lg:hidden"
                    onClick={() => setDrawerOpen(true)}
                  >
                    <ListTree className="size-3.5" />
                    Sections
                  </Button>
                </div>

                <TabsContent value="overview" className="mt-5 animate-fade">
                  <OverviewPanel lesson={activeLesson} onRewatch={rewatch} />
                </TabsContent>
                <TabsContent value="notes" className="mt-5 animate-fade">
                  <NotesPanel lesson={activeLesson} />
                </TabsContent>
                <TabsContent value="assignment" className="mt-5 animate-fade">
                  <AssignmentPanel
                    key={activeLesson.id}
                    lesson={activeLesson}
                    onRewatch={rewatch}
                    onGraded={handleGraded}
                    lastGrade={grades[activeLesson.id]}
                  />
                </TabsContent>
                <TabsContent value="tutor" className="mt-5 animate-fade">
                  <TutorPanel key={activeLesson.id} lesson={activeLesson} onRewatch={rewatch} />
                </TabsContent>
              </Tabs>
            </div>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-20">
              <div className="overflow-hidden rounded-xl bg-card border border-border shadow-xs">
                <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="text-[0.85rem] font-semibold">Course content</h2>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {course.chapters.length} chapters · {lessons.length} sections ·{" "}
                      {formatLength(lessons.reduce((sum, l) => sum + (l.end - l.start), 0))}
                    </p>
                  </div>
                  <span className="text-[0.68rem] font-medium tabular-nums text-muted-foreground">
                    <span aria-hidden="true">
                      {completed}/{lessons.length}
                    </span>
                    <span className="sr-only">
                      {completed} of {lessons.length} sections started
                    </span>
                  </span>
                </div>
                <div className="max-h-[calc(100vh-14rem)] overflow-y-auto">
                  <Curriculum
                    course={course}
                    activeLessonId={activeLesson.id}
                    grades={grades}
                    onSelect={selectLesson}
                  />
                </div>
              </div>

              <a
                href={`https://www.youtube.com/watch?v=${course.videoId}`}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "mt-3 flex items-center justify-between gap-2 rounded-lg px-1 py-1 text-[0.72rem] text-muted-foreground",
                  "transition-colors hover:text-foreground",
                )}
              >
                <span>Original video · {course.channel}</span>
                <ArrowUpRight className="size-3.5" />
              </a>
            </div>
          </aside>
        </div>
      </main>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-[88%] max-w-sm gap-0 p-0">
          <SheetHeader className="border-b border-border/80">
            <SheetTitle>Course content</SheetTitle>
            <SheetDescription>
              {completed} of {lessons.length} sections started
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto">
            <Curriculum
              course={course}
              activeLessonId={activeLesson.id}
              grades={grades}
              onSelect={selectLesson}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
