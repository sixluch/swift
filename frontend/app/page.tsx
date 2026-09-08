import { AppShell } from "@/components/app-shell";
import { LeadProvider } from "@/lib/lead-context";

export default function Home() {
  return (
    <LeadProvider>
      <AppShell />
    </LeadProvider>
  );
}
