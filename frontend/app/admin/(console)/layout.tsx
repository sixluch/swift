import { AdminShell } from "@/components/admin/admin-shell";

/** Wraps every authenticated admin page. /admin/login sits outside this group. */
export default function AdminConsoleLayout({ children }: LayoutProps<"/admin">) {
  return <AdminShell>{children}</AdminShell>;
}
