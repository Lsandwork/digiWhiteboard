"use client";

/* Data-fetching effects. */
/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/exhaustive-deps */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CARD_STUDIO_PATHS, TEMPLATE_CATEGORY_LABELS } from "@/lib/card-studio/constants";
import { gingrBarcodeValue } from "@/lib/card-studio/gingr-barcode";
import { GingrIdentityPanel } from "@/components/card-studio/GingrIdentityPanel";
import { useCardStudioAccess } from "@/components/card-studio/CardStudioAccess";
import { openOsPrintDialog } from "@/components/card-studio/open-os-print";
import { replaceMemberPhoto } from "@/lib/card-studio/photo-slot";
import type { MemberCardContext, PrintMode } from "@/lib/card-studio/types";

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export function TemplateLibrary() {
  const { canDeleteTemplates } = useCardStudioAccess();
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [status, setStatus] = useState("all");

  async function load() {
    const res = await fetch(`/api/card-studio/templates?status=${status}`, { credentials: "same-origin" });
    const json = await res.json();
    const rows = json.templates ?? [];
    setTemplates(rows);
  }

  useEffect(() => {
    void load();
  }, [status]);

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Templates</h1>
          <p>Versioned CR80 artwork. The Club + Sports VIP template is print-ready: edit the dog name and replace the top-left photo.</p>
        </div>
        <Link className="cs-btn cs-btn--primary" href={`${CARD_STUDIO_PATHS.designer}?new=1`}>New template</Link>
      </div>
      <select className="cs-search" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter status">
        <option value="all">All</option>
        <option value="draft">Draft</option>
        <option value="active">Active</option>
        <option value="archived">Archived</option>
      </select>
      <div className="cs-kpi-grid" style={{ marginTop: 16 }}>
        {templates.map((tpl) => (
          <div className="cs-card" key={tpl.id}>
            <h3>{TEMPLATE_CATEGORY_LABELS[tpl.category as keyof typeof TEMPLATE_CATEGORY_LABELS] ?? tpl.category}</h3>
            <strong style={{ fontSize: 18 }}>{tpl.name}</strong>
            <p>{tpl.description}</p>
            <p className="cs-status">{tpl.status}</p>
            <div className="cs-actions">
              <Link className="cs-btn" href={`${CARD_STUDIO_PATHS.designer}?id=${tpl.id}`}>Open</Link>
              <button className="cs-btn" onClick={() => fetch("/api/card-studio/templates", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ duplicateOf: tpl.id }) }).then(load)}>Duplicate</button>
              {canDeleteTemplates ? (
                <button className="cs-btn cs-btn--danger" onClick={() => fetch(`/api/card-studio/templates?id=${tpl.id}`, { method: "DELETE", credentials: "same-origin" }).then(load)}>Archive</button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MemberPicker({ onSelect }: { onSelect?: (member: Record<string, unknown>) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      fetch(`/api/card-studio/members?q=${encodeURIComponent(q)}`, { credentials: "same-origin" })
        .then((res) => res.json())
        .then((json) => setHits(json.members ?? []));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Members</h1>
          <p>Search existing RuffOps / Fitdog dogs and owners. This does not duplicate member records.</p>
        </div>
      </div>
      <input className="cs-search" placeholder="Search name, dog, or number" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="cs-table">
        <thead><tr><th>Member</th><th>Dog</th><th>Number</th><th></th></tr></thead>
        <tbody>
          {hits.map((hit, index) => (
            <tr key={String(hit.opsDogId || hit.fitdogDogId || index)}>
              <td>{String(hit.name ?? "")}</td>
              <td>{String(hit.dogName ?? "")}</td>
              <td>{String(hit.memberNumber ?? "")}</td>
              <td>
                <button className="cs-btn cs-btn--primary" onClick={() => { setSelected(hit); onSelect?.(hit); }}>
                  Select
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? <p>Selected {String(selected.name)} / {String(selected.dogName)}</p> : null}
    </div>
  );
}

export function IssueWizard() {
  const { showInternalIds } = useCardStudioAccess();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<Record<string, unknown>>>([]);
  const [member, setMember] = useState<Record<string, unknown> | null>(null);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [templateId, setTemplateId] = useState("");
  const [printers, setPrinters] = useState<Array<Record<string, unknown>>>([]);
  const [printerId, setPrinterId] = useState("os-office");
  const [mode, setMode] = useState("duplex");
  const [preview, setPreview] = useState<{ frontSvg?: string; backSvg?: string; issues?: Array<{ message: string; severity: string }>; capabilities?: Record<string, boolean> } | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [override, setOverride] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/card-studio/templates?status=active", { credentials: "same-origin" }).then((r) => r.json()).then((j) => {
      const list = j.templates ?? [];
      setTemplates(list);
      const club = list.find((tpl: { name?: string }) => String(tpl.name).includes("Club + Sports"));
      if (club) setTemplateId(club.id);
      else if (list[0]) setTemplateId(list[0].id);
    });
    fetch("/api/card-studio/printers", { credentials: "same-origin" }).then((r) => r.json()).then((j) => {
      const list = j.printers ?? [];
      setPrinters(list);
      if (list.some((p: { id?: string }) => p.id === "os-office")) setPrinterId("os-office");
    });
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) return;
    const t = window.setTimeout(() => {
      fetch(`/api/card-studio/members?q=${encodeURIComponent(q)}`, { credentials: "same-origin" }).then((r) => r.json()).then((j) => setHits(j.members ?? []));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  const selectedPrinter = printers.find((p) => p.id === printerId);
  const caps = (selectedPrinter?.capabilities ?? preview?.capabilities ?? {}) as Record<string, boolean>;

  async function runPreview() {
    if (!member || !templateId) return;
    const res = await fetch("/api/card-studio/preview", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId, member, mode, printerId })
    });
    setPreview(await res.json());
  }

  async function printCard() {
    setPrintError(null);
    const res = await fetch("/api/card-studio/print-jobs", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ member, templateId, printerId, mode, overrideWarnings: override })
    });
    const json = await res.json();
    setResult(json);
    if (json.osPrint && json.artwork) {
      try {
        openOsPrintDialog({
          frontSvg: json.artwork.frontSvg,
          backSvg: json.artwork.backSvg,
          mode: mode as PrintMode,
          jobId: json.job?.job_id,
          cardNumber: json.card?.card_number,
          memberName: String(member?.name ?? "")
        });
      } catch (error) {
        setPrintError(error instanceof Error ? error.message : "Could not open the print dialog.");
      }
    }
  }

  async function confirmOs(printed: boolean) {
    const jobId = (result as { job?: { id?: string } } | null)?.job?.id;
    if (!jobId) return;
    const res = await fetch("/api/card-studio/print-jobs", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: jobId, action: "confirm-os-print", printed })
    });
    setResult(await res.json());
  }

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Create / Print Card</h1>
          <p>Type the Member ID number. That number prints on the card and generates the barcode.</p>
        </div>
      </div>
      <input className="cs-search" placeholder="Search dog, owner, phone, email, or Gingr ID" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="cs-card" style={{ marginTop: 12 }}>
        {hits.map((hit, i) => {
          return (
            <button key={i} className="cs-btn" style={{ margin: 4 }} onClick={() => setMember({ ...hit, memberNumber: String(member?.memberNumber ?? hit.gingrOwnerBarcode ?? "") })}>
              {String(hit.name)} · {String(hit.dogName ?? "")}
              {String(hit.memberNumber ?? hit.gingrOwnerBarcode ?? "") ? ` · ID ${String(hit.memberNumber ?? hit.gingrOwnerBarcode ?? "")}` : ""}
            </button>
          );
        })}
      </div>
      {member ? (
        <div className="cs-quick-edit" style={{ marginTop: 12 }}>
          <div>
            <strong>Easy edit</strong>
            <p>Selected {String(member.name)}. Type the Member ID — that number becomes the barcode.</p>
            {gingrBarcodeValue(member as unknown as MemberCardContext) ? (
              <p>Barcode will encode Member ID <strong>{gingrBarcodeValue(member as unknown as MemberCardContext)}</strong>.</p>
            ) : (
              <p className="cs-gingr-missing">Type a Member ID number to generate the barcode.</p>
            )}
          </div>
          <label className="cs-field">
            Member ID
            <input
              value={String(member.memberNumber ?? "")}
              onChange={(e) => setMember({ ...member, memberNumber: e.target.value, barcodeValue: e.target.value, barcodeSource: "custom" })}
              placeholder="Type the member ID number"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Member ID number"
            />
          </label>
          <label className="cs-field">
            Dog name
            <input
              value={String(member.dogName ?? "")}
              onChange={(e) => setMember({ ...member, dogName: e.target.value })}
              aria-label="Dog name"
            />
          </label>
          <div className="cs-actions">
            <label className="cs-btn cs-btn--primary">
              Replace photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file || !member) return;
                  const reader = new FileReader();
                  reader.onload = () => setMember(replaceMemberPhoto(member, String(reader.result ?? "")));
                  reader.readAsDataURL(file);
                }}
              />
            </label>
            {member.photoUrl ? (
              <button className="cs-btn" type="button" onClick={() => setMember(replaceMemberPhoto(member, null))}>Clear photo</button>
            ) : null}
          </div>
          {member.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={String(member.photoUrl)} alt="Card photo preview" className="cs-photo-preview" />
          ) : (
            <p>No photo yet. Replace photo fills the ID frame at the correct size — you do not need to crop or stretch it.</p>
          )}
        </div>
      ) : null}
      {member ? (
        <GingrIdentityPanel
          member={member as unknown as MemberCardContext}
          showInternalIds={showInternalIds}
          onMemberPatch={(patch) => setMember({ ...member, ...patch })}
        />
      ) : null}
      <div className="cs-actions" style={{ marginTop: 12 }}>
        <select className="cs-search" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
        </select>
        <select className="cs-search" value={printerId} onChange={(e) => setPrinterId(e.target.value)}>
          {printers.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)} · {String(p.mode ?? p.adapter_id)}</option>)}
        </select>
        <select className="cs-search" value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="front">Front only</option>
          <option value="back">Back only</option>
          <option value="duplex">Front + Back (manual flip on a normal printer)</option>
        </select>
        <button className="cs-btn" onClick={() => void runPreview()}>Preview / Validate</button>
        <button className="cs-btn" onClick={() => setPrinterId("os-office")}>Use normal printer</button>
      </div>
      {caps.automaticDuplex === false ? (
        <p>This printer does not support automatic duplex printing. Manual back-side printing is available — print FRONT, flip the sheet, then print BACK.</p>
      ) : null}
      {printerId === "os-office" ? (
        <p>OS Driver Mode: the system print dialog will open. Set scale to <strong>Actual size / 100%</strong>. Cut on the crop marks. The card is not issued until you confirm it printed.</p>
      ) : null}
      {preview?.issues?.length ? (
        <div className="cs-card">
          {preview.issues.map((issue, i) => <p key={i}>{issue.severity}: {issue.message}</p>)}
          <label><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override warnings</label>
        </div>
      ) : null}
      {preview?.frontSvg ? (
        <div className="cs-kpi-grid" style={{ marginTop: 16 }}>
          <div className="cs-card" dangerouslySetInnerHTML={{ __html: preview.frontSvg }} />
          <div className="cs-card" dangerouslySetInnerHTML={{ __html: preview.backSvg ?? "" }} />
        </div>
      ) : null}
      <div className="cs-actions" style={{ marginTop: 16 }}>
        <button
          className="cs-btn cs-btn--primary"
          disabled={!member || !templateId || !gingrBarcodeValue((member ?? {}) as unknown as MemberCardContext)}
          onClick={() => void printCard()}
        >
          {printerId === "os-office" ? "Print on this computer" : "Print Cards"}
        </button>
      </div>
      {printError ? <p>{printError}</p> : null}
      {result ? (
        <div className="cs-card" style={{ marginTop: 16 }}>
          <h3>{result.ok ? (result.osPrint ? "Print dialog opened" : "Result") : "Print blocked"}</h3>
          {Array.isArray(result.issues) ? (
            <div>
              {(result.issues as Array<{ message?: string; severity?: string }>).map((issue, i) => (
                <p key={i}>{issue.severity}: {issue.message}</p>
              ))}
            </div>
          ) : null}
          {result.osPrint ? (
            <div className="cs-actions">
              <button className="cs-btn cs-btn--primary" onClick={() => void confirmOs(true)}>Card printed successfully</button>
              <button className="cs-btn" onClick={() => void confirmOs(false)}>It did not print</button>
              {result.artwork ? (
                <button className="cs-btn" onClick={() => openOsPrintDialog({
                  frontSvg: (result.artwork as { frontSvg?: string }).frontSvg,
                  backSvg: (result.artwork as { backSvg?: string }).backSvg,
                  mode: mode as PrintMode,
                  jobId: String((result.job as { job_id?: string } | undefined)?.job_id ?? ""),
                  cardNumber: String((result.card as { card_number?: string } | undefined)?.card_number ?? ""),
                  memberName: String(member?.name ?? "")
                })}>Print again</button>
              ) : null}
            </div>
          ) : result.print ? (
            <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(result.print, null, 2)}</pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PrintQueueView() {
  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  async function load() {
    const res = await fetch("/api/card-studio/print-jobs", { credentials: "same-origin" });
    const json = await res.json();
    setJobs(json.jobs ?? []);
  }
  useEffect(() => { void load(); }, []);
  async function act(id: string, action: string, confirmDuplicate = false) {
    const body: Record<string, unknown> = { id, action, confirmDuplicate };
    if (action === "confirm-os-print") body.printed = true;
    await fetch("/api/card-studio/print-jobs", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    void load();
  }
  return (
    <div>
      <div className="cs-page-title"><div><h1>Print Queue</h1><p>Jobs are never silently marked printed.</p></div></div>
      <table className="cs-table">
        <thead><tr><th>Job</th><th>Status</th><th>Printer</th><th>Error</th><th></th></tr></thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={String(job.id)}>
              <td>{String(job.job_id)}</td>
              <td><span className="cs-status">{String(job.status)}</span></td>
              <td>{String(job.printer_id)}</td>
              <td>{String(job.error_message ?? "")}</td>
              <td className="cs-actions">
                {job.printer_id === "os-office" && job.status === "unknown" ? (
                  <>
                    <button className="cs-btn cs-btn--primary" onClick={() => void act(String(job.id), "confirm-os-print", false)}>Card printed</button>
                    <button className="cs-btn" onClick={() => {
                      fetch("/api/card-studio/print-jobs", {
                        method: "PATCH",
                        credentials: "same-origin",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ id: job.id, action: "confirm-os-print", printed: false })
                      }).then(() => void load());
                    }}>Did not print</button>
                  </>
                ) : null}
                <button className="cs-btn" onClick={() => void act(String(job.id), "pause")}>Pause</button>
                <button className="cs-btn" onClick={() => void act(String(job.id), "resume")}>Resume</button>
                <button className="cs-btn" onClick={() => void act(String(job.id), "retry")}>Retry</button>
                <button className="cs-btn cs-btn--danger" onClick={() => void act(String(job.id), "cancel")}>Cancel</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PrinterManager() {
  const { canManagePrinters } = useCardStudioAccess();
  const [printers, setPrinters] = useState<Array<Record<string, unknown>>>([]);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [profile, setProfile] = useState({ xOffsetMm: 0, yOffsetMm: 0, scale: 1, rotation: 0, frontOffsetXMm: 0, frontOffsetYMm: 0, backOffsetXMm: 0, backOffsetYMm: 0, bleedMm: 3, printableInsetMm: 3 });

  async function load() {
    const res = await fetch("/api/card-studio/printers", { credentials: "same-origin" });
    const json = await res.json();
    setPrinters(json.printers ?? []);
  }
  useEffect(() => { void load(); }, []);

  async function openPrinter(id: string) {
    const res = await fetch(`/api/card-studio/printers?id=${id}`, { credentials: "same-origin" });
    const json = await res.json();
    setSelected(json.printer);
  }

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Printers</h1>
          <p>Meantime printing uses This computer (normal printer) in OS Driver Mode. Native ID-card SDKs are not faked.</p>
        </div>
        {canManagePrinters ? (
          <button className="cs-btn" onClick={() => fetch("/api/card-studio/printers", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "discover" }) }).then(load)}>Refresh / Discover</button>
        ) : null}
      </div>
      <div className="cs-kpi-grid">
        {printers.map((p) => (
          <button key={String(p.id)} className="cs-card" onClick={() => void openPrinter(String(p.id))}>
            <h3>{String(p.manufacturer)} · {String(p.mode)}</h3>
            <strong style={{ fontSize: 16 }}>{String(p.name)}</strong>
            <p className="cs-status">{String(p.status_code)}</p>
            <p>{String(p.status_message ?? "")}</p>
          </button>
        ))}
      </div>
      {selected ? (
        <div className="cs-card" style={{ marginTop: 16 }}>
          <h3>{String(selected.name)}</h3>
          <p>Mode: {String(selected.mode)}</p>
          <p>Adapter installed: {String(selected.adapterInstalled)}</p>
          <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(selected.capabilities, null, 2)}</pre>
          {canManagePrinters ? (
            <>
              <h3>Calibration</h3>
              {Object.entries(profile).map(([key, value]) => (
                <label key={key} className="cs-field">{key}<input type="number" value={Number(value)} onChange={(e) => setProfile((p) => ({ ...p, [key]: Number(e.target.value) }))} /></label>
              ))}
              <button className="cs-btn cs-btn--primary" onClick={() => fetch("/api/card-studio/printers", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "calibrate", printerId: selected.id, profile }) })}>Save profile</button>
              <button className="cs-btn" onClick={() => fetch("/api/card-studio/printers", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "test", printerId: selected.id }) })}>Test print</button>
            </>
          ) : <p>Printer administration is limited to Admin.</p>}
        </div>
      ) : null}
    </div>
  );
}

export function IssuedCardsView() {
  const [cards, setCards] = useState<Array<Record<string, unknown>>>([]);
  const [q, setQ] = useState("");
  const [reason, setReason] = useState("lost_card");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => {
      fetch(`/api/card-studio/cards?q=${encodeURIComponent(q)}`, { credentials: "same-origin" }).then((r) => r.json()).then((j) => setCards(j.cards ?? []));
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);
  return (
    <div>
      <div className="cs-page-title"><div><h1>Issued Cards</h1><p>Reprint requires a reason. Revocation is recorded.</p></div></div>
      <input className="cs-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cards" />
      <table className="cs-table">
        <thead><tr><th>Number</th><th>Member</th><th>Status</th><th>Template ver</th><th></th></tr></thead>
        <tbody>
          {cards.map((card) => (
            <tr key={String(card.id)}>
              <td>{String(card.card_number)}</td>
              <td>{String(card.member_name)} · {String(card.dog_name ?? "")}</td>
              <td><span className="cs-status">{String(card.status)}</span></td>
              <td>{String(card.template_version ?? "")}</td>
              <td className="cs-actions">
                <select value={reason} onChange={(e) => setReason(e.target.value)}>
                  <option value="lost_card">Lost Card</option>
                  <option value="damaged_card">Damaged Card</option>
                  <option value="updated_photo">Updated Photo</option>
                  <option value="membership_upgrade">Membership Upgrade</option>
                  <option value="printer_error">Printer Error</option>
                  <option value="incorrect_print">Incorrect Print</option>
                  <option value="other">Other</option>
                </select>
                <input placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
                <button className="cs-btn" onClick={() => fetch("/api/card-studio/cards", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: card.id, action: "reprint", reason, notes, printerId: "sim-cr80" }) })}>Reprint</button>
                <button className="cs-btn cs-btn--danger" onClick={() => fetch("/api/card-studio/cards", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: card.id, action: "revoke" }) })}>Revoke</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryView() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    fetch("/api/card-studio/settings", { credentials: "same-origin" }).then((r) => r.json()).then((j) => setRows(j.history ?? []));
  }, []);
  return (
    <div>
      <div className="cs-page-title"><div><h1>Card History</h1><p>Audit trail for templates, prints, reprints, and printer changes.</p></div></div>
      <table className="cs-table">
        <thead><tr><th>When</th><th>User</th><th>Role</th><th>Action</th><th>Resource</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={String(row.id)}>
              <td>{String(row.created_at)}</td>
              <td>{String(row.actor_email ?? "")}</td>
              <td>{String(row.actor_role ?? "")}</td>
              <td>{String(row.action)}</td>
              <td>{String(row.resource_type)} {String(row.resource_id ?? "")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsView() {
  const { canManageSettings } = useCardStudioAccess();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  useEffect(() => {
    fetch("/api/card-studio/settings", { credentials: "same-origin" }).then((r) => r.json()).then((j) => setSettings(j.settings ?? {}));
  }, []);
  return (
    <div>
      <div className="cs-page-title"><div><h1>Card Studio Settings</h1><p>System defaults. Hardware administration stays Admin-only.</p></div></div>
      <div className="cs-card">
        <label className="cs-field">Default DPI<input type="number" value={Number(settings.defaultDpi ?? 300)} onChange={(e) => setSettings((s) => ({ ...s, defaultDpi: Number(e.target.value) }))} disabled={!canManageSettings} /></label>
        <label className="cs-field">Safe zone mm<input type="number" value={Number(settings.defaultSafeMm ?? 3)} onChange={(e) => setSettings((s) => ({ ...s, defaultSafeMm: Number(e.target.value) }))} disabled={!canManageSettings} /></label>
        <label className="cs-field">Bleed mm<input type="number" value={Number(settings.defaultBleedMm ?? 3)} onChange={(e) => setSettings((s) => ({ ...s, defaultBleedMm: Number(e.target.value) }))} disabled={!canManageSettings} /></label>
        <label className="cs-field">Verification base URL<input value={String(settings.verificationBaseUrl ?? "")} onChange={(e) => setSettings((s) => ({ ...s, verificationBaseUrl: e.target.value }))} disabled={!canManageSettings} /></label>
        {canManageSettings ? (
          <button className="cs-btn cs-btn--primary" onClick={() => fetch("/api/card-studio/settings", { method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(settings) })}>Save settings</button>
        ) : <p>Marketing can view these defaults. Admin can change them.</p>}
      </div>
    </div>
  );
}

export function BatchPrintView() {
  const wizard = useMemo(() => null, []);
  return (
    <div>
      <div className="cs-page-title"><div><h1>Batch Print</h1><p>Select multiple members, one template, then queue jobs. Failed cards retry individually.</p></div></div>
      <IssueWizard />
      {wizard}
    </div>
  );
}
