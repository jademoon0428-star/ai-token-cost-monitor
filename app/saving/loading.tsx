export default function Loading() {
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-40 rounded bg-slate-200" />
            <div className="h-4 w-80 rounded bg-slate-200" />
            <div className="flex gap-2">
              <div className="h-6 w-24 rounded-full bg-slate-200" />
              <div className="h-6 w-32 rounded-full bg-slate-200" />
              <div className="h-6 w-36 rounded-full bg-slate-200" />
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
          <div className="h-44 animate-pulse rounded-2xl bg-white shadow-sm" />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="animate-pulse space-y-4">
            <div className="h-6 w-48 rounded bg-slate-200" />
            <div className="h-4 w-72 rounded bg-slate-200" />
            <div className="h-20 rounded bg-slate-100" />
          </div>
        </section>
      </div>
    </main>
  );
}
