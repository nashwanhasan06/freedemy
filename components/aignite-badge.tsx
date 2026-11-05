import Image from "next/image";
import { cn } from "@/lib/utils";

export function AigniteBadge({ className }: { className?: string }) {
  return (
    <Image
      src="/built-for-aignite-2026.png"
      alt="Built for AIgnite Buildathon 2026 — National AI Hackathon for B2C Solutions"
      width={720}
      height={256}
      priority
      className={cn("h-8 w-auto rounded-md sm:h-10 lg:h-12", className)}
    />
  );
}

