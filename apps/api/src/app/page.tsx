import Link from 'next/link'

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 font-sans text-zinc-50">
      <main className="w-full max-w-2xl space-y-6">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
          Hệ thống đối chiếu
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Luồng ứng dụng di động vận hành qua Supabase Edge Functions.
        </h1>
        <p className="text-base leading-7 text-zinc-300">
          Ứng dụng Next.js này dùng để đối chiếu hệ thống, chạy kiểm thử và hỗ
          trợ chuyển đổi dữ liệu. Lưu lượng của ứng dụng React Native được gửi
          trực tiếp qua Supabase Auth và Edge Function mobile-api.
        </p>
        <Link
          className="inline-flex min-h-11 items-center rounded-xl bg-emerald-400 px-4 text-sm font-bold text-emerald-950"
          href="/admin/kael-learning"
        >
          Mở trang duyệt học Kael
        </Link>
      </main>
    </div>
  );
}
