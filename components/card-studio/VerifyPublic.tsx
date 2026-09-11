"use client";

import { publicCardStatusLabel } from "@/lib/card-studio/verify";
import { FITDOG_APPROVED_LOGO } from "@/lib/card-studio/constants";

export function VerifyPublic({
  status,
  membershipType,
  cardNumber,
  expiration
}: {
  status: string;
  membershipType?: string | null;
  cardNumber?: string | null;
  expiration?: string | null;
}) {
  const label = publicCardStatusLabel(status, expiration);
  const color = label === "VALID" ? "#34d399" : label === "REVOKED" ? "#fb7185" : "#fbbf24";
  return (
    <div className="cs-verify">
      <div className="cs-verify-card">
        {/* Official Fitdog logo asset — must not be replaced with a generated image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={FITDOG_APPROVED_LOGO} alt="Fitdog" width={72} height={72} />
        <p className="cs-verify-status" style={{ color }}>
          {label}
        </p>
        <p>Fitdog Member</p>
        <p>{membershipType || "Membership"}</p>
        <p>Card {cardNumber}</p>
        {expiration ? <p>Expiration {expiration}</p> : null}
      </div>
    </div>
  );
}
