export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 font-sans text-zinc-50">
      <main className="w-full max-w-2xl space-y-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
          Backend reference only
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Mobile runtime is Supabase Edge Functions.
        </h1>
        <p className="text-base leading-7 text-zinc-300">
          This Next.js app remains a parity/reference backend for tests and
          migration work. React Native production traffic should call
          Supabase Auth and the mobile-api Edge Function directly.
        </p>
        <a
          className="inline-flex min-h-11 items-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-zinc-950"
          href="/admin/kael-learning"
        >
          Mở duyệt học Kael
        </a>
      </main>
    </div>
  );
}
