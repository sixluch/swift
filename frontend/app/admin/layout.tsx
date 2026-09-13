import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SwiftBrokers Admin",
  // A bulk PII surface has no business in a search index.
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return <div className="min-h-full bg-navy-950 text-slate-100">{children}</div>;
}
