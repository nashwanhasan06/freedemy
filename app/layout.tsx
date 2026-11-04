import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";

import { Toaster } from "@/components/ui/sonner";
import { WatermarkFooter } from "@/components/watermark-footer";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Freedemy — turn any lecture into a course you can pass",
    template: "%s · Freedemy",
  },
  description:
    "Paste a YouTube course link and get chapters, notes, assignments and a tutor that checks your mistakes against the exact moment in the video.",
};

/* Runs before paint so a stored light preference never flashes the dark canvas. */
const themeScript =
  "try{var s=localStorage.getItem('freedemy-theme');var d=s?s==='dark':true;var r=document.documentElement;r.setAttribute('data-theme',d?'dark':'light');r.style.colorScheme=d?'dark':'light';}catch(e){}";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      // The inline script below sets the class before paint, so it differs from the server output.
      suppressHydrationWarning
      className={`${inter.variable} h-full`}
    >
      <head>
        <Script id="theme-init" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body className="flex min-h-full flex-col antialiased bg-ambient-gradient">
        <div className="flex flex-1 flex-col">{children}</div>
        <WatermarkFooter />
        <Toaster position="bottom-center" />
      </body>
    </html>
  );
}
