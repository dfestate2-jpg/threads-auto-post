import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="font-num text-4xl font-bold">404</p>
      <p className="mt-2 text-sm text-muted">この銘柄は表示対象ではありません。</p>
      <Link href="/" className="mt-6 rounded-lg border border-line px-4 py-2 text-sm hover:border-white/30">
        MARKET SENTIMENT へ戻る
      </Link>
    </main>
  );
}
