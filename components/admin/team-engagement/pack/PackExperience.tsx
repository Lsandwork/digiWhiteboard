"use client";

import "@/app/styles/the-pack.css";
import "@/app/styles/team-engagement.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import { humanizeUnknownError } from "@/lib/safe-url";
import { BARK_OUT_REACTION_EMOJI, BARK_OUT_REACTION_LABELS, type BarkOutReaction } from "@/lib/team-engagement/constants";

type BarkOutItem = {
  id: string;
  author: { userId: string | null; name: string; avatarUrl: string | null };
  recipient: { userId: string | null; name: string; avatarUrl: string | null; departments: string[] };
  category: { key: string; label: string };
  message: string;
  publishedAt: string | null;
  reactions: Record<BarkOutReaction, number>;
  myReactions: BarkOutReaction[];
};

type PackPayload = {
  storageReady: boolean;
  greeting: string;
  me: { userId: string; name: string; canPost: boolean };
  tagline: string;
  stats: {
    barkOutsThisMonth: number;
    barkOutsThisWeek: number;
    participationPercent: number;
    teamSize: number;
    newForMeThisWeek: number;
    pendingMyPosts: number;
  };
  activityFeed: BarkOutItem[];
  spotlight: BarkOutItem | null;
  personal: {
    receivedCount: number;
    sentCount: number;
    awaitingConfirmation: { id: string; recipientName: string; statusLabel: string }[];
  };
  sectionStatus: Record<string, { ready: boolean; message?: string }>;
};

type HomePayload = {
  recipients: { userId: string; name: string; title: string | null }[];
  categories: { key: string; label: string }[];
  limits: { message: number };
  participation: { minMessageLength: number };
};

type PackSection = "pack" | "bark_outs" | "milestones" | "goals" | "fun" | "voice" | "ideas";

const NAV: { id: PackSection; label: string }[] = [
  { id: "pack", label: "The Pack" },
  { id: "bark_outs", label: "Bark Outs" },
  { id: "milestones", label: "Milestones & Celebrations" },
  { id: "goals", label: "Pack Goals" },
  { id: "fun", label: "Fun Zone" },
  { id: "voice", label: "Employee Voice" },
  { id: "ideas", label: "Ideas for the Pack" }
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function Avatar({ name, url, size = 40 }: { name: string; url: string | null; size?: number }) {
  return (
    <span className="pack-avatar" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

function BarkOutCard({
  item,
  onReact
}: {
  item: BarkOutItem;
  onReact: (id: string, reaction: BarkOutReaction, add: boolean) => void;
}) {
  return (
    <article className="pack-feed__item">
      <div className="pack-people" style={{ marginBottom: 8 }}>
        <Avatar name={item.author.name} url={item.author.avatarUrl} />
        <div>
          <div className="pack-muted" style={{ fontSize: 12 }}>
            {item.author.name} → <strong style={{ color: "var(--pack-text)" }}>{item.recipient.name}</strong>
          </div>
          <span className="pack-pill" style={{ display: "inline-block", marginTop: 4, padding: "2px 8px", fontSize: 11, background: "var(--pack-sky)", color: "var(--pack-blue-deep)", border: 0 }}>
            {item.category.label}
          </span>
        </div>
      </div>
      <p style={{ margin: "0 0 8px", lineHeight: 1.45 }}>{item.message}</p>
      <div className="pack-reactions">
        {(Object.keys(BARK_OUT_REACTION_LABELS) as BarkOutReaction[]).map((reaction) => {
          const count = item.reactions[reaction] ?? 0;
          const mine = item.myReactions.includes(reaction);
          return (
            <button
              key={reaction}
              type="button"
              className={`pack-react ${mine ? "pack-react--mine" : ""}`}
              onClick={() => onReact(item.id, reaction, !mine)}
            >
              {BARK_OUT_REACTION_EMOJI[reaction]} {BARK_OUT_REACTION_LABELS[reaction]}
              {count > 0 ? ` · ${count}` : ""}
            </button>
          );
        })}
      </div>
    </article>
  );
}

function SectionEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="pack-card pack-empty">
      <h3 className="pack-card__title">{title}</h3>
      <p className="pack-muted">{body}</p>
    </div>
  );
}

export default function PackExperience() {
  const [section, setSection] = useState<PackSection>("pack");
  const [pack, setPack] = useState<PackPayload | null>(null);
  const [home, setHome] = useState<HomePayload | null>(null);
  const [feed, setFeed] = useState<BarkOutItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");

  const loadPack = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<PackPayload & { error?: string }>("/api/admin/bark-outs?view=pack");
    if (!ok) {
      setPack(null);
      setError((body as { error?: string }).error ?? "Team Engagement is not available.");
      return;
    }
    setPack(body);
    setError(null);
  }, []);

  const loadFeed = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<{ items: BarkOutItem[] }>("/api/admin/bark-outs?view=feed");
    if (ok) setFeed(body.items);
  }, []);

  const loadHome = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<HomePayload>("/api/admin/bark-outs?view=home");
    if (ok) setHome(body);
  }, []);

  useEffect(() => {
    void loadPack();
  }, [loadPack]);

  useEffect(() => {
    if (section === "bark_outs") void loadFeed();
  }, [section, loadFeed]);

  useEffect(() => {
    if (modalOpen && !home) void loadHome();
  }, [modalOpen, home, loadHome]);

  async function react(id: string, reaction: BarkOutReaction, add: boolean) {
    const action = add ? "react_bark_out" : "unreact_bark_out";
    await fetchAdminJson("/api/admin/bark-outs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, id, reaction })
    });
    await Promise.all([loadPack(), section === "bark_outs" ? loadFeed() : Promise.resolve()]);
  }

  async function submitBarkOut(event: React.FormEvent) {
    event.preventDefault();
    if (!home) return;
    setBusy(true);
    setError(null);
    try {
      const { ok, body } = await fetchAdminJson("/api/admin/bark-outs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_bark_out", recipientUserId: recipient, category, message })
      });
      if (!ok) throw new Error((body as { error?: string }).error ?? "Could not send Bark Out.");
      setModalOpen(false);
      setMessage("");
      await Promise.all([loadPack(), loadFeed()]);
    } catch (err) {
      setError(humanizeUnknownError(err, "Could not send Bark Out."));
    } finally {
      setBusy(false);
    }
  }

  const feedItems = useMemo(() => {
    if (section === "bark_outs") return feed;
    return pack?.activityFeed ?? [];
  }, [section, feed, pack]);

  if (error && !pack) {
    return <p className="ro-te-muted">{error}</p>;
  }

  if (!pack) {
    return (
      <div className="pack">
        <div className="pack-skel" style={{ height: 200 }} />
      </div>
    );
  }

  if (!pack.storageReady) {
    return <p className="ro-te-muted">Team Engagement is being set up. Run migration 103 on Supabase, then refresh.</p>;
  }

  return (
    <div className="pack">
      <header className="pack-hero">
        <div className="pack-hero__inner">
          <div>
            <p className="pack-muted" style={{ color: "rgba(255,255,255,0.85)", margin: "0 0 4px" }}>
              {pack.greeting}, {pack.me.name.split(" ")[0] ?? pack.me.name}
            </p>
            <h1 className="pack-hero__title">The Pack</h1>
            <p className="pack-hero__lede">
              {pack.tagline} Celebrate the people who make the difference. Every contribution matters.
            </p>
            <div className="pack-stats">
              <div className="pack-stat">
                <div className="pack-stat__label">Bark Outs this month</div>
                <div className="pack-stat__value">{pack.stats.barkOutsThisMonth}</div>
              </div>
              <div className="pack-stat">
                <div className="pack-stat__label">Team participation</div>
                <div className="pack-stat__value">{pack.stats.participationPercent}%</div>
              </div>
              <div className="pack-stat">
                <div className="pack-stat__label">Recognition for you</div>
                <div className="pack-stat__value">{pack.personal.receivedCount}</div>
              </div>
              <div className="pack-stat">
                <div className="pack-stat__label">Bark Outs you gave</div>
                <div className="pack-stat__value">{pack.personal.sentCount}</div>
              </div>
            </div>
          </div>
          <div className="pack-hero__actions">
            <span className="pack-pill">{pack.stats.barkOutsThisWeek} new this week</span>
            {pack.stats.pendingMyPosts > 0 ? <span className="pack-pill">{pack.stats.pendingMyPosts} awaiting review</span> : null}
            {pack.me.canPost ? (
              <button type="button" className="pack-btn pack-btn--primary" onClick={() => setModalOpen(true)}>
                + Give a Bark Out
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <nav className="pack-nav" aria-label="Team Engagement sections">
        {NAV.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pack-nav__btn ${section === item.id ? "pack-nav__btn--active" : ""}`}
            onClick={() => setSection(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {error ? <p className="ro-te-error">{error}</p> : null}

      {section === "pack" ? (
        <div className="pack-grid">
          <section className="pack-card">
            <h2 className="pack-card__title">Your Team Feed</h2>
            {feedItems.length === 0 ? (
              <SectionEmpty
                title="Every great team has moments worth celebrating"
                body="Give someone their first Bark Out — recognition starts with you."
              />
            ) : (
              feedItems.map((item) => <BarkOutCard key={item.id} item={item} onReact={react} />)
            )}
          </section>

          <section className="pack-card pack-spotlight">
            <h2 className="pack-card__title">Bark Out Spotlight</h2>
            {pack.spotlight ? (
              <>
                <div className="pack-people" style={{ marginBottom: 10 }}>
                  <Avatar name={pack.spotlight.recipient.name} url={pack.spotlight.recipient.avatarUrl} size={56} />
                  <div>
                    <strong>{pack.spotlight.recipient.name}</strong>
                    <p className="pack-muted" style={{ margin: "4px 0 0" }}>
                      Highlighted recognition
                    </p>
                  </div>
                </div>
                <p style={{ fontStyle: "italic", margin: 0 }}>&ldquo;{pack.spotlight.message}&rdquo;</p>
              </>
            ) : (
              <p className="pack-muted">When teammates recognize each other, a standout post may appear here.</p>
            )}
          </section>

          <aside className="pack-card">
            <h2 className="pack-card__title">Your activity</h2>
            <ul className="pack-muted" style={{ margin: 0, paddingLeft: 18 }}>
              <li>{pack.personal.receivedCount} Bark Outs received</li>
              <li>{pack.personal.sentCount} Bark Outs given</li>
            </ul>
            {pack.personal.awaitingConfirmation.length > 0 ? (
              <>
                <p className="pack-muted" style={{ marginTop: 12, marginBottom: 4, fontSize: 13 }}>
                  Pending posts
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                  {pack.personal.awaitingConfirmation.map((row) => (
                    <li key={row.id}>
                      {row.recipientName} — {row.statusLabel}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}

      {section === "bark_outs" ? (
        <section className="pack-card">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
            <h2 className="pack-card__title" style={{ margin: 0 }}>
              Bark Outs
            </h2>
            {pack.me.canPost ? (
              <button type="button" className="pack-btn pack-btn--primary" onClick={() => setModalOpen(true)}>
                Give a Bark Out
              </button>
            ) : null}
          </div>
          {feedItems.length === 0 ? (
            <SectionEmpty title="No Bark Outs yet" body="Be the first to celebrate a teammate today." />
          ) : (
            feedItems.map((item) => <BarkOutCard key={item.id} item={item} onReact={react} />)
          )}
        </section>
      ) : null}

      {section === "milestones" ? (
        <SectionEmpty title="Milestones & Celebrations" body={pack.sectionStatus.milestones?.message ?? "Coming soon."} />
      ) : null}
      {section === "goals" ? (
        <SectionEmpty title="Pack Goals" body={pack.sectionStatus.packGoals?.message ?? "Team challenges will appear here."} />
      ) : null}
      {section === "fun" ? (
        <SectionEmpty title="Fun Zone" body={pack.sectionStatus.funZone?.message ?? "Questions and polls are on the way."} />
      ) : null}
      {section === "voice" ? (
        <SectionEmpty title="Employee Voice" body={pack.sectionStatus.employeeVoice?.message ?? "Surveys will post here when published."} />
      ) : null}
      {section === "ideas" ? (
        <SectionEmpty
          title="Ideas for the Pack"
          body="Use Submit Request in the sidebar for complaints and formal requests. Pack suggestions inside Team Engagement will land here in the next release."
        />
      ) : null}

      {modalOpen ? (
        <div className="pack-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <div className="pack-modal" role="dialog" aria-labelledby="pack-bark-out-title" onClick={(event) => event.stopPropagation()}>
            <h2 id="pack-bark-out-title" style={{ marginTop: 0 }}>
              Give a Bark Out
            </h2>
            {!home ? (
              <p className="pack-muted">Loading teammates…</p>
            ) : (
              <form onSubmit={(event) => void submitBarkOut(event)}>
                <label className="pack-field">
                  Teammate
                  <select value={recipient} required onChange={(event) => setRecipient(event.target.value)}>
                    <option value="">Choose someone</option>
                    {home.recipients.map((person) => (
                      <option key={person.userId} value={person.userId}>
                        {person.name}
                        {person.title ? ` · ${person.title}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pack-field">
                  Category
                  <select value={category} required onChange={(event) => setCategory(event.target.value)}>
                    <option value="">Choose a category</option>
                    {home.categories.map((entry) => (
                      <option key={entry.key} value={entry.key}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="pack-field">
                  Message
                  <textarea
                    value={message}
                    required
                    minLength={home.participation.minMessageLength}
                    maxLength={home.limits.message}
                    rows={4}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </label>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" className="pack-btn pack-btn--ghost" onClick={() => setModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="pack-btn pack-btn--primary" disabled={busy}>
                    Publish
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
