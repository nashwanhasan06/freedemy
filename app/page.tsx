import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";

import { AuthNav } from "@/components/auth-nav";
import { DemoCourses } from "@/components/home/demo-courses";
import { Hero } from "@/components/home/hero";
import { SiteHeader } from "@/components/site-header";
import { getCurrentUser } from "@/lib/auth";
import { DEMO_COURSES } from "@/lib/demo-data";

/** Reads the session cookie to gate the generate form, so no prerender. */
export const instant = false;

export default async function HomePage({ searchParams }: PageProps<"/">) {
  await connection();
  const user = await getCurrentUser();
  const params = await searchParams;
  const pasted = params.url;
  const initialUrl = typeof pasted === "string" ? pasted : "";

  return (
    <>
      <SiteHeader
        right={
          <>
            {user && (
              <Link
                href="/dashboard"
                className="group inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.85rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                My courses
                <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            )}
            <AuthNav user={user} />
          </>
        }
      />

      <main className="flex-1">
        <Hero signedIn={Boolean(user)} initialUrl={initialUrl} />

        <div className="pt-16">
          <DemoCourses courses={DEMO_COURSES} />
        </div>
      </main>
    </>
  );
}
