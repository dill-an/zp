import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const { next } = await searchParams;
  if (user) redirect(next && next.startsWith("/") ? next : "/dashboard");
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Zeta Psi</p>
          <h1 className="mt-1 text-2xl font-semibold">ZP House</h1>
          <p className="mt-1 text-sm text-muted">Cleans, chairs, dues and everything else.</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
