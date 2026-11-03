import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CourseWorkspace } from "@/components/course-workspace";
import { DEMO_COURSES, getCourse } from "@/lib/demo-data";

/**
 * The course page resolves its slug from the URL, which cannot be instant for
 * slugs that were not prerendered, so this segment is allowed to block.
 */
export const instant = false;

export function generateStaticParams() {
  return DEMO_COURSES.map((course) => ({ slug: course.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/course/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const course = getCourse(slug);
  return { title: course ? course.title : "Course not found" };
}

export default async function CoursePage({ params }: PageProps<"/course/[slug]">) {
  const { slug } = await params;
  const course = getCourse(slug);

  if (!course) notFound();

  return <CourseWorkspace course={course} />;
}
