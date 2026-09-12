"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CR80_PX, DEFAULT_DPI, FITDOG_APPROVED_LOGO, mmToPx } from "@/lib/card-studio/constants";
import { cloneDocument, createElement, emptyTemplateDocument, parseTemplateDocument } from "@/lib/card-studio/template-schema";
import {
  CLUB_SPORTS_VIP_BUILTIN_ID,
  CLUB_SPORTS_VIP_TEMPLATE_NAME,
  createClubSportsVipTemplateDocument,
  isClubSportsVipBuiltinId,
  isClubSportsVipTemplate
} from "@/lib/card-studio/club-sports-vip-template";
import type { CardElement, CardElementType, CardSide, CardTemplateDocument, MemberCardContext } from "@/lib/card-studio/types";
import { resolveTemplateString } from "@/lib/card-studio/dynamic-fields";
import { emptyMemberContext } from "@/lib/card-studio/dynamic-fields";
import { openOsPrintDialog } from "@/components/card-studio/open-os-print";
import { pruneStackedMemberPhotos, replaceMemberPhoto } from "@/lib/card-studio/photo-slot";
import { gingrBarcodeValue } from "@/lib/card-studio/gingr-identity";

const TOOLS: { type: CardElementType; label: string }[] = [
  { type: "text", label: "Text" },
  { type: "rich_text", label: "Rich text" },
  { type: "dynamic_field", label: "Dynamic field" },
  { type: "member_photo", label: "Member photo" },
  { type: "logo", label: "Logo" },
  { type: "image", label: "Image" },
  { type: "svg", label: "SVG" },
  { type: "rectangle", label: "Rectangle" },
  { type: "rounded_rectangle", label: "Rounded rect" },
  { type: "circle", label: "Circle" },
  { type: "line", label: "Line" },
  { type: "icon", label: "Icon" },
  { type: "qr_code", label: "QR code" },
  { type: "barcode", label: "Barcode" },
  { type: "signature", label: "Signature" },
  { type: "watermark", label: "Watermark" },
  { type: "date", label: "Date" },
  { type: "expiration_date", label: "Expiration" },
  { type: "member_number", label: "Member number" },
  { type: "membership_type", label: "Membership type" },
  { type: "location", label: "Location" },
  { type: "custom_field", label: "Custom field" }
];

export function CardDesigner() {
  const params = useSearchParams();
  const templateId = params.get("id");
  const isNew = params.get("new") === "1";
  const [doc, setDoc] = useState<CardTemplateDocument>(() => createClubSportsVipTemplateDocument());
  const [name, setName] = useState(CLUB_SPORTS_VIP_TEMPLATE_NAME);
  const [side, setSide] = useState<CardSide>("front");
  const [selected, setSelected] = useState<string[]>([]);
  const [zoom, setZoom] = useState(0.55);
  const [grid, setGrid] = useState(true);
  const [guides, setGuides] = useState(true);
  const [snap, setSnap] = useState(true);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");
  const [id, setId] = useState<string | null>(templateId || CLUB_SPORTS_VIP_BUILTIN_ID);
  const history = useRef<CardTemplateDocument[]>([]);
  const future = useRef<CardTemplateDocument[]>([]);
  const skipAutosave = useRef(false);
  const [previewMember, setPreviewMember] = useState<MemberCardContext>(() => ({
    ...emptyMemberContext(),
    name: "Alex Rivera",
    dogName: "",
    membershipType: "Club + Sports Member",
    memberNumber: "",
    gingrAnimalId: "",
    location: "SANTA MONICA, CA",
    expirationDate: "2027-09-01",
    photoUrl: "",
    cardUuid: "preview"
  }));
  const [memberQuery, setMemberQuery] = useState("");
  const [memberHits, setMemberHits] = useState<MemberCardContext[]>([]);
  const photoInput = useRef<HTMLInputElement>(null);

  const pushHistory = useCallback((next: CardTemplateDocument) => {
    history.current = [...history.current.slice(-49), cloneDocument(doc)];
    future.current = [];
    setDoc(next);
    setSaveState("unsaved");
  }, [doc]);

  useEffect(() => {
    if (isNew) {
      setId(null);
      setName("Untitled template");
      setDoc(emptyTemplateDocument());
      setSaveState("saved");
      return;
    }
    if (templateId && !isClubSportsVipBuiltinId(templateId)) {
      fetch(`/api/card-studio/templates?id=${templateId}`, { credentials: "same-origin" })
        .then((res) => res.json())
        .then((json) => {
          if (json.template) {
            setId(json.template.id);
            setName(json.template.name);
            const loaded = parseTemplateDocument(json.template.document);
            setDoc(
              isClubSportsVipTemplate({ id: json.template.id, name: json.template.name, document: loaded })
                ? createClubSportsVipTemplateDocument()
                : pruneStackedMemberPhotos(loaded)
            );
            setSaveState("saved");
          }
        })
        .catch(() => undefined);
      return;
    }
    fetch("/api/card-studio/templates?status=active", { credentials: "same-origin" })
      .then((res) => res.json())
      .then(async (json) => {
        const club = (json.templates ?? []).find((tpl: { id?: string; name?: string }) => {
          return String(tpl.name).includes("Club + Sports") && tpl.id && !isClubSportsVipBuiltinId(String(tpl.id));
        });
        if (club?.id) {
          const detail = await fetch(`/api/card-studio/templates?id=${club.id}`, { credentials: "same-origin" }).then((r) => r.json());
          if (detail.template) {
            setId(detail.template.id);
            setName(detail.template.name);
            const loaded = parseTemplateDocument(detail.template.document);
            setDoc(
              isClubSportsVipTemplate({ id: detail.template.id, name: detail.template.name, document: loaded })
                ? createClubSportsVipTemplateDocument()
                : pruneStackedMemberPhotos(loaded)
            );
            setSaveState("saved");
            return;
          }
        }
        setId(CLUB_SPORTS_VIP_BUILTIN_ID);
        setName(CLUB_SPORTS_VIP_TEMPLATE_NAME);
        setDoc(createClubSportsVipTemplateDocument());
        setSaveState("saved");
      })
      .catch(() => {
        setId(CLUB_SPORTS_VIP_BUILTIN_ID);
        setName(CLUB_SPORTS_VIP_TEMPLATE_NAME);
        setDoc(createClubSportsVipTemplateDocument());
        setSaveState("saved");
      });
  }, [templateId, isNew]);

  useEffect(() => {
    if (memberQuery.trim().length < 2) {
      setMemberHits([]);
      return;
    }
    const timer = window.setTimeout(() => {
      fetch(`/api/card-studio/members?q=${encodeURIComponent(memberQuery)}`, { credentials: "same-origin" })
        .then((res) => res.json())
        .then((json) => setMemberHits(json.members ?? []));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [memberQuery]);

  useEffect(() => {
    if (saveState !== "unsaved" || skipAutosave.current) return;
    const timer = window.setTimeout(() => {
      void save(false);
    }, 1600);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, name, saveState]);

  async function save(bumpVersion: boolean) {
    setSaveState("saving");
    const persistNew = !id || isClubSportsVipBuiltinId(id);
    const documentToSave = isClubSportsVipTemplate({ id, name, document: doc })
      ? createClubSportsVipTemplateDocument()
      : pruneStackedMemberPhotos(doc);
    const res = await fetch("/api/card-studio/templates", {
      method: persistNew ? "POST" : "PATCH",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        persistNew
          ? { name, document: documentToSave, category: "club_sports_vip", status: "active" }
          : { id, name, document: documentToSave, bumpVersion, status: "active" }
      )
    });
    const json = await res.json();
    if (json.template?.id) setId(json.template.id);
    setSaveState("saved");
  }

  const design = doc[side];
  const selectedEl = design.elements.find((el) => el.id === selected[0]);
  const scale = zoom;
  const bleed = mmToPx(doc.bleedMm);
  const safe = mmToPx(doc.safeMm);

  function updateSelected(patch: Partial<CardElement> | { properties: Record<string, unknown> }) {
    const next = cloneDocument(doc);
    next[side].elements = design.elements.map((el) => {
      if (!selected.includes(el.id)) return el;
      if ("properties" in patch && patch.properties) {
        return { ...el, properties: { ...el.properties, ...patch.properties } };
      }
      return { ...el, ...(patch as Partial<CardElement>) };
    });
    pushHistory(next);
  }

  function addTool(type: CardElementType) {
    if (type === "member_photo") {
      const next = pruneStackedMemberPhotos(doc);
      const existing = next[side].elements.find((el) => el.type === "member_photo");
      if (existing) {
        setDoc(next);
        setSelected([existing.id]);
        return;
      }
    }
    const el = createElement(type);
    if (type === "logo") el.properties.src = FITDOG_APPROVED_LOGO;
    const next = cloneDocument(doc);
    next[side].elements.push(el);
    pushHistory(next);
    setSelected([el.id]);
  }

  function onPointerDown(event: React.PointerEvent, el: CardElement) {
    setSelected([el.id]);
    if (el.locked) return;
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const origX = el.x;
    const origY = el.y;
    function move(ev: PointerEvent) {
      const dx = (ev.clientX - startX) / scale;
      const dy = (ev.clientY - startY) / scale;
      let x = origX + dx;
      let y = origY + dy;
      if (snap) {
        x = Math.round(x / 8) * 8;
        y = Math.round(y / 8) * 8;
      }
      const next = cloneDocument(doc);
      next[side].elements = next[side].elements.map((item) => (item.id === el.id ? { ...item, x, y } : item));
      setDoc(next);
      setSaveState("unsaved");
    }
    function up() {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function layer(action: "front" | "back" | "forward" | "backward") {
    const next = cloneDocument(doc);
    const list = [...next[side].elements];
    const index = list.findIndex((el) => el.id === selected[0]);
    if (index < 0) return;
    const [item] = list.splice(index, 1);
    if (!item) return;
    if (action === "front") list.push(item);
    else if (action === "back") list.unshift(item);
    else if (action === "forward") list.splice(Math.min(list.length, index + 1), 0, item);
    else list.splice(Math.max(0, index - 1), 0, item);
    next[side].elements = list;
    pushHistory(next);
  }

  return (
    <div>
      <div className="cs-page-title">
        <div>
          <h1>Card Designer</h1>
          <p>CR80 / ID-1 · {CR80_PX.width}×{CR80_PX.height}px · {DEFAULT_DPI} DPI</p>
        </div>
        <div className="cs-actions">
          <input className="cs-search" value={name} onChange={(e) => { setName(e.target.value); setSaveState("unsaved"); }} aria-label="Template name" />
          <span>{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : "Unsaved changes"}</span>
        </div>
      </div>
      {doc.front.elements.some((el) => el.type === "member_photo" || String(el.properties.text ?? "").includes("member.dog_name")) ? (
        <div className="cs-quick-edit">
          <div>
            <strong>Easy edit</strong>
            <p>Type the Member ID number. That same number prints on the front and becomes the barcode on the back. Replace photo fills the ID frame — you do not need to resize it.</p>
          </div>
          <label className="cs-field">
            Search member
            <input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="Dog, owner, phone, email"
              aria-label="Search member"
            />
          </label>
          {memberHits.length ? (
            <div className="cs-actions">
              {memberHits.slice(0, 8).map((hit, index) => (
                <button
                  key={String(hit.opsDogId || hit.fitdogDogId || index)}
                  className="cs-btn"
                  type="button"
                  onClick={() => {
                    setPreviewMember({
                      ...emptyMemberContext(),
                      ...hit,
                      dogName: hit.dogName ?? "",
                      gingrAnimalId: hit.gingrAnimalId ?? "",
                      memberNumber: previewMember.memberNumber || hit.gingrOwnerBarcode || "",
                      photoUrl: hit.photoUrl ?? "",
                      cardUuid: "preview"
                    });
                    setDoc(createClubSportsVipTemplateDocument());
                    setMemberQuery("");
                    setMemberHits([]);
                  }}
                >
                  {hit.name} · {hit.dogName || "dog"}
                </button>
              ))}
            </div>
          ) : null}
          <label className="cs-field">
            Member ID
            <input
              value={previewMember.memberNumber ?? ""}
              onChange={(e) => {
                const memberNumber = e.target.value;
                setPreviewMember((m) => ({
                  ...m,
                  memberNumber,
                  barcodeSource: "custom",
                  barcodeValue: memberNumber
                }));
              }}
              placeholder="Type the member ID number"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Member ID number"
            />
          </label>
          <p className="cs-id-note">
            {gingrBarcodeValue(previewMember)
              ? `Barcode will encode: ${gingrBarcodeValue(previewMember)}`
              : "Enter a Member ID to generate the barcode."}
          </p>
          <label className="cs-field">
            Dog name
            <input
              value={previewMember.dogName ?? ""}
              onChange={(e) => setPreviewMember((m) => ({ ...m, dogName: e.target.value }))}
              aria-label="Dog name"
            />
          </label>
          <div className="cs-actions">
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  setPreviewMember((m) => replaceMemberPhoto(m, String(reader.result ?? "")));
                  setDoc((current) =>
                    isClubSportsVipTemplate({ id, name, document: current })
                      ? createClubSportsVipTemplateDocument()
                      : pruneStackedMemberPhotos(current)
                  );
                  if (photoInput.current) photoInput.current.value = "";
                };
                reader.readAsDataURL(file);
              }}
            />
            <button className="cs-btn cs-btn--primary" type="button" onClick={() => photoInput.current?.click()}>
              Replace photo
            </button>
            {previewMember.photoUrl ? (
              <button className="cs-btn" type="button" onClick={() => setPreviewMember((m) => replaceMemberPhoto(m, null))}>
                Clear photo
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="cs-designer">
        <div className="cs-designer__toolbar">
          <button className="cs-btn" onClick={() => { const prev = history.current.pop(); if (prev) { future.current.push(cloneDocument(doc)); setDoc(prev); } }}>Undo</button>
          <button className="cs-btn" onClick={() => { const next = future.current.pop(); if (next) { history.current.push(cloneDocument(doc)); setDoc(next); } }}>Redo</button>
          <button className="cs-btn" onClick={() => void save(false)}>Save</button>
          <button className="cs-btn" onClick={() => void save(true)}>Save As version</button>
          <button
            className="cs-btn"
            onClick={() => {
              void (async () => {
                const res = await fetch("/api/card-studio/preview", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    document: isClubSportsVipTemplate({ id, name, document: doc })
                      ? createClubSportsVipTemplateDocument()
                      : pruneStackedMemberPhotos(doc),
                    member: previewMember,
                    mode: "duplex",
                    printerId: "os-office"
                  })
                });
                const json = await res.json();
                if (!json.frontSvg) throw new Error(json.error || "Could not render a print proof.");
                openOsPrintDialog({
                  frontSvg: json.frontSvg,
                  backSvg: json.backSvg,
                  mode: "duplex",
                  jobId: "DESIGNER-PROOF",
                  cardNumber: previewMember.memberNumber,
                  memberName: previewMember.name
                });
              })();
            }}
          >
            Print on this computer
          </button>
          <button className={`cs-btn ${side === "front" ? "cs-btn--primary" : ""}`} onClick={() => setSide("front")}>Front</button>
          <button className={`cs-btn ${side === "back" ? "cs-btn--primary" : ""}`} onClick={() => setSide("back")}>Back</button>
          <label>Zoom <input type="range" min={0.35} max={1.4} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
          <label><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} /> Grid</label>
          <label><input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guides</label>
          <label><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
        </div>
        <aside className="cs-tools">
          <h3>Elements</h3>
          {TOOLS.map((tool) => (
            <button key={tool.type} className="cs-btn" style={{ width: "100%", marginBottom: 6 }} onClick={() => addTool(tool.type)}>
              {tool.label}
            </button>
          ))}
        </aside>
        <div className="cs-canvas-wrap" style={grid ? undefined : { backgroundImage: "none" }}>
          <div
            className="cs-card-canvas"
            style={{ width: design.width * scale, height: design.height * scale }}
            onMouseDown={() => setSelected([])}
          >
            <div style={{ width: design.width, height: design.height, transform: `scale(${scale})`, transformOrigin: "top left" }}>
              {guides ? (
                <>
                  <div className="cs-guide" style={{ left: safe, top: safe, width: design.width - safe * 2, height: design.height - safe * 2 }} />
                  <div className="cs-guide" style={{ left: -bleed, top: -bleed, width: design.width + bleed * 2, height: design.height + bleed * 2, borderStyle: "solid", borderColor: "rgba(251,113,133,0.35)" }} />
                </>
              ) : null}
              {design.elements.map((el) => (
                <div
                  key={el.id}
                  className={`cs-el ${selected.includes(el.id) ? "is-selected" : ""} ${el.locked ? "is-locked" : ""}`}
                  hidden={el.hidden}
                  style={{
                    left: el.x,
                    top: el.y,
                    width: el.width,
                    height: el.height,
                    transform: `rotate(${el.rotation}deg)`,
                    opacity: Number(el.properties.opacity ?? 1)
                  }}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    onPointerDown(event, el);
                  }}
                >
                  <ElementPreview el={el} member={previewMember} />
                </div>
              ))}
            </div>
          </div>
        </div>
        <aside className="cs-props">
          <h3>Properties</h3>
          {!selectedEl ? <p>Select an element.</p> : (
            <>
              {selectedEl.locked ? (
                <p className="cs-id-note">This slot is locked to the template. Replace photo fills the ID frame at the correct size.</p>
              ) : (
                <>
                  <label className="cs-field">X<input type="number" value={selectedEl.x} onChange={(e) => updateSelected({ x: Number(e.target.value) })} /></label>
                  <label className="cs-field">Y<input type="number" value={selectedEl.y} onChange={(e) => updateSelected({ y: Number(e.target.value) })} /></label>
                  <label className="cs-field">Width<input type="number" value={selectedEl.width} onChange={(e) => updateSelected({ width: Number(e.target.value) })} /></label>
                  <label className="cs-field">Height<input type="number" value={selectedEl.height} onChange={(e) => updateSelected({ height: Number(e.target.value) })} /></label>
                  <label className="cs-field">Rotation<input type="number" value={selectedEl.rotation} onChange={(e) => updateSelected({ rotation: Number(e.target.value) })} /></label>
                </>
              )}
              {"text" in selectedEl.properties ? (
                <>
                  <label className="cs-field">Text<textarea value={String(selectedEl.properties.text ?? "")} onChange={(e) => updateSelected({ properties: { text: e.target.value } })} /></label>
                  <label className="cs-field">Font size<input type="number" value={Number(selectedEl.properties.fontSize ?? 16)} onChange={(e) => updateSelected({ properties: { fontSize: Number(e.target.value) } })} /></label>
                  <label className="cs-field">Weight<input type="number" value={Number(selectedEl.properties.fontWeight ?? 600)} onChange={(e) => updateSelected({ properties: { fontWeight: Number(e.target.value) } })} /></label>
                  <label className="cs-field">Color<input type="color" value={String(selectedEl.properties.color ?? "#ffffff")} onChange={(e) => updateSelected({ properties: { color: e.target.value } })} /></label>
                </>
              ) : null}
              {selectedEl.type === "barcode" ? (
                <>
                  <p className="cs-id-note">Barcode is generated from the Member ID field.</p>
                  <p className="cs-id-note">Value: {gingrBarcodeValue(previewMember) || "(type a Member ID)"}</p>
                  <p className="cs-id-note">Human-readable: {gingrBarcodeValue(previewMember) || "—"}</p>
                </>
              ) : null}
              {selectedEl.type === "member_photo" && !selectedEl.locked ? (
                <>
                  <label className="cs-field">Frame
                    <select value={String(selectedEl.properties.frame ?? "rounded_id")} onChange={(e) => updateSelected({ properties: { frame: e.target.value } })}>
                      <option value="portrait">Portrait</option>
                      <option value="square">Square</option>
                      <option value="circle">Circle</option>
                      <option value="rounded_id">Rounded ID</option>
                      <option value="passport">Passport-style</option>
                    </select>
                  </label>
                  <label className="cs-field">Zoom<input type="number" step="0.05" value={Number(selectedEl.properties.zoom ?? 1)} onChange={(e) => updateSelected({ properties: { zoom: Number(e.target.value) } })} /></label>
                  <label className="cs-field">Position X<input type="number" value={Number(selectedEl.properties.cropX ?? 50)} onChange={(e) => updateSelected({ properties: { cropX: Number(e.target.value) } })} /></label>
                  <label className="cs-field">Position Y<input type="number" value={Number(selectedEl.properties.cropY ?? 50)} onChange={(e) => updateSelected({ properties: { cropY: Number(e.target.value) } })} /></label>
                </>
              ) : null}
              <label className="cs-field"><input type="checkbox" checked={Boolean(selectedEl.locked)} onChange={(e) => updateSelected({ locked: e.target.checked })} /> Lock</label>
              <label className="cs-field"><input type="checkbox" checked={!selectedEl.hidden} onChange={(e) => updateSelected({ hidden: !e.target.checked })} /> Visible</label>
              <div className="cs-actions">
                <button className="cs-btn" onClick={() => layer("forward")}>Bring forward</button>
                <button className="cs-btn" onClick={() => layer("backward")}>Send backward</button>
                <button className="cs-btn" onClick={() => layer("front")}>Bring to front</button>
                <button className="cs-btn" onClick={() => layer("back")}>Send to back</button>
                <button className="cs-btn cs-btn--danger" onClick={() => {
                  const next = cloneDocument(doc);
                  next[side].elements = design.elements.filter((el) => !selected.includes(el.id));
                  pushHistory(next);
                  setSelected([]);
                }}>Delete</button>
              </div>
            </>
          )}
        </aside>
        <div className="cs-designer__status">
          {design.width}×{design.height}px · {doc.dpi} DPI · Zoom {Math.round(zoom * 100)}% · Safe {doc.safeMm}mm · Bleed {doc.bleedMm}mm · CR80
        </div>
      </div>
    </div>
  );
}

function ElementPreview({ el, member }: { el: CardElement; member: MemberCardContext }) {
  let text = resolveTemplateString(String(el.properties.text ?? el.type), member);
  if (el.properties.textTransform === "uppercase") text = text.toUpperCase();
  if (!text && el.properties.keepArtworkWhenEmpty && el.properties.text) return null;
  if (el.type === "svg" || el.type === "icon") {
    const markup = String(el.properties.markup ?? "");
    if (markup) {
      return <div style={{ width: "100%", height: "100%", overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: markup }} />;
    }
  }
  if (el.type === "member_photo" || el.type === "logo" || el.type === "image") {
    const src = resolveTemplateString(String(el.properties.src ?? ""), member) || (el.type === "logo" ? FITDOG_APPROVED_LOGO : "");
    if (!src && el.properties.keepArtworkWhenEmpty) return null;
    const radius = el.properties.frame === "circle" ? "50%" : `${Number(el.properties.borderRadius ?? 16)}px`;
    const zoom = el.type === "member_photo" ? Math.max(1, Number(el.properties.zoom ?? 1)) : Number(el.properties.zoom ?? 1);
    const fit = el.type === "member_photo" ? "cover" : el.properties.fit === "contain" ? "contain" : "cover";
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden", borderRadius: el.properties.exactArtwork ? 0 : radius, background: el.type === "member_photo" && src ? "#ffffff" : el.properties.exactArtwork ? "transparent" : "#1e293b" }}>
        {src ? (
          <img
            src={src}
            alt=""
            style={{
              width: "100%",
              height: "100%",
              objectFit: fit,
              objectPosition: `${Number(el.properties.cropX ?? 50)}% ${Number(el.properties.cropY ?? 50)}%`,
              transform: `scale(${zoom}) rotate(${Number(el.properties.rotate ?? 0)}deg)`
            }}
          />
        ) : (
          <span style={{ fontSize: 11, color: "#94a3b8", padding: 8, display: "block" }}>Photo frame</span>
        )}
      </div>
    );
  }
  if (el.type === "qr_code" || el.type === "barcode") {
    const barcode = gingrBarcodeValue(member);
    if (el.type === "barcode" && el.properties.keepArtworkWhenEmpty && !barcode) return null;
    return (
      <div style={{ width: "100%", height: "100%", background: "#fff", color: "#0b1b2b", display: "grid", placeItems: "center", fontSize: 10, textAlign: "center", padding: 4 }}>
        {el.type === "qr_code" ? "QR" : barcode ? `Barcode · ${barcode}` : "Type a Member ID"}
      </div>
    );
  }
  if (el.type === "rectangle" || el.type === "rounded_rectangle" || el.type === "circle" || el.type === "background" || el.type === "shape") {
    return <div style={{ width: "100%", height: "100%", background: String(el.properties.fill ?? "#4da3ff"), borderRadius: el.type === "circle" ? "50%" : Number(el.properties.borderRadius ?? 0) }} />;
  }
  return (
    <div style={{
      width: "100%",
      height: "100%",
      color: String(el.properties.color ?? "#fff"),
      fontSize: Number(el.properties.fontSize ?? 16),
      fontWeight: Number(el.properties.fontWeight ?? 600),
      fontStyle: el.properties.italic ? "italic" : "normal",
      background: String(el.properties.background ?? "transparent"),
      display: "flex",
      alignItems: String(el.properties.verticalAlign ?? "middle") === "top" ? "flex-start" : String(el.properties.verticalAlign) === "bottom" ? "flex-end" : "center",
      justifyContent: String(el.properties.textAlign ?? "left") === "center" ? "center" : String(el.properties.textAlign) === "right" ? "flex-end" : "flex-start"
    }}>
      {text}
    </div>
  );
}
