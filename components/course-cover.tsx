import Image from "next/image";

import type { Course } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Course artwork. The real YouTube thumbnail is the recognisable thing, so it
 * leads; the generated gradient stays underneath as the loading layer, which
 * avoids the grey box while i.ytimg.com responds.
 */

type Tone = { from: string; to: string };

const BY_SLUG: Record<string, Tone> = {
  "python-fundamentals": {
    from: "oklch(0.47 0.19 259)",
    to: "oklch(0.63 0.15 246)",
  },
  "javascript-essentials": {
    from: "oklch(0.43 0.17 268)",
    to: "oklch(0.6 0.16 254)",
  },
  "sql-for-analysis": {
    from: "oklch(0.45 0.15 236)",
    to: "oklch(0.64 0.12 214)",
  },
};

const RAMP: Tone[] = [
  { from: "oklch(0.47 0.19 259)", to: "oklch(0.63 0.15 246)" },
  { from: "oklch(0.43 0.17 268)", to: "oklch(0.6 0.16 254)" },
  { from: "oklch(0.45 0.15 236)", to: "oklch(0.64 0.12 214)" },
];

function hashOf(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function toneFor(course: Course): Tone {
  return BY_SLUG[course.slug] ?? RAMP[hashOf(course.slug) % RAMP.length];
}

export function CourseCover({
  course,
  className,
  sizes = "(max-width: 768px) 100vw, 380px",
  priority = false,
}: {
  course: Course;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const tone = toneFor(course);

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{
        backgroundImage: `linear-gradient(135deg, ${tone.from} 0%, ${tone.to} 100%)`,
      }}
    >
      <Image
        src={`https://i.ytimg.com/vi/${course.videoId}/hqdefault.jpg`}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
      {/* Keeps bright thumbnail artwork from glaring against the card. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
    </div>
  );
}
