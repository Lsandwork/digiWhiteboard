"use client";

import { useEffect, useState } from "react";
import {
  BARCODE_SOURCE_LABELS,
  barcodeCompatibilityNote,
  gingrBarcodeValue,
  type BarcodeSource
} from "@/lib/card-studio/gingr-identity";
import type { MemberCardContext } from "@/lib/card-studio/types";

type Lookup = {
  kind: string;
  ok: boolean;
  dogName: string | null;
  ownerName: string | null;
  gingrAnimalId: string | null;
  gingrOwnerId: string | null;
  gingrOwnerBarcode: string | null;
  message: string;
};

export function GingrIdentityPanel({
  member,
  showInternalIds,
  onMemberPatch
}: {
  member: MemberCardContext;
  showInternalIds: boolean;
  onMemberPatch?: (patch: Partial<MemberCardContext>) => void;
}) {
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [busy, setBusy] = useState(false);
  const barcode = gingrBarcodeValue(member);
  const source = (member.barcodeSource || "custom") as BarcodeSource;

  async function runLookup(live: boolean) {
    setBusy(true);
    try {
      const res = await fetch("/api/card-studio/gingr-lookup", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gingrAnimalId: member.gingrAnimalId,
          gingrOwnerId: member.gingrOwnerId,
          live
        })
      });
      const json = await res.json();
      const next = json.lookup as Lookup;
      setLookup(next);
      if (next?.gingrOwnerId || next?.gingrOwnerBarcode) {
        onMemberPatch?.({
          gingrOwnerId: next.gingrOwnerId ?? member.gingrOwnerId,
          gingrOwnerBarcode: next.gingrOwnerBarcode ?? member.gingrOwnerBarcode,
          memberNumber: member.memberNumber || next.gingrOwnerBarcode || member.memberNumber
        });
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!member.gingrOwnerId && !member.gingrAnimalId) return;
    void runLookup(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member.gingrOwnerId, member.gingrAnimalId]);

  return (
    <div className="cs-id-panel">
      <strong>Gingr identification</strong>
      <dl>
        <div><dt>OWNER name</dt><dd>{member.name || "—"}</dd></div>
        <div><dt>OWNER email</dt><dd>{member.email || "—"}</dd></div>
        <div><dt>OWNER phone</dt><dd>{member.phone || "—"}</dd></div>
        <div><dt>OWNER Gingr ID</dt><dd>{member.gingrOwnerId || "—"}</dd></div>
        <div><dt>OWNER barcode (raw)</dt><dd className="cs-id-value">{member.gingrOwnerBarcode || barcode || "MISSING"}</dd></div>
        <div><dt>ANIMAL name</dt><dd>{member.dogName || "—"}</dd></div>
        <div><dt>ANIMAL ID</dt><dd>{member.gingrAnimalId || "—"}</dd></div>
        <div><dt>ANIMAL breed</dt><dd>{member.dogBreed || "—"}</dd></div>
        <div><dt>Visible member ID</dt><dd>{member.memberNumber || member.gingrAnimalId || "—"}</dd></div>
        <div><dt>Physical card number</dt><dd>{member.cardNumber || "assigned at print (FIT-) — not encoded"}</dd></div>
        {showInternalIds ? (
          <>
            <div><dt>Card UUID</dt><dd>{member.cardUuid || "assigned at print"}</dd></div>
            <div><dt>RuffOps ops dog ID</dt><dd>{member.opsDogId || "—"}</dd></div>
          </>
        ) : null}
        <div><dt>Barcode source</dt><dd>{BARCODE_SOURCE_LABELS[source] || source}</dd></div>
        <div><dt>Member ID (typed)</dt><dd className="cs-id-value">{member.memberNumber || "MISSING"}</dd></div>
        <div><dt>Printed barcode value</dt><dd className="cs-id-value">{barcode || "MISSING"}</dd></div>
      </dl>
      <p>{barcode ? `Barcode encodes Member ID ${barcode}.` : "Type a Member ID number to generate the barcode."}</p>
      <p>{barcodeCompatibilityNote("custom")}</p>
      <div className="cs-actions">
        <button className="cs-btn" type="button" disabled={busy || (!member.gingrAnimalId && !member.gingrOwnerId)} onClick={() => void runLookup(false)}>
          Local cache lookup
        </button>
        <button className="cs-btn" type="button" disabled={busy || (!member.gingrAnimalId && !member.gingrOwnerId)} onClick={() => void runLookup(true)}>
          Load Gingr owner.barcode
        </button>
      </div>
      {lookup ? (
        <div className="cs-id-lookup">
          <p><strong>{lookup.kind === "gingr_api" ? "GINGR RECORD VERIFICATION" : lookup.kind === "local_cache" ? "LOCAL GINGR CACHE" : "NOT FOUND"}</strong></p>
          <p>Raw owner.barcode: {lookup.gingrOwnerBarcode || member.gingrOwnerBarcode || "MISSING"}</p>
          <p>Printed barcode: {gingrBarcodeValue({ ...member, memberNumber: member.memberNumber || lookup.gingrOwnerBarcode }) || "MISSING"}</p>
          <p>Owner: {lookup.ownerName || member.name || "—"} · Animal: {lookup.dogName || member.dogName || "—"}</p>
          <p>{lookup.message}</p>
        </div>
      ) : null}
    </div>
  );
}
