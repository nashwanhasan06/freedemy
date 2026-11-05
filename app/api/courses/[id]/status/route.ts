import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: course } = await supabase
    .from("courses")
    .select("id,slug,title,status,stage,error,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!course) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [{ count: lessonCount }, { count: moduleCount }] = await Promise.all([
    supabase.from("lessons").select("id", { count: "exact", head: true }).eq("course_id", id),
    supabase.from("modules").select("id", { count: "exact", head: true }).eq("course_id", id),
  ]);

  return NextResponse.json(
    {
      id: course.id,
      slug: course.slug,
      title: course.title,
      status: course.status,
      stage: course.stage,
      error: course.error,
      lessons: lessonCount ?? 0,
      modules: moduleCount ?? 0,
      updatedAt: course.updated_at,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
