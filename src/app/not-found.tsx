import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="text-center">
        <h1 className="text-lg font-semibold text-slate-900">Page not found</h1>
        <p className="mt-1 text-sm text-slate-500">The page you asked for doesn&apos;t exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-brand-700 hover:underline">Back to the dashboard</Link>
      </div>
    </div>
  );
}
