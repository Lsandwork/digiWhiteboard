import { publicVerify } from "@/lib/card-studio/store";
import { VerifyPublic } from "@/components/card-studio/VerifyPublic";

export const dynamic = "force-dynamic";

export default async function CardVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const card = await publicVerify(decodeURIComponent(token));
  if (!card) {
    return <VerifyPublic status="unknown" />;
  }
  return (
    <VerifyPublic
      status={String(card.status)}
      membershipType={card.membership_type}
      cardNumber={card.card_number}
      expiration={card.expiration_at}
    />
  );
}
