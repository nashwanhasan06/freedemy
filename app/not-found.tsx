import Link from "next/link";

import { BrandMark } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <BrandMark className="size-11 rounded-xl" />
      <div>
        <h1 className="text-[1.3rem] font-semibold tracking-tight">
          We couldn&apos;t find that course
        </h1>
        <p className="mt-1.5 text-[0.88rem] leading-relaxed text-muted-foreground">
          The link may be out of date, or the course was never generated on this device.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button className="h-10" render={<Link href="/" />} nativeButton={false}>
          Back to all courses
        </Button>
        <Button
          variant="outline"
          className="h-10"
          render={<Link href="/dashboard" />}
          nativeButton={false}
        >
          Your dashboard
        </Button>
      </div>
    </main>
  );
}
