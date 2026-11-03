import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { DemoCourses } from "@/components/home/demo-courses";
import { Hero } from "@/components/home/hero";
import { SiteHeader } from "@/components/site-header";
import { DEMO_COURSES } from "@/lib/demo-data";

export default function HomePage() {
  return (
    <>
      <SiteHeader
        right={
          <Link
            href="/dashboard"
            className="group inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[0.85rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            My courses
            <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        }
      />

      <main className="flex-1">
        <Hero />

        <div className="pt-16">
          <DemoCourses courses={DEMO_COURSES} />
        </div>
      </main>
    </>
  );
}
