import { InsurerDetail } from "@/components/admin/insurer-detail";

export default async function AdminInsurerPage({ params }: PageProps<"/admin/insurers/[id]">) {
  const { id } = await params;
  return <InsurerDetail insurerId={id} />;
}
