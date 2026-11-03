import Link from "next/link";
import { Suspense } from "react";

import { GeneratingPipeline } from "@/components/generating/generating-pipeline";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Generating your course",
};

export default function GeneratingPage() {
  return (
    <>
      <SiteHeader
        right={
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3"
            render={<Link href="/" />}
            nativeButton={false}
          >
            Cancel
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-[1080px] flex-1 px-4 py-8 sm:px-8 lg:py-12">
        <Suspense fallback={<PipelineSkeleton />}>
          <GeneratingPipeline />
        </Suspense>
      </main>
    </>
  );
}

function PipelineSkeleton() {
  return (
    <Card className="max-w-2xl">
      <CardContent className="flex flex-col gap-3 pt-1">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-2 h-2 w-full" />
        <div className="mt-3 flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
