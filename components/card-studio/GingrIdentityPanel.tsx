"use client";

import { useState } from "react";
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
  const source = (member.barcodeSource || "gingr_animal_id") as BarcodeSource;

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
          gingrOwnerBarcode: next.gingrOwnerBarcode ?? member.gingrOwnerBarcode
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cs-id-panel">
      <strong>Gingr identification</strong>
      <dl>
        <div><dt>Dog</dt><dd>{member.dogName || "—"}</dd></div>
        <div><dt>Owner</dt><dd>{member.name || "—"}</dd></div>
        {member.phone ? <div><dt>Phone</dt><dd>{member.phone}</dd></div> : null}
        {member.email ? <div><dt>Email</dt><dd>{member.email}</dd></div> : null}
        <div><dt>Gingr client ID</dt><dd>{member.gingrOwnerId || "—"}</dd></div>
        <div><dt>Gingr pet / animal ID</dt><dd>{member.gingrAnimalId || "—"}</dd></div>
        <div><dt>Gingr owner barcode field</dt><dd>{member.gingrOwnerBarcode || "not stored in RuffOps"}</dd></div>
        <div><dt>Visible member ID</dt><dd>{member.gingrAnimalId || "—"}</dd></div>
        <div><dt>Physical card number</dt><dd>{member.cardNumber || "assigned at print (FIT-) — not encoded"}</dd></div>
        {showInternalIds ? (
          <>
            <div><dt>Card UUID</dt><dd>{member.cardUuid || "assigned at print"}</dd></div>
            <div><dt>RuffOps ops dog ID</dt><dd>{member.opsDogId || "—"}</dd></div>
          </>
        ) : null}
        <div><dt>Barcode source</dt><dd>{BARCODE_SOURCE_LABELS[source] || source}</dd></div>
        <div><dt>Barcode value</dt><dd className="cs-id-value">{barcode || "missing"}</dd></div>
      </dl>
      <p>{barcodeCompatibilityNote(source)}</p>
      <div className="cs-actions">
        <button className="cs-btn" type="button" disabled={busy || !member.gingrAnimalId} onClick={() => void runLookup(false)}>
          Local barcode validation
        </button>
        <button className="cs-btn" type="button" disabled={busy || !member.gingrAnimalId} onClick={() => void runLookup(true)}>
          Gingr record verification
        </button>
      </div>
      {lookup ? (
        <div className="cs-id-lookup">
          <p><strong>{lookup.kind === "gingr_api" ? "GINGR RECORD VERIFICATION" : lookup.kind === "local_cache" ? "LOCAL BARCODE VALIDATION" : "NOT FOUND"}</strong></p>
          <p>Barcode value: {barcode || "—"}</p>
          <p>Gingr record: {lookup.dogName || "—"} · Owner: {lookup.ownerName || "—"} · Gingr ID: {lookup.gingrAnimalId || "—"}</p>
          <p>{lookup.ok ? "VALID against the source named above." : "Not verified."}</p>
          <p>{lookup.message}</p>
        </div>
      ) : null}
    </div>
  );
}
