"use client";
import { ErrorState } from "@/components/ErrorState";

export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <div className="grid min-h-screen place-items-center px-4"><ErrorState {...props} /></div>;
}
