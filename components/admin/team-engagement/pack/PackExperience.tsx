"use client";

import "@/app/styles/the-pack.css";
import "@/app/styles/team-engagement.css";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAdminJson } from "@/lib/http/fetch-admin-json";
import { humanizeUnknownError } from "@/lib/safe-url";
import {
  BARK_OUT_REACTION_EMOJI,
  BARK_OUT_REACTION_LABELS,
  FEEDBACK_STATUS_LABELS,
  type BarkOutReaction,
  type FeedbackStatus
} from "@/lib/team-engagement/constants";

type BarkOutItem = {
  id: string;
  author: { userId: string | null; name: string; avatarUrl: string | null };
  recipient: { userId: string | null; name: string; avatarUrl: string | null; departments: string[] };
  category: { key: string; label: string };
  message: string;
  publishedAt: string | null;
  reactions: Record<BarkOutReaction, number>;
  myReactions: BarkOutReaction[];
  commentCount?: number;
};

type CommentItem = {
  id: string;
  parentCommentId: string | null;
  author: { name: string; avatarUrl: string | null };
  body: string;
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
};

type PackPayload = {
  storageReady: boolean;
  greeting: string;
  me: {
    userId: string;
    name: string;
    canPost: boolean;
    postingBlockedReason?: string;
    postingBlockedMessage?: string;
    impersonated?: boolean;
  };
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
  spotlightMeta: { category: string; caption: string | null } | null;
  milestonesPreview: { ready: boolean; upcoming: MilestoneItem[]; recent: MilestoneItem[] };
  funZonePreview: {
    ready: boolean;
    question: { id: string; prompt: string; responded: boolean; responseCount: number } | null;
    poll: { id: string; prompt: string; options: { id: string; label: string; votes: number; selected: boolean }[]; voted: boolean } | null;
    trivia: { id: string; title: string; prompt: string; answered: boolean } | null;
  };
  personal: {
    receivedCount: number;
    sentCount: number;
    awaitingConfirmation: { id: string; recipientName: string; statusLabel: string }[];
  };
  sectionStatus: Record<string, { ready: boolean; message?: string }>;
  packSetup?: {
    priority2Ready: boolean;
    priority3Ready: boolean;
    migrations: string[];
  };
};

type MilestoneItem = {
  id: string;
  title: string;
  summary: string | null;
  celebrationOn: string;
  employee: { name: string; avatarUrl: string | null };
};

type FeedbackItem = {
  id: string;
  subject: string;
  status: string;
  created_at: string;
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
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<CommentItem[] | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const count = item.commentCount ?? comments?.length ?? 0;

  async function loadComments() {
    const { ok, body } = await fetchAdminJson<{ items: CommentItem[] }>(
      `/api/admin/bark-outs?view=comments&barkOutId=${encodeURIComponent(item.id)}`
    );
    if (ok) setComments(body.items);
  }

  async function toggleComments() {
    if (!open && comments === null) await loadComments();
    setOpen((value) => !value);
  }

  async function submitComment(event: React.FormEvent) {
    event.preventDefault();
    if (!commentBody.trim()) return;
    setCommentBusy(true);
    try {
      const { ok, body } = await fetchAdminJson<{ items: CommentItem[] }>("/api/admin/bark-outs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_bark_out_comment", barkOutId: item.id, body: commentBody })
      });
      if (ok) {
        setComments(body.items);
        setCommentBody("");
      }
    } finally {
      setCommentBusy(false);
    }
  }

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
          const reactionCount = item.reactions[reaction] ?? 0;
          const mine = item.myReactions.includes(reaction);
          return (
            <button
              key={reaction}
              type="button"
              className={`pack-react ${mine ? "pack-react--mine" : ""}`}
              onClick={() => onReact(item.id, reaction, !mine)}
            >
              {BARK_OUT_REACTION_EMOJI[reaction]} {BARK_OUT_REACTION_LABELS[reaction]}
              {reactionCount > 0 ? ` · ${reactionCount}` : ""}
            </button>
          );
        })}
      </div>
      <div className="pack-comments">
        <button type="button" className="pack-comments__toggle" onClick={() => void toggleComments()}>
          {open ? "Hide" : "View"} {count > 0 ? `${count} comment${count === 1 ? "" : "s"}` : "comments"}
        </button>
        {open ? (
          <>
            {comments === null ? (
              <p className="pack-muted" style={{ fontSize: 13 }}>
                Loading conversation…
              </p>
            ) : comments.length === 0 ? (
              <p className="pack-muted" style={{ fontSize: 13 }}>
                Start the conversation — be the first to reply.
              </p>
            ) : (
              <div className="pack-comments__list">
                {comments.map((comment) => (
                  <div key={comment.id} className="pack-comments__item">
                    <Avatar name={comment.author.name} url={comment.author.avatarUrl} size={32} />
                    <div>
                      <strong style={{ fontSize: 13 }}>{comment.author.name}</strong>
                      <p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{comment.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form className="pack-comments__composer" onSubmit={(event) => void submitComment(event)}>
              <textarea value={commentBody} maxLength={500} placeholder="Add a supportive comment…" onChange={(event) => setCommentBody(event.target.value)} />
              <button type="submit" className="pack-btn pack-btn--primary" disabled={commentBusy}>
                Post
              </button>
            </form>
          </>
        ) : null}
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

type PackGoalsState = {
  active: Array<{ id: string; title: string; description: string; progressPercent: number; endsOn: string | null }>;
  completed: Array<{ id: string; title: string; description: string; progressPercent: number; endsOn: string | null }>;
};

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
  const [ideas, setIdeas] = useState<FeedbackItem[] | null>(null);
  const [funZone, setFunZone] = useState<PackPayload["funZonePreview"] | null>(null);
  const [packGoals, setPackGoals] = useState<PackGoalsState | null>(null);
  const [voiceSurveys, setVoiceSurveys] = useState<
    Array<{ id: string; title: string; introduction: string | null; completed: boolean; questions: Array<{ id: string; prompt: string; questionType: string; options: unknown[] }> }>
  | null>(null);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaBody, setIdeaBody] = useState("");

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

  const loadIdeas = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<{ items: FeedbackItem[] }>("/api/admin/bark-outs?view=feedback");
    if (ok) setIdeas(body.items);
  }, []);

  const loadFunZone = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<PackPayload["funZonePreview"]>("/api/admin/bark-outs?view=fun_zone");
    if (ok) setFunZone(body);
  }, []);

  async function votePoll(pollId: string, optionId: string) {
    const { ok, body } = await fetchAdminJson<PackPayload["funZonePreview"]>("/api/admin/bark-outs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "vote_fun_poll", pollId, optionIds: [optionId] })
    });
    if (ok) setFunZone(body);
  }

  const loadPackGoals = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<PackGoalsState & { ready?: boolean }>("/api/admin/bark-outs?view=pack_goals");
    if (ok) {
      if (body.ready === false) setPackGoals({ active: [], completed: [] });
      else setPackGoals({ active: body.active ?? [], completed: body.completed ?? [] });
    } else setPackGoals({ active: [], completed: [] });
  }, []);

  const loadVoice = useCallback(async () => {
    const { ok, body } = await fetchAdminJson<{ ready?: boolean; items: NonNullable<typeof voiceSurveys> }>("/api/admin/bark-outs?view=employee_voice");
    if (ok) setVoiceSurveys(body.ready === false ? [] : body.items ?? []);
    else setVoiceSurveys([]);
  }, []);

  useEffect(() => {
    if (section === "ideas") void loadIdeas();
    if (section === "fun") void loadFunZone();
    if (section === "goals") void loadPackGoals();
    if (section === "voice") void loadVoice();
  }, [section, loadIdeas, loadFunZone, loadPackGoals, loadVoice]);

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

      {pack.me.impersonated && pack.me.postingBlockedMessage ? (
        <div className="pack-card" style={{ marginBottom: 16, borderColor: "#c77d2d" }}>
          <strong>Viewing as {pack.me.name}</strong>
          <p className="pack-muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            {pack.me.postingBlockedMessage}
          </p>
        </div>
      ) : null}
      {!pack.me.canPost && !pack.me.impersonated && pack.me.postingBlockedMessage ? (
        <div className="pack-card" style={{ marginBottom: 16, borderColor: "#c77d2d" }}>
          <strong>Bark Outs unavailable</strong>
          <p className="pack-muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            {pack.me.postingBlockedMessage}
          </p>
        </div>
      ) : null}

      {pack.packSetup && pack.packSetup.migrations.length > 0 ? (
        <div className="pack-card" style={{ marginBottom: 16, borderColor: "var(--pack-blue)" }}>
          <strong>Database setup still needed</strong>
          <p className="pack-muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
            Run these SQL migrations on Supabase (SQL Editor), in order, then refresh: {pack.packSetup.migrations.join(" → ")}
          </p>
        </div>
      ) : null}

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
              <div>
                <SectionEmpty
                  title="Every great team has moments worth celebrating"
                  body="Give someone their first Bark Out — recognition starts with you."
                />
                {pack.me.canPost ? (
                  <button type="button" className="pack-btn pack-btn--primary" style={{ marginTop: 12 }} onClick={() => setModalOpen(true)}>
                    Give a Bark Out
                  </button>
                ) : null}
              </div>
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
                      {pack.spotlightMeta?.category ?? "Highlighted recognition"}
                    </p>
                  </div>
                </div>
                {pack.spotlightMeta?.caption ? <p className="pack-muted">{pack.spotlightMeta.caption}</p> : null}
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
        pack.milestonesPreview?.ready ? (
          <div className="pack-grid">
            <section className="pack-card">
              <h2 className="pack-card__title">Upcoming celebrations</h2>
              {pack.milestonesPreview.upcoming.length === 0 ? (
                <SectionEmpty title="No upcoming milestones" body="We'll celebrate the next one together when hire dates are connected." />
              ) : (
                pack.milestonesPreview.upcoming.map((milestone) => (
                  <article key={milestone.id} style={{ marginBottom: 14 }}>
                    <div className="pack-people">
                      <Avatar name={milestone.employee.name} url={milestone.employee.avatarUrl} />
                      <div>
                        <strong>{milestone.title}</strong>
                        <p className="pack-muted" style={{ margin: "2px 0 0", fontSize: 13 }}>
                          {milestone.celebrationOn} · {milestone.employee.name}
                        </p>
                      </div>
                    </div>
                    {milestone.summary ? <p style={{ fontSize: 14, margin: "8px 0 0" }}>{milestone.summary}</p> : null}
                  </article>
                ))
              )}
            </section>
            <section className="pack-card">
              <h2 className="pack-card__title">Recent celebrations</h2>
              {pack.milestonesPreview.recent.length === 0 ? (
                <p className="pack-muted">Recent milestones will appear here.</p>
              ) : (
                pack.milestonesPreview.recent.map((milestone) => (
                  <p key={milestone.id} style={{ margin: "0 0 10px", fontSize: 14 }}>
                    <strong>{milestone.title}</strong>
                    <span className="pack-muted"> · {milestone.employee.name}</span>
                  </p>
                ))
              )}
            </section>
          </div>
        ) : (
          <SectionEmpty title="Milestones & Celebrations" body={pack.sectionStatus.milestones?.message ?? "Coming soon."} />
        )
      ) : null}
      {section === "goals" ? (
        !pack.sectionStatus.packGoals?.ready ? (
          <SectionEmpty title="Pack Goals" body={pack.sectionStatus.packGoals?.message ?? "Pack Goals need migration 107."} />
        ) : packGoals === null ? (
          <p className="pack-muted">Loading Pack Goals…</p>
        ) : packGoals.active.length === 0 ? (
          <SectionEmpty title="Pack Goals" body="When leadership publishes a team goal, progress will show here." />
        ) : (
          <section className="pack-card">
            <h2 className="pack-card__title">Active Pack Goals</h2>
            {packGoals.active.map((goal) => (
              <article key={goal.id} style={{ marginBottom: 16 }}>
                <strong>{goal.title}</strong>
                <p className="pack-muted" style={{ margin: "4px 0", fontSize: 13 }}>
                  {goal.endsOn ? `Target by ${goal.endsOn}` : "In progress"} · {goal.progressPercent}% complete
                </p>
                <p style={{ margin: 0 }}>{goal.description}</p>
                <div className="pack-progress" style={{ marginTop: 8, height: 8, background: "#e8f2f7", borderRadius: 8 }}>
                  <div style={{ width: `${goal.progressPercent}%`, height: "100%", background: "var(--pack-blue)", borderRadius: 8 }} />
                </div>
              </article>
            ))}
          </section>
        )
      ) : null}
      {section === "fun" ? (
        (funZone ?? pack.funZonePreview)?.ready ? (
          <div className="pack-grid">
            <section className="pack-card">
              <h2 className="pack-card__title">Question of the day</h2>
              {(funZone ?? pack.funZonePreview)?.question ? (
                <>
                  <p>{(funZone ?? pack.funZonePreview)!.question!.prompt}</p>
                  <p className="pack-muted" style={{ fontSize: 13 }}>
                    {(funZone ?? pack.funZonePreview)!.question!.responseCount} responses
                    {(funZone ?? pack.funZonePreview)!.question!.responded ? " · You responded" : ""}
                  </p>
                  {!(funZone ?? pack.funZonePreview)!.question!.responded ? (
                    <form
                      className="pack-comments__composer"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const value = (event.currentTarget.elements.namedItem("daily-answer") as HTMLTextAreaElement).value;
                        void (async () => {
                          await fetchAdminJson("/api/admin/bark-outs", {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({
                              action: "answer_fun_question",
                              questionId: (funZone ?? pack.funZonePreview)!.question!.id,
                              body: value
                            })
                          });
                          await loadFunZone();
                        })();
                      }}
                    >
                      <textarea name="daily-answer" required maxLength={600} placeholder="Your answer…" />
                      <button type="submit" className="pack-btn pack-btn--primary">
                        Submit
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <SectionEmpty title="No active questions" body="Check back for the next Pack question." />
              )}
            </section>
            <section className="pack-card">
              <h2 className="pack-card__title">Pack poll</h2>
              {(funZone ?? pack.funZonePreview)?.poll ? (
                <>
                  <p>{(funZone ?? pack.funZonePreview)!.poll!.prompt}</p>
                  <ul style={{ margin: "12px 0 0", padding: 0, listStyle: "none" }}>
                    {(funZone ?? pack.funZonePreview)!.poll!.options.map((option) => (
                      <li key={option.id} style={{ marginBottom: 6, fontSize: 14 }}>
                        <button
                          type="button"
                          className={`pack-btn pack-btn--ghost ${option.selected ? "pack-react--mine" : ""}`}
                          style={{ padding: "6px 10px", justifyContent: "flex-start" }}
                          disabled={Boolean((funZone ?? pack.funZonePreview)!.poll!.voted && !option.selected)}
                          onClick={() => void votePoll((funZone ?? pack.funZonePreview)!.poll!.id, option.id)}
                        >
                          {option.label}
                          {option.votes > 0 ? <span className="pack-muted"> · {option.votes} votes</span> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <SectionEmpty title="No active polls" body="Polls go live when leadership publishes one." />
              )}
            </section>
          </div>
        ) : (
          <SectionEmpty title="Fun Zone" body={pack.sectionStatus.funZone?.message ?? "Questions and polls are on the way."} />
        )
      ) : null}
      {section === "voice" ? (
        !pack.sectionStatus.employeeVoice?.ready ? (
          <SectionEmpty title="Employee Voice" body={pack.sectionStatus.employeeVoice?.message ?? "Apply migration 107."} />
        ) : voiceSurveys === null ? (
          <p className="pack-muted">Loading surveys…</p>
        ) : voiceSurveys.length === 0 ? (
          <SectionEmpty title="Employee Voice" body="When a survey is published, you can respond here. Anonymous surveys never show your name to leadership." />
        ) : (
          voiceSurveys.map((survey) => (
            <section key={survey.id} className="pack-card" style={{ marginBottom: 16 }}>
              <h2 className="pack-card__title">{survey.title}</h2>
              {survey.introduction ? <p className="pack-muted">{survey.introduction}</p> : null}
              {survey.completed ? (
                <p className="pack-muted">You already completed this survey. Thank you.</p>
              ) : (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const form = event.currentTarget;
                    const answers: Record<string, unknown> = {};
                    survey.questions.forEach((q) => {
                      const field = form.elements.namedItem(`q-${q.id}`) as HTMLInputElement | HTMLTextAreaElement | null;
                      if (field) answers[q.id] = q.questionType === "rating" ? Number(field.value) : field.value;
                    });
                    void (async () => {
                      await fetchAdminJson("/api/admin/bark-outs", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "submit_voice_survey", surveyId: survey.id, answers })
                      });
                      await loadVoice();
                    })();
                  }}
                >
                  {survey.questions.map((q) => (
                    <label key={q.id} className="pack-field">
                      {q.prompt}
                      {q.questionType === "text" ? (
                        <textarea name={`q-${q.id}`} rows={3} required={false} />
                      ) : q.questionType === "rating" ? (
                        <select name={`q-${q.id}`} defaultValue="3">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input name={`q-${q.id}`} />
                      )}
                    </label>
                  ))}
                  <button type="submit" className="pack-btn pack-btn--primary">
                    Submit survey
                  </button>
                </form>
              )}
            </section>
          ))
        )
      ) : null}
      {section === "ideas" ? (
        pack.sectionStatus.ideas?.ready ? (
          <section className="pack-card">
            <h2 className="pack-card__title">Ideas for the Pack</h2>
            <form
              style={{ marginBottom: 16 }}
              onSubmit={(event) => {
                event.preventDefault();
                void (async () => {
                  setBusy(true);
                  try {
                    await fetchAdminJson("/api/admin/bark-outs", {
                      method: "POST",
                      headers: { "content-type": "application/json" },
                      body: JSON.stringify({
                        action: "submit_feedback",
                        category: "team_culture",
                        subject: ideaTitle,
                        details: ideaBody
                      })
                    });
                    setIdeaTitle("");
                    setIdeaBody("");
                    await loadIdeas();
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <label className="pack-field">
                Idea title
                <input value={ideaTitle} required maxLength={120} onChange={(event) => setIdeaTitle(event.target.value)} />
              </label>
              <label className="pack-field">
                What should we improve?
                <textarea value={ideaBody} required rows={3} maxLength={800} onChange={(event) => setIdeaBody(event.target.value)} />
              </label>
              <button type="submit" className="pack-btn pack-btn--primary" disabled={busy}>
                Submit idea
              </button>
            </form>
            {ideas === null ? (
              <p className="pack-muted">Loading your ideas…</p>
            ) : ideas.length === 0 ? (
              <SectionEmpty title="No ideas yet" body="Share something that would make The Pack even better." />
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {ideas.map((item) => (
                  <li key={item.id} style={{ padding: "10px 0", borderTop: "1px solid #e3eef3" }}>
                    <strong>{item.subject}</strong>
                    <span className="pack-pill" style={{ marginLeft: 8, fontSize: 11 }}>
                      {FEEDBACK_STATUS_LABELS[item.status as FeedbackStatus] ?? item.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <SectionEmpty title="Ideas for the Pack" body="Team feedback is not enabled on your account yet." />
        )
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
