"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  FileSearch,
  Headphones,
  Heart,
  HelpCircle,
  Lightbulb,
  Menu,
  PawPrint,
  Play,
  Printer,
  Search,
  Sparkles,
  TrendingUp,
  Wand2,
  X
} from "lucide-react";
import {
  BLOG_HELP_ASSETS,
  BLOG_HELP_GUIDE_PATH,
  BLOG_HELP_LINKS,
  BLOG_HELP_LOGO,
  BLOG_HELP_PRO_TIPS,
  BLOG_HELP_STEPS,
  BLOG_HELP_SUPPORT_EMAIL,
  BLOG_HELP_SUPPORT_HREF,
  type BlogHelpStepId
} from "@/lib/blog/help-guide";

type Impact = {
  views: { available: boolean; value: number | null; reason?: string };
  engagement: { available: boolean; value: number | null; reason?: string };
  subscribers: { available: boolean; value: number | null; deltaPercent?: number | null };
};

type Props = {
  displayName: string;
  roleLabel: string;
  avatarUrl?: string | null;
  notificationCount?: number;
  tutorialVideoUrl?: string | null;
  canConfigureTutorial?: boolean;
  impact: Impact;
};

const HEADER_NAV = [
  { label: "Dashboard", href: BLOG_HELP_LINKS.dashboard },
  { label: "Blog Generator", href: BLOG_HELP_GUIDE_PATH, active: true },
  { label: "Articles", href: BLOG_HELP_LINKS.articles },
  { label: "Calendar", href: BLOG_HELP_LINKS.calendar },
  { label: "Analytics", href: BLOG_HELP_LINKS.analytics },
  { label: "Settings", href: BLOG_HELP_LINKS.settings }
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || "FD").toUpperCase();
}

function formatMetric(value: number | null | undefined) {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return value.toLocaleString();
}

async function trackHelpEvent(action: string, details?: Record<string, unknown>) {
  try {
    await fetch("/api/blog/help/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, details })
    });
  } catch {
    // non-blocking
  }
}

export function BlogHelpGuideClient({
  displayName,
  roleLabel,
  avatarUrl,
  notificationCount = 0,
  tutorialVideoUrl,
  canConfigureTutorial = false,
  impact
}: Props) {
  const [activeStep, setActiveStep] = useState<BlogHelpStepId>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);
  const [query, setQuery] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  const filteredTips = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return BLOG_HELP_PRO_TIPS;
    return BLOG_HELP_PRO_TIPS.filter((tip) => tip.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    void trackHelpEvent("help.page_viewed");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const hash = window.location.hash.replace("#", "") as BlogHelpStepId;
      if (BLOG_HELP_STEPS.some((s) => s.id === hash)) {
        setActiveStep(hash);
        sectionRefs.current[hash]?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible?.target?.id) return;
        const id = visible.target.id as BlogHelpStepId;
        if (BLOG_HELP_STEPS.some((s) => s.id === id)) {
          setActiveStep(id);
          const next = `${BLOG_HELP_GUIDE_PATH}#${id}`;
          if (window.location.pathname + window.location.hash !== next) {
            window.history.replaceState(null, "", `#${id}`);
          }
        }
      },
      { rootMargin: "-30% 0px -55% 0px", threshold: [0.2, 0.5, 0.8] }
    );
    for (const step of BLOG_HELP_STEPS) {
      const node = sectionRefs.current[step.id];
      if (node) observer.observe(node);
    }
    return () => observer.disconnect();
  }, []);

  const goToStep = useCallback((id: BlogHelpStepId) => {
    setActiveStep(id);
    window.history.pushState(null, "", `#${id}`);
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
    void trackHelpEvent("help.step_selected", { step: id });
  }, []);

  function openVideo() {
    if (!tutorialVideoUrl) return;
    setVideoOpen(true);
    void trackHelpEvent("help.tutorial_opened");
  }

  function closeVideo() {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
    setVideoOpen(false);
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeVideo();
        setLightbox(null);
        setMenuOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="blog-help">
      <header className="blog-help__header">
        <Link href={BLOG_HELP_LINKS.dashboard} className="blog-help__brand" aria-label="Fitdog Blog Generator">
          <Image src={BLOG_HELP_LOGO.markCircle} alt="" width={34} height={34} className="blog-help__brand-mark" />
          <span className="blog-help__brand-word">fitdog</span>
        </Link>

        <nav className="blog-help__nav" aria-label="Blog Generator">
          {HEADER_NAV.map((item) => (
            <Link key={item.label} href={item.href} className={item.active ? "is-active" : undefined} aria-current={item.active ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="blog-help__header-right">
          <button type="button" className="blog-help__icon-btn md:hidden" aria-label="Open menu" onClick={() => setMenuOpen((v) => !v)}>
            <Menu className="h-4 w-4" />
          </button>
          <Link href={BLOG_HELP_GUIDE_PATH} className="blog-help__icon-btn" aria-label="Help guide" onClick={() => void trackHelpEvent("help.help_icon")}>
            <HelpCircle className="h-4 w-4" />
          </Link>
          <Link href="/admin/automatic-blog?page=audit" className="blog-help__icon-btn" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {notificationCount > 0 ? <span className="blog-help__notif">{notificationCount > 9 ? "9+" : notificationCount}</span> : null}
          </Link>
          <div className="relative">
            <button type="button" className="blog-help__user" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
              <span className="blog-help__avatar">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarUrl} alt="" />
                ) : (
                  initials(displayName)
                )}
              </span>
              <span className="blog-help__user-meta text-left">
                <span className="blog-help__user-name block">{displayName}</span>
                <span className="blog-help__user-role block">{roleLabel}</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[var(--fitdog-muted)]" aria-hidden />
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute right-0 top-[46px] z-50 min-w-[200px] rounded-xl border border-[var(--fitdog-border)] bg-white p-1 shadow-lg">
                <Link href={BLOG_HELP_LINKS.dashboard} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                  Open Dashboard
                </Link>
                <Link href={BLOG_HELP_LINKS.settings} role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                  Blog Settings
                </Link>
                <Link href="/admin?board=staff&tab=crossover_communication" role="menuitem" className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-50" onClick={() => setMenuOpen(false)}>
                  RuffOps Admin
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {menuOpen ? (
        <nav className="border-b border-[var(--fitdog-border)] bg-white px-4 py-3 md:hidden" aria-label="Mobile Blog Generator">
          <div className="flex flex-wrap gap-2">
            {HEADER_NAV.map((item) => (
              <Link key={item.label} href={item.href} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${item.active ? "bg-[var(--fitdog-orange-soft)] text-[var(--fitdog-orange)]" : "bg-slate-100 text-[var(--fitdog-navy)]"}`}>
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <main className="blog-help__page">
        <section className="blog-help__hero" aria-labelledby="blog-help-hero-title">
          <div>
            <span className="blog-help__pill">
              <BookOpen className="h-3.5 w-3.5" aria-hidden /> FITDOG HELP CENTER
            </span>
            <h1 id="blog-help-hero-title">
              How to Use the
              <br />
              Fitdog Blog Generator
            </h1>
            <p className="blog-help__hero-lead">
              Create amazing, useful, SEO-optimized blog content for dog owners — faster, smarter, and with less work.
            </p>
            <div className="blog-help__benefits">
              <div className="blog-help__benefit">
                <Sparkles className="h-4 w-4 text-[var(--fitdog-orange)]" aria-hidden />
                <strong>Save hours</strong>
                <span>with AI-powered creation</span>
              </div>
              <div className="blog-help__benefit">
                <Heart className="h-4 w-4 text-[var(--fitdog-orange)]" aria-hidden />
                <strong>Grow your audience</strong>
                <span>with expert content</span>
              </div>
              <div className="blog-help__benefit">
                <TrendingUp className="h-4 w-4 text-[var(--fitdog-orange)]" aria-hidden />
                <strong>Strengthen your brand</strong>
                <span>as the LA dog care leader</span>
              </div>
            </div>
            <div className="blog-help__hero-actions">
              {tutorialVideoUrl ? (
                <button type="button" className="blog-help__btn blog-help__btn--primary" onClick={openVideo}>
                  <Play className="h-4 w-4" aria-hidden /> Watch 2-Minute Overview
                </button>
              ) : (
                <Link
                  href={canConfigureTutorial ? BLOG_HELP_LINKS.settings : BLOG_HELP_LINKS.setup}
                  className="blog-help__btn blog-help__btn--primary"
                  onClick={() => void trackHelpEvent("help.tutorial_setup_clicked")}
                >
                  Tutorial Video Not Configured
                </Link>
              )}
              <Link
                href={BLOG_HELP_LINKS.generator}
                className="blog-help__btn blog-help__btn--secondary"
                onClick={() => void trackHelpEvent("help.open_blog_generator")}
              >
                Open Blog Generator <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            <p className="mt-3 text-xs text-[var(--fitdog-muted)]">Welcome back, {firstName}. This guide matches the live Blog Generator workflows in RuffOps.</p>
          </div>
          <div className="blog-help__hero-visual">
            <p className="blog-help__handwrite">
              More great content for happier, healthier dogs!
              <PawPrint className="mt-1 h-4 w-4" aria-hidden />
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BLOG_HELP_ASSETS.heroDog}
              alt="Approved Fitdog photography of a golden retriever used in the Blog Generator help hero"
              className="blog-help__hero-photo"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={BLOG_HELP_ASSETS.dashboardFixture}
              alt="Dev-safe Blog Generator dashboard fixture showing unavailable analytics states"
              className="blog-help__hero-screen"
            />
          </div>
        </section>

        <div className="blog-help__toolbar">
          <button type="button" className="blog-help__btn blog-help__btn--ghost" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print guide
          </button>
          <button
            type="button"
            className="blog-help__btn blog-help__btn--ghost"
            onClick={() => {
              void navigator.clipboard?.writeText(`${window.location.origin}${BLOG_HELP_GUIDE_PATH}#${activeStep}`);
            }}
          >
            Copy section link
          </button>
        </div>

        <div className="blog-help__layout">
          <aside className="blog-help__side" aria-label="In this guide">
            <div className="blog-help__card">
              <h2>In This Guide</h2>
              <div className="blog-help__search">
                <label className="sr-only" htmlFor="blog-help-search">
                  Search this guide
                </label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fitdog-muted)]" />
                  <input
                    id="blog-help-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search guide tips…"
                    style={{ paddingLeft: 32 }}
                  />
                </div>
              </div>
              <div className="blog-help__mobile-nav">
                <label className="sr-only" htmlFor="blog-help-step-select">
                  Jump to step
                </label>
                <select
                  id="blog-help-step-select"
                  value={activeStep}
                  onChange={(e) => goToStep(e.target.value as BlogHelpStepId)}
                >
                  {BLOG_HELP_STEPS.map((step) => (
                    <option key={step.id} value={step.id}>
                      {step.number}. {step.navLabel}
                    </option>
                  ))}
                </select>
              </div>
              <ol className="blog-help__steps">
                {BLOG_HELP_STEPS.map((step) => (
                  <li key={step.id}>
                    <a
                      href={`#${step.id}`}
                      className={`blog-help__step-link${activeStep === step.id ? " is-active" : ""}`}
                      onClick={(e) => {
                        e.preventDefault();
                        goToStep(step.id);
                      }}
                    >
                      <span className="blog-help__step-num">{step.number}</span>
                      {step.navLabel}
                    </a>
                  </li>
                ))}
              </ol>
              <div className="blog-help__support">
                <p>
                  <Headphones className="mr-1 inline h-4 w-4 text-[var(--fitdog-orange)]" aria-hidden /> Need help?
                </p>
                <span>Contact the RuffOps Support Team</span>
                <a
                  href={BLOG_HELP_SUPPORT_HREF}
                  onClick={() => void trackHelpEvent("help.support_opened")}
                >
                  Open Support →
                </a>
                <a className="mt-2 block text-xs font-medium text-[var(--fitdog-muted)]" href={`mailto:${BLOG_HELP_SUPPORT_EMAIL}`}>
                  Or email {BLOG_HELP_SUPPORT_EMAIL}
                </a>
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <section
              id="overview"
              ref={(node) => {
                sectionRefs.current.overview = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 1</span>
              <p className="blog-help__section-kicker">Overview</p>
              <h3>What is the Fitdog Blog Generator?</h3>
              <p>
                The Blog Generator is Fitdog’s editorial system inside RuffOps. It helps your team create, review, schedule, and publish useful dog-care content for the Fitdog blog. It combines approved Fitdog knowledge, SEO fields, human review gates, and the Fitdog brand voice so articles inform dog owners and connect them to Fitdog services only when the connection is natural.
              </p>
              <div className="blog-help__feature-grid">
                <Link href={BLOG_HELP_LINKS.generator} className="blog-help__feature blog-help__feature--blue" onClick={() => void trackHelpEvent("help.feature_generator")}>
                  <Wand2 className="h-5 w-5 text-[var(--fitdog-navy)]" aria-hidden />
                  <h4>AI-Powered Content Creation</h4>
                  <p>Generate detailed drafts from scored topics using the configured writing and review agents.</p>
                </Link>
                <Link href={BLOG_HELP_LINKS.editorial} className="blog-help__feature blog-help__feature--blue" onClick={() => void trackHelpEvent("help.feature_seo")}>
                  <FileSearch className="h-5 w-5 text-[var(--fitdog-navy)]" aria-hidden />
                  <h4>SEO Optimized</h4>
                  <p>Fill natural titles, metadata, and structure, then refine SEO fields in the article editor before publish.</p>
                </Link>
                <Link href={BLOG_HELP_LINKS.dashboard} className="blog-help__feature blog-help__feature--indigo" onClick={() => void trackHelpEvent("help.feature_pipeline")}>
                  <CalendarDays className="h-5 w-5 text-violet-700" aria-hidden />
                  <h4>Full Editorial Workflow</h4>
                  <p>Move content from topic ideas to drafts, Needs Review, Approved, Scheduled, and Published in one place.</p>
                </Link>
                <Link href={BLOG_HELP_LINKS.analytics} className="blog-help__feature blog-help__feature--green" onClick={() => void trackHelpEvent("help.feature_analytics")}>
                  <BarChart3 className="h-5 w-5 text-emerald-700" aria-hidden />
                  <h4>Real Performance Insights</h4>
                  <p>See live publish and subscriber metrics, plus honest unavailable states until pageview analytics are connected.</p>
                </Link>
              </div>
              <div className="blog-help__why">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
                <div>
                  <strong>Why it matters</strong>
                  <p>
                    Consistent, high-quality content can help Fitdog answer common dog-owner questions, build trust, improve search visibility, and connect readers with relevant services. Every article should provide useful advice first and promote Fitdog only when the connection is natural.
                  </p>
                </div>
              </div>
            </section>

            <section
              id="topics"
              ref={(node) => {
                sectionRefs.current.topics = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 2</span>
              <p className="blog-help__section-kicker">Generate Topic Ideas</p>
              <h3>Generate Topic Ideas</h3>
              <p>Open <strong>Topics</strong> from the Blog Generator sidebar. You can seed thoughtful starter topics or submit your own idea.</p>
              <ol className="ml-5 list-decimal space-y-2">
                <li>Click <strong>Topics</strong> (or use Open Topic Generator below).</li>
                <li>Enter a specific, useful topic title — avoid broad titles like “Why Dogs Are Great.”</li>
                <li>Fill <strong>Reader concern</strong> and <strong>Primary takeaway</strong>.</li>
                <li>Click <strong>Score &amp; save topic</strong>. The Topic Quality Score must clear the configured threshold before generation.</li>
                <li>Use <strong>Seed thoughtful topics</strong> when you need a curated starter set; duplicates are skipped.</li>
                <li>When a topic is scored/approved, open <strong>Blog Generator</strong> and select it to create a draft.</li>
              </ol>
              <button type="button" className="blog-help__shot" onClick={() => setLightbox({ src: BLOG_HELP_ASSETS.topicsFixture, alt: "Topic Ideas panel fixture" })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BLOG_HELP_ASSETS.topicsFixture} alt="Dev-safe screenshot of the Topic Ideas workflow" loading="lazy" />
              </button>
              <Link href={BLOG_HELP_LINKS.topics} className="blog-help__btn blog-help__btn--primary" onClick={() => void trackHelpEvent("help.open_topics")}>
                Open Topic Generator
              </Link>
            </section>

            <section
              id="create"
              ref={(node) => {
                sectionRefs.current.create = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 3</span>
              <p className="blog-help__section-kicker">Create Blog Articles</p>
              <h3>Create Blog Articles</h3>
              <ol className="ml-5 list-decimal space-y-2">
                <li>Open <strong>Blog Generator</strong> and choose an <strong>Approved / scored topic</strong>.</li>
                <li>Click <strong>Generate draft</strong>. This runs brief creation plus writer and review agents.</li>
                <li>Or use <strong>New Article → Write Manually</strong> on the Dashboard to open a blank draft in the editor.</li>
                <li>In the editor, refine title, body, SEO fields, CTA, and cover image from the Media Library.</li>
                <li>Save changes with the editor save action. Regenerate only when needed — avoid generic filler.</li>
                <li>Auto-publish stays off by default; drafts enter review statuses based on scores and fact-check results.</li>
              </ol>
              <button type="button" className="blog-help__shot" onClick={() => setLightbox({ src: BLOG_HELP_ASSETS.generateFixture, alt: "Blog Generator panel fixture" })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BLOG_HELP_ASSETS.generateFixture} alt="Dev-safe screenshot of the Blog Generator create workflow" loading="lazy" />
              </button>
              <div className="flex flex-wrap gap-2">
                <Link href={BLOG_HELP_LINKS.generator} className="blog-help__btn blog-help__btn--primary" onClick={() => void trackHelpEvent("help.create_article")}>
                  Create New Article
                </Link>
                <Link href={BLOG_HELP_LINKS.media} className="blog-help__btn blog-help__btn--secondary">
                  Open Media Library
                </Link>
              </div>
            </section>

            <section
              id="review"
              ref={(node) => {
                sectionRefs.current.review = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 4</span>
              <p className="blog-help__section-kicker">Review &amp; Approve</p>
              <h3>Review &amp; Approve</h3>
              <p>
                Articles in <strong>Needs Review</strong> (`HUMAN_REVIEW`) require human judgment. Check Human Editorial Score, Topic Quality Score, fact-check status, natural voice, empathy, SEO, image approval, and sources.
              </p>
              <div className="blog-help__why mb-4">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
                <div>
                  <strong>Important</strong>
                  <p>Never approve an article simply because it is complete. Confirm the advice is useful, accurate, natural, and appropriate for Fitdog.</p>
                </div>
              </div>
              <ul className="ml-5 list-disc space-y-2">
                <li>Failed fact checks cannot move to Approved from the dashboard pipeline.</li>
                <li>Scores below the configured human threshold cannot be auto-approved.</li>
                <li>Use request-changes / Needs Changes when the article must be revised.</li>
                <li>Approve requires the <code>blog.approve</code> permission.</li>
              </ul>
              <button type="button" className="blog-help__shot" onClick={() => setLightbox({ src: BLOG_HELP_ASSETS.reviewFixture, alt: "Needs Review fixture" })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={BLOG_HELP_ASSETS.reviewFixture} alt="Dev-safe screenshot of the Needs Review queue" loading="lazy" />
              </button>
              <Link href={BLOG_HELP_LINKS.needsReview} className="blog-help__btn blog-help__btn--primary" onClick={() => void trackHelpEvent("help.open_needs_review")}>
                Open Needs Review
              </Link>
            </section>

            <section
              id="publish"
              ref={(node) => {
                sectionRefs.current.publish = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 5</span>
              <p className="blog-help__section-kicker">Schedule &amp; Publish</p>
              <h3>Schedule &amp; Publish</h3>
              <p>
                Approved articles can be scheduled with a real publish datetime (your timezone) or published with the publish action when you have <code>blog.publish</code> permission. Auto-publish remains off unless an authorized admin explicitly enables it in Blog Settings.
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>Use Content Calendar / Scheduled queues to inspect upcoming items.</li>
                <li>Confirm cover image, metadata, links, and CTA before scheduling.</li>
                <li>Failed publishes appear in Failed status — retry safely after fixing the cause.</li>
                <li>After publish, open the public URL under `/blog/[slug]`.</li>
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={BLOG_HELP_LINKS.calendar} className="blog-help__btn blog-help__btn--primary" onClick={() => void trackHelpEvent("help.open_calendar")}>
                  Open Calendar
                </Link>
                <Link href={BLOG_HELP_LINKS.scheduled} className="blog-help__btn blog-help__btn--secondary">
                  View Scheduled Articles
                </Link>
              </div>
            </section>

            <section
              id="performance"
              ref={(node) => {
                sectionRefs.current.performance = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 6</span>
              <p className="blog-help__section-kicker">Monitor Performance</p>
              <h3>Monitor Performance</h3>
              <p>
                Open <strong>Performance</strong> / the Dashboard analytics cards for live publish counts, newsletter subscribers, category mix, and activity. Pageviews, engagement rate, measured read time, Search Console, and trend data remain unavailable until those providers are connected — the UI shows “not connected” rather than inventing numbers.
              </p>
              <ul className="ml-5 list-disc space-y-2">
                <li>Zero and unavailable are different: unavailable means the integration is missing.</li>
                <li>Use audit logs for publishing and workflow history.</li>
                <li>Refresh older articles when advice becomes stale.</li>
              </ul>
              <Link href={BLOG_HELP_LINKS.analytics} className="blog-help__btn blog-help__btn--primary mt-4 inline-flex" onClick={() => void trackHelpEvent("help.open_analytics")}>
                Open Analytics
              </Link>
            </section>

            <section
              id="best-practices"
              ref={(node) => {
                sectionRefs.current["best-practices"] = node;
              }}
              className="blog-help__main-section blog-help__card"
            >
              <span className="blog-help__step-badge">STEP 7</span>
              <p className="blog-help__section-kicker">Best Practices</p>
              <h3>Best Practices</h3>
              <ul className="ml-5 list-disc space-y-2">
                <li>Write for a real dog-owner concern.</li>
                <li>Give useful advice before mentioning Fitdog.</li>
                <li>Prefer specific topics over broad generic topics.</li>
                <li>Keep writing natural when read aloud; remove filler and repetition.</li>
                <li>Use approved Fitdog facts and approved photography only.</li>
                <li>Verify sensitive claims; never invent stories, quotes, studies, or client experiences.</li>
                <li>Avoid keyword stuffing; add local relevance only when appropriate.</li>
                <li>Update seasonal content and review older articles regularly.</li>
                <li>Do not publish only to meet a quota.</li>
              </ul>
              <div className="blog-help__checklist mt-5">
                <h4>Quick reference checklist</h4>
                <h4 className="text-sm">Before generating</h4>
                <ul>
                  <li>Topic is specific</li>
                  <li>Audience / reader concern is clear</li>
                  <li>Fitdog connection is relevant</li>
                </ul>
                <h4 className="text-sm">Before approval</h4>
                <ul>
                  <li>Advice is genuinely useful</li>
                  <li>Article sounds human</li>
                  <li>Claims are supported</li>
                  <li>Fitdog facts are current</li>
                  <li>Image is approved</li>
                  <li>SEO fields are complete</li>
                  <li>No private information is included</li>
                </ul>
                <h4 className="text-sm">Before publishing</h4>
                <ul>
                  <li>Final preview checked</li>
                  <li>Correct date and destination selected</li>
                  <li>Links and CTA work</li>
                  <li>Mobile layout checked</li>
                  <li>Public URL confirmed</li>
                </ul>
              </div>
            </section>
          </div>

          <aside className="blog-help__rail" aria-label="Tips and impact">
            <div className="blog-help__tips">
              <h2 className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-[var(--fitdog-navy)]">
                <Lightbulb className="h-4 w-4 text-amber-600" aria-hidden /> Pro Tips
              </h2>
              <ul>
                {(query.trim() ? filteredTips : BLOG_HELP_PRO_TIPS).map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
                {query.trim() && !filteredTips.length ? <li>No tip matches that search.</li> : null}
              </ul>
            </div>

            <div className="blog-help__card mt-4">
              <div className="blog-help__impact-head">
                <h2>Our Blog Impact</h2>
                <span className="text-xs font-semibold text-[var(--fitdog-muted)]">Last 30 Days</span>
              </div>
              <div className="blog-help__impact-grid">
                <div className="blog-help__metric">
                  <strong>{impact.views.available ? formatMetric(impact.views.value) : "—"}</strong>
                  <span>Total Views</span>
                  <em className={impact.views.available ? undefined : "is-muted"}>
                    {impact.views.available ? "Live" : impact.views.reason || "Not connected"}
                  </em>
                </div>
                <div className="blog-help__metric">
                  <strong>{impact.engagement.available ? `${impact.engagement.value}%` : "—"}</strong>
                  <span>Engagement</span>
                  <em className={impact.engagement.available ? undefined : "is-muted"}>
                    {impact.engagement.available ? "Live" : impact.engagement.reason || "Not connected"}
                  </em>
                </div>
                <div className="blog-help__metric">
                  <strong>{impact.subscribers.available ? formatMetric(impact.subscribers.value) : "—"}</strong>
                  <span>New Subscribers</span>
                  <em className={impact.subscribers.available ? undefined : "is-muted"}>
                    {impact.subscribers.available
                      ? impact.subscribers.deltaPercent != null
                        ? `↑ ${Math.abs(impact.subscribers.deltaPercent)}% vs prior period`
                        : "Active list"
                      : "No data yet"}
                  </em>
                </div>
              </div>
              {!impact.views.available ? (
                <Link href={BLOG_HELP_LINKS.settings} className="mt-3 inline-flex text-xs font-bold text-[var(--fitdog-orange)] hover:underline">
                  Configure analytics in Blog Settings →
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      </main>

      {videoOpen && tutorialVideoUrl ? (
        <div className="blog-help__modal" role="dialog" aria-modal="true" aria-label="Blog Generator overview video">
          <div className="blog-help__modal-card">
            <div className="blog-help__modal-head">
              <h2 className="text-sm font-bold text-[var(--fitdog-navy)]">Watch 2-Minute Overview</h2>
              <button type="button" className="blog-help__icon-btn" aria-label="Close video" onClick={closeVideo}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="blog-help__modal-body">
              <video ref={videoRef} src={tutorialVideoUrl} controls autoPlay playsInline>
                <track kind="captions" src="/assets/fitdog/blog-help/tutorial-captions.vtt" srcLang="en" label="English" default />
                Your browser does not support embedded video.
              </video>
              <details className="mt-3 text-sm text-[var(--fitdog-muted)]">
                <summary className="cursor-pointer font-semibold text-[var(--fitdog-navy)]">Transcript</summary>
                <p className="mt-2">
                  This overview video is configured by your Blog Settings administrator. It walks through Topics, Blog Generator, Needs Review, Calendar, and Performance using the live Fitdog Blog Generator in RuffOps.
                </p>
              </details>
            </div>
          </div>
        </div>
      ) : null}

      {lightbox ? (
        <button type="button" className="blog-help__lightbox" aria-label="Close image preview" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.src} alt={lightbox.alt} />
        </button>
      ) : null}
    </div>
  );
}
