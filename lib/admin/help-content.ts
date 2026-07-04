import type { AdminBoardType, AdminTab } from "@/lib/admin/types";

export type HelpLink = {
  label: string;
  href: string;
  external?: boolean;
};

export type HelpArticle = {
  id: string;
  title: string;
  summary: string;
  category: HelpCategory;
  keywords: string[];
  steps: string[];
  tips?: string[];
  adminTab?: AdminTab;
  adminBoard?: AdminBoardType;
  links?: HelpLink[];
};

export type HelpCategory =
  | "Start Here"
  | "Lobby Board"
  | "Staff Board"
  | "Admin Dashboard"
  | "Users & Login"
  | "Data & Sync"
  | "TV Setup"
  | "Troubleshooting";

export const HELP_CATEGORIES: HelpCategory[] = [
  "Start Here",
  "Lobby Board",
  "Staff Board",
  "Admin Dashboard",
  "Users & Login",
  "Data & Sync",
  "TV Setup",
  "Troubleshooting"
];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "what-is-this",
    title: "What are these whiteboards?",
    summary: "Two separate screens: one for guests in the lobby, one for staff at the desk.",
    category: "Start Here",
    keywords: ["overview", "intro", "lobby", "staff", "difference", "boards"],
    steps: [
      "Lobby Whiteboard — shown to guests in the lobby. Displays who is checking out right now, promotions, and class schedule.",
      "Staff Digital Whiteboard — shown to your team behind the desk. Displays check-ins, check-outs, and team reminders.",
      "Both boards read the same cached data from Supabase. They do not call Gingr directly.",
      "You manage both boards from this Admin Dashboard."
    ],
    links: [
      { label: "Open Lobby Whiteboard", href: "/lobby/checkouts" },
      { label: "Open Staff Whiteboard", href: "/" }
    ]
  },
  {
    id: "first-login",
    title: "How do I log in to Admin?",
    summary: "Go to /admin/login and sign in with your admin username and password.",
    category: "Start Here",
    keywords: ["login", "password", "sign in", "access", "admin"],
    steps: [
      "Open the Admin login page (link below).",
      "Enter your username (usually admin) and password.",
      "After 5 wrong attempts, login locks for 15 minutes.",
      "Your session stays active for about 12 hours, then you log in again."
    ],
    links: [{ label: "Admin Login", href: "/admin/login" }],
    adminTab: "users"
  },
  {
    id: "how-data-flows",
    title: "Where does checkout data come from?",
    summary: "Gingr sends updates to Supabase. The boards only read that cached data.",
    category: "Data & Sync",
    keywords: ["gingr", "supabase", "sync", "webhook", "cache", "data source"],
    steps: [
      "Gingr sends checkout/check-in events to a webhook URL (shown in Integrations).",
      "Those events are stored in Supabase — your safe, cached copy.",
      "Lobby and Staff boards read from Supabase only. They never hit Gingr directly.",
      "This keeps displays fast and protects your Gingr account from extra load."
    ],
    adminTab: "integrations"
  },
  {
    id: "publish-changes",
    title: "What does Publish Changes do?",
    summary: "Saves a version number and timestamp so you know what's live on the TVs.",
    category: "Admin Dashboard",
    keywords: ["publish", "version", "save", "deploy", "live"],
    steps: [
      "Most edits save automatically when you change a setting.",
      "Click Publish Changes when you're ready to mark a version as live.",
      "Each publish bumps the version (v1.0.1, v1.0.2, etc.) and records who published.",
      "Use View Change History to see past publishes."
    ],
    adminTab: "overview"
  },
  {
    id: "lobby-messages",
    title: "How do I change lobby welcome messages?",
    summary: "Edit Content → Lobby Message and Footer Message.",
    category: "Lobby Board",
    keywords: ["lobby", "message", "footer", "welcome", "text", "content"],
    steps: [
      "In Admin, make sure Lobby Whiteboard is selected at the top.",
      "Go to the Content tab.",
      "Edit Lobby Message (main welcome text) and Footer Message (bottom of screen).",
      "Changes save automatically. Click Publish Changes when ready."
    ],
    adminTab: "content",
    adminBoard: "lobby",
    links: [{ label: "View Lobby Board", href: "/lobby/checkouts" }]
  },
  {
    id: "lobby-promotions",
    title: "How do I add or edit promotions?",
    summary: "Use the Promotions tab to add, edit, activate, or schedule lobby promos.",
    category: "Lobby Board",
    keywords: ["promotion", "promo", "slideshow", "services", "marketing"],
    steps: [
      "Select Lobby Whiteboard at the top.",
      "Open the Promotions tab.",
      "Click Add Promotion, fill in title and details, then save.",
      "Use the ⋯ menu to duplicate, activate, deactivate, or delete.",
      "Use the search bar and status filter to find promos quickly."
    ],
    adminTab: "promotions",
    adminBoard: "lobby"
  },
  {
    id: "lobby-schedule",
    title: "How do I update the class schedule?",
    summary: "Edit Monday–Friday classes in the Class Schedule tab.",
    category: "Lobby Board",
    keywords: ["class", "schedule", "training", "weekday", "monday"],
    steps: [
      "Select Lobby Whiteboard at the top.",
      "Open the Class Schedule tab.",
      "Edit class names, add new classes, reorder with ↑ ↓, or remove with trash icon.",
      "Click Reset to default if you want the original Fitdog schedule back."
    ],
    adminTab: "schedule",
    adminBoard: "lobby"
  },
  {
    id: "lobby-display-settings",
    title: "How do I change lobby display options?",
    summary: "Control queue size, refresh speed, and what sections show on screen.",
    category: "Lobby Board",
    keywords: ["queue", "refresh", "display", "max", "promotions toggle"],
    steps: [
      "Select Lobby Whiteboard at the top.",
      "Open Display Settings (or Overview).",
      "Max Queue Count — how many dogs show in the checkout list (3–6).",
      "Refresh Interval — how often the screen updates (2–5 seconds).",
      "Toggle Show Promotions and Show Class Schedule on or off."
    ],
    adminTab: "display",
    adminBoard: "lobby"
  },
  {
    id: "lobby-tv-cast",
    title: "How do I put the lobby board on a TV?",
    summary: "Open the lobby board in Chrome and use the Cast button for Chromecast.",
    category: "TV Setup",
    keywords: ["tv", "chromecast", "cast", "display", "lobby tv", "screen"],
    steps: [
      "On the lobby TV device, open Chrome browser.",
      "Go to the Lobby Whiteboard URL (link below).",
      "Click the Cast button on the board to send it to your Chromecast.",
      "Leave the browser tab open — the board refreshes automatically."
    ],
    links: [{ label: "Lobby Whiteboard URL", href: "/lobby/checkouts" }]
  },
  {
    id: "staff-reminders",
    title: "How do I change staff reminders and notices?",
    summary: "Edit team reminder and important notice text in Content or Display Settings.",
    category: "Staff Board",
    keywords: ["staff", "reminder", "notice", "team", "desk"],
    steps: [
      "Select Staff Digital Whiteboard at the top.",
      "Go to Content to edit Team Reminder, Important Notice, and Footer Message.",
      "Toggle Show Team Reminders in Display Settings if you want them visible.",
      "Click Open Staff Whiteboard to preview on the real display."
    ],
    adminTab: "content",
    adminBoard: "staff",
    links: [{ label: "View Staff Board", href: "/" }]
  },
  {
    id: "staff-display",
    title: "How does the staff checkout board work?",
    summary: "Shows dogs checking in and out in real time from cached Gingr data.",
    category: "Staff Board",
    keywords: ["checkout", "checkin", "check-in", "check-out", "dogs", "queue"],
    steps: [
      "When Gingr prompts a checkout, the dog appears on the staff board automatically.",
      "No manual edits needed — staff board stays synced via Supabase.",
      "Refresh interval controls how quickly new checkouts appear (default 2 seconds).",
      "Hidden dogs can be managed through legacy admin APIs if needed."
    ],
    adminTab: "display",
    adminBoard: "staff",
    links: [{ label: "View Staff Board", href: "/" }]
  },
  {
    id: "push-notices",
    title: "How do I push notices to the Staff Whiteboard?",
    summary: "Use Push Notices to send live handler reminders, save custom notices, and clear the active alert.",
    category: "Staff Board",
    keywords: ["push notices", "notice", "alert", "handler", "staff", "front desk", "owner complaint"],
    steps: [
      "Select Staff Digital Whiteboard at the top.",
      "Open Push Notices.",
      "Use Quick Push for the default owner complaint notices, or fill in Create Custom Notice.",
      "Choose priority and display mode. Urgent notices use stronger visual treatment on the Staff Whiteboard.",
      "Click Push Notice to show it immediately. Click Clear Active Notice when it should come down.",
      "Recent Notice History lets you push a previous notice again or edit/delete custom notices."
    ],
    tips: [
      "Push Notices only appear on the Staff Digital Whiteboard. They never appear on the Lobby Whiteboard.",
      "This feature is separate from Gingr and does not add Gingr API calls."
    ],
    adminTab: "push_notices",
    adminBoard: "staff",
    links: [{ label: "Open Staff Whiteboard", href: "/" }]
  },
  {
    id: "schedule-push-notices",
    title: "How do scheduled and recurring Push Notices work?",
    summary: "Schedule a notice for later, or repeat it every day, week, or month at the selected time.",
    category: "Staff Board",
    keywords: ["schedule", "scheduled notice", "recurring", "repeat", "day", "week", "month", "time"],
    steps: [
      "Open Push Notices on the Staff Digital Whiteboard admin.",
      "Create a custom notice with title, message, priority, and display mode.",
      "Turn on Schedule for later and choose the scheduled date and time.",
      "For a one-time notice, leave Recurring set to Does not repeat.",
      "For a recurring notice, choose Every day, Every week, or Every month.",
      "Click Schedule Notice. The notice activates automatically when the Staff Whiteboard checks for notices."
    ],
    tips: [
      "Recurring notices reschedule themselves after each run.",
      "A scheduled notice stays separate from dog check-in/check-out syncing."
    ],
    adminTab: "push_notices",
    adminBoard: "staff"
  },
  {
    id: "staff-ops-pages",
    title: "How do Crossover, Owner Follow Up, and Active Issues work?",
    summary: "Use the new Staff Admin tabs to track handoffs, client follow-ups, and urgent operational issues.",
    category: "Staff Board",
    keywords: ["crossover", "owner follow up", "active issues", "urgent", "staff admin", "handoff"],
    steps: [
      "Open Crossover Communication to send department handoffs and operational notes.",
      "Open Owner Follow Up to assign client follow-up tasks with due dates and statuses.",
      "Open Active Issues to manage urgent or critical items from front desk, crossover messages, and owner follow-ups.",
      "High, Critical, or urgent Crossover and Owner Follow Up records automatically create an Active Issue.",
      "Use Push to Staff Whiteboard only when an internal item should become a temporary Push Notice."
    ],
    tips: [
      "These pages are internal admin tools and do not automatically display on the Staff Digital Whiteboard.",
      "They do not call Gingr or change Staff Whiteboard polling."
    ],
    adminTab: "active_issues",
    adminBoard: "staff"
  },
  {
    id: "add-admin-user",
    title: "How do I add another admin user?",
    summary: "Go to Users → Add Admin User and set a temporary password.",
    category: "Users & Login",
    keywords: ["user", "add admin", "password", "role", "manager", "viewer"],
    steps: [
      "Open the Users tab.",
      "Click Add Admin User.",
      "Enter full name, email, role, and a temporary password.",
      "Owner Admin — full access. Manager Admin — can manage content and users. Front Desk Coordinator and Team Leader — staff board Push Notices and operations tabs only. Viewer — read-only style access.",
      "The new user logs in with their email and temporary password."
    ],
    adminTab: "users",
    tips: ["Run Supabase migration 007 first if the Users tab shows no data or errors."]
  },
  {
    id: "front-desk-coordinator",
    title: "What can a Front Desk Coordinator or Team Leader do?",
    summary: "Front Desk Coordinator and Team Leader accounts share the same staff board access: Push Notices, Crossover Communication, Owner Follow Up, Active Issues, and related staff tabs.",
    category: "Users & Login",
    keywords: ["front desk coordinator", "team leader", "role", "permissions", "push notices", "limited user"],
    steps: [
      "Front Desk Coordinator and Team Leader users log in with their assigned email and password.",
      "After login, they are routed to Staff Digital Whiteboard → Push Notices.",
      "They can use Push Notices, Crossover Communication, Owner Follow Up, Active Issues, Staff Directory, and related staff tabs.",
      "They cannot access Lobby content, settings, logs, integrations, users, Gingr setup, or other admin areas."
    ],
    adminTab: "users",
    tips: ["Use these roles for front desk or team lead staff who need live handler tools without full admin access."]
  },
  {
    id: "change-password",
    title: "How do I change an admin password?",
    summary: "Users tab → ⋯ menu → Change password.",
    category: "Users & Login",
    keywords: ["password", "reset", "change", "security"],
    steps: [
      "Open the Users tab.",
      "Find the user and click the ⋯ (more) button.",
      "Choose Change password.",
      "Enter and confirm the new password, then save."
    ],
    adminTab: "users"
  },
  {
    id: "board-switcher",
    title: "How do I switch between Lobby and Staff settings?",
    summary: "Use the board switcher buttons at the top of Admin.",
    category: "Admin Dashboard",
    keywords: ["switch", "lobby", "staff", "board switcher"],
    steps: [
      "At the top of Admin, click Lobby Whiteboard or Staff Digital Whiteboard.",
      "The page title, preview, and settings all update for that board.",
      "Your last selected board is remembered next time you log in."
    ],
    adminTab: "overview"
  },
  {
    id: "preview-and-refresh",
    title: "What do Preview Live and Refresh do?",
    summary: "Preview shows a mockup. Refresh reloads the latest data from Supabase.",
    category: "Admin Dashboard",
    keywords: ["preview", "refresh", "reload", "live"],
    steps: [
      "Preview Live — opens a larger preview modal (desktop + mobile sizes).",
      "Refresh — fetches the newest dashboard data and checkout counts.",
      "Open Lobby/Staff Whiteboard — opens the real public board in a new tab."
    ],
    adminTab: "overview"
  },
  {
    id: "integrations-check",
    title: "How do I check if sync is healthy?",
    summary: "Open Integrations to see Supabase status and webhook info.",
    category: "Data & Sync",
    keywords: ["health", "status", "integration", "webhook", "failed", "test connection"],
    steps: [
      "Open the Integrations tab.",
      "Check Supabase status and last sync time.",
      "Review Failed webhook events count — zero is healthy.",
      "Click Test Connection to verify Supabase read access (safe, no Gingr calls)."
    ],
    adminTab: "integrations"
  },
  {
    id: "view-logs",
    title: "How do I see who changed what?",
    summary: "The Logs tab shows audit activity and webhook events.",
    category: "Admin Dashboard",
    keywords: ["logs", "audit", "history", "activity", "webhook"],
    steps: [
      "Open the Logs tab.",
      "Audit logs show admin actions: login, publish, user changes, etc.",
      "Filter by action type, admin email, or search keywords.",
      "Webhook sections show recent Gingr events and any failures."
    ],
    adminTab: "logs"
  },
  {
    id: "global-settings",
    title: "What are global Settings for?",
    summary: "Defaults for timezone, security, display theme, and sync warnings.",
    category: "Admin Dashboard",
    keywords: ["settings", "timezone", "security", "session", "theme"],
    steps: [
      "Open the Settings tab.",
      "General — default board on login, business name, help link.",
      "Security — password rules, session timeout, env admin login toggle.",
      "Display — default TV resolution, text size, animation level.",
      "Click Save settings when you see Unsaved changes."
    ],
    adminTab: "settings"
  },
  {
    id: "troubleshoot-login",
    title: "I can't log in — what should I check?",
    summary: "Verify password, env vars on Vercel, and that you're not locked out.",
    category: "Troubleshooting",
    keywords: ["login failed", "locked out", "401", "unauthorized", "password wrong"],
    steps: [
      "Make sure ADMIN_PASSWORD_HASH is set in Vercel (production).",
      "Make sure ADMIN_SESSION_SECRET is set in Vercel.",
      "Wait 15 minutes if you hit too many failed attempts.",
      "Try logging in locally with the same credentials in .env.local."
    ],
    adminTab: "users",
    links: [{ label: "Admin Login", href: "/admin/login" }]
  },
  {
    id: "troubleshoot-no-checkouts",
    title: "Checkouts aren't showing on the board",
    summary: "Usually a sync or webhook issue — check Integrations and Logs.",
    category: "Troubleshooting",
    keywords: ["missing", "empty", "no dogs", "checkout not showing", "stale"],
    steps: [
      "Confirm dogs are prompted for checkout in Gingr first.",
      "Open Integrations — check last sync time and failed webhook count.",
      "Open Logs — look for unprocessed webhook events.",
      "Click Refresh in Admin, then reload the public board tab.",
      "Lobby and Staff boards are independent — check the right URL."
    ],
    adminTab: "integrations",
    links: [
      { label: "Lobby Board", href: "/lobby/checkouts" },
      { label: "Staff Board", href: "/" }
    ]
  },
  {
    id: "troubleshoot-users-tab",
    title: "Users tab is empty or shows errors",
    summary: "Run Supabase migration 007 to create the admin_users table.",
    category: "Troubleshooting",
    keywords: ["migration", "007", "admin_users", "database", "supabase sql"],
    steps: [
      "Open your Supabase project → SQL Editor.",
      "Run the migration file: 007_admin_users_and_settings.sql",
      "This creates admin_users, admin_audit_logs, and admin_settings tables.",
      "Reload Admin and open Users again.",
      "Until migration runs, env-based login (ADMIN_PASSWORD_HASH) still works."
    ],
    adminTab: "users"
  },
  {
    id: "env-vars",
    title: "What environment variables does production need?",
    summary: "Supabase keys, Gingr webhook secret, and admin auth vars on Vercel.",
    category: "Start Here",
    keywords: ["vercel", "env", "environment", "variables", "production"],
    steps: [
      "Supabase: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY",
      "Gingr: GINGR_API_KEY, GINGR_WEBHOOK_SIGNATURE_KEY, GINGR_SUBDOMAIN",
      "Admin: ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET, ADMIN_USERNAME (optional)",
      "Lobby TV token: LOBBY_DISPLAY_TOKEN (if using secured lobby URL)",
      "After changing env vars on Vercel, redeploy once."
    ],
    tips: ["See .env.example in the project for the full list."]
  }
];

export function searchHelpArticles(query: string, category: HelpCategory | "All" = "All") {
  const normalized = query.trim().toLowerCase();

  return HELP_ARTICLES.filter((article) => {
    if (category !== "All" && article.category !== category) return false;
    if (!normalized) return true;

    const haystack = [
      article.title,
      article.summary,
      article.category,
      ...article.keywords,
      ...article.steps,
      ...(article.tips ?? [])
    ]
      .join(" ")
      .toLowerCase();

    return normalized.split(/\s+/).every((term) => haystack.includes(term));
  });
}

export function buildAdminTabHref(tab: AdminTab, board?: AdminBoardType) {
  const params = new URLSearchParams({ tab });
  if (board) params.set("board", board);
  return `/admin?${params.toString()}`;
}
