import type { Metadata } from "next";
import {
  IBM_Plex_Mono,
  Instrument_Sans,
  Instrument_Serif,
} from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// next/font downloads and self-hosts at build time, so nothing reaches out to
// a font CDN when the app runs.
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-instrument-serif",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

/*
  Runs in <head>, before anything paints, so the first frame is already in the
  right theme rather than flashing the dark ground on the way to the light one.

  Dark unless someone has asked for light, rather than following the operating
  system. Reading the OS would flip this interface to light for anyone whose
  laptop happens to be set that way, which is a change to how the product looks
  that nobody chose. Light is a decision, and it is remembered once made.
*/
const THEME_INIT = `(function () {
  try {
    document.documentElement.dataset.theme =
      localStorage.getItem("bureau.theme") === "light" ? "light" : "dark";
  } catch (e) {
    document.documentElement.dataset.theme = "dark";
  }
})();`;

export const metadata: Metadata = {
  title: "Bureau",
  description: "Local-first outbound CRM for Operating Bureau",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // The script above sets data-theme before hydration, so the attribute
      // never matches what the server rendered. That is the point of it.
      suppressHydrationWarning
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="h-full overflow-hidden antialiased">
        <div className="texture" aria-hidden />
        <div className="relative z-10 h-full">
          <TooltipProvider>{children}</TooltipProvider>
        </div>
      </body>
    </html>
  );
}
