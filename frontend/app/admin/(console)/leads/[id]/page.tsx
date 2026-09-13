import { LeadDetail } from "@/components/admin/lead-detail";

export default async function AdminLeadPage({ params }: PageProps<"/admin/leads/[id]">) {
  const { id } = await params;
  return <LeadDetail leadId={id} />;
}
