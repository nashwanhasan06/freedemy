import type { Metadata } from "next";

import { SetupNotice } from "@/components/setup-notice";

export const metadata: Metadata = { title: "Setup" };

export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
      <SetupNotice />
    </main>
  );
}
