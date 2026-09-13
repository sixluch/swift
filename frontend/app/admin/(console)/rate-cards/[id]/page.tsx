import { RateCardDetail } from "@/components/admin/rate-card-detail";

export default async function AdminRateCardPage({ params }: PageProps<"/admin/rate-cards/[id]">) {
  const { id } = await params;
  return <RateCardDetail rateCardId={id} />;
}
