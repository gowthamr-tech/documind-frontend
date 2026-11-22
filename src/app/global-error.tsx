"use client";
// Last-resort boundary for failures in the root layout itself; must render its own <html>.
import "./globals.css";
import { ErrorState } from "@/components/ErrorState";

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body className="grid min-h-screen place-items-center px-4"><ErrorState {...props} /></body>
    </html>
  );
}
