import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { AuthNav } from "@/components/auth-nav";
import { GeneratingPipeline } from "@/components/generating/generating-pipeline";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Generating your course",
};
export const instant = false;

export default async function GeneratingPage({ searchParams }: PageProps<"/generating">) {
  await connection();
  const user = await requireUser("/generating");
  const params = await searchParams;
  const courseId = typeof params.course === "string" ? params.course : "";

  if (!courseId) {
    redirect("/#paste");
  }

  return (
    <>
      <SiteHeader
        right={
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3"
              render={<Link href="/dashboard" />}
              nativeButton={false}
            >
              Dashboard
            </Button>
            <AuthNav user={user} />
          </>
        }
      />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-8 sm:px-8 lg:py-12">
        <GeneratingPipeline courseId={courseId} />
      </main>
    </>
  );
}
