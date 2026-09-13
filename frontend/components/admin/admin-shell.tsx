"use client";

import { Loader2, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { config } from "@/lib/config";
import type { AdminIdentity } from "@/lib/admin-types";

const NAV = [
  { href: "/admin", label: "Leads" },
  { href: "/admin/insurers", label: "Insurers" },
  { href: "/admin/knowledge-base", label: "Knowledge base" },
] as const;

/**
 * Client-side gate. The backend rejects every /admin data route without a valid
 * session cookie regardless of what happens here — this only decides whether to
 * render the console or bounce to the sign-in page.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [admin, setAdmin] = useState<AdminIdentity | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .me()
      .then((identity) => {
        if (!cancelled) setAdmin(identity);
      })
      .catch(() => {
        if (!cancelled) router.replace("/admin/login");
      })
      .finally(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function signOut() {
    await api.admin.logout().catch(() => {});
    router.replace("/admin/login");
  }

  if (!checked || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-white/10 bg-navy-900/95 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/admin" className="font-heading text-sm font-semibold tracking-tight">
          {config.brandName}{" "}
          <span className="font-normal text-slate-400">Admin</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-2.5 py-1.5 transition ${
                  active
                    ? "bg-brand/15 text-brand"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm text-slate-400">
          <span className="hidden sm:inline">{admin.username}</span>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-slate-300 transition hover:bg-white/5 hover:text-white"
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
