import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/icons";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  if (!isSupabaseConfigured) redirect("/");
  const { next, error } = await searchParams;
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-navy px-4 py-10">
      <Link href="/" className="flex items-center gap-2.5 text-white">
        <Logo size={32} />
        <span className="font-display text-xl font-bold">Contract Radar</span>
      </Link>
      <div className="flex w-full max-w-[400px] flex-col gap-5 rounded-2xl bg-white p-7">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 font-display text-2xl font-semibold">Welcome</h1>
          <p className="m-0 text-sm text-muted">Sign in to your team&apos;s contract workspace.</p>
        </div>
        {error && <p className="m-0 rounded-lg bg-[#FEF3F2] px-3 py-2 text-sm text-[#912018]">{error}</p>}
        <LoginForm next={next && next.startsWith("/") ? next : "/"} />
      </div>
    </div>
  );
}
