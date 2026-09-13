import Link from "next/link";

export default function HomePage() {
  return (
    <main className="bg-canvas flex h-full items-center justify-center p-8">
      <div className="w-full max-w-md space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold tracking-tight">Bureau CRM</h1>
          <p className="text-muted-foreground text-xs">
            Local-first pipeline for Operating Bureau. Phase 1 scaffold: Next.js
            15, Tailwind v4, dark-only theme.
          </p>
        </div>
        <div className="bg-card rounded-md border p-4 text-xs">
          <p className="text-muted-foreground">
            The database, pipeline board, and dashboard land in later phases.
            Nothing here reads from SQLite yet.
          </p>
        </div>
        <Link
          href="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-ring inline-flex h-8 items-center rounded-md px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
        >
          Reload
        </Link>
      </div>
    </main>
  );
}
