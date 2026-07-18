import type { AdminBoardType, AdminTab } from "@/lib/admin/types";
import type { AdminUserRole } from "@/lib/admin/users";
import { ADMIN_USER_ROLE_LABELS, isCrossoverStaffRole, isFullAdminRole, isStaffOpsLimitedRole } from "@/lib/admin/users";

export type HelpAudience = "admin" | "staff_ops" | "viewer";

export type HelpVisualStep = {
  image?: string;
  illustration?: "cast-chrome" | "cast-button" | "cast-picker";
  video?: string;
  poster?: string;
  title: string;
  caption: string;
};

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
  audiences?: HelpAudience[];
  visualSteps?: HelpVisualStep[];
  walkthrough?: "lobby-cast" | "staff-cast" | "push-notices";
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
    title: "How do I log in to Fitdog Digi-Board?",
    summary: "Open /admin/login and sign in with your assigned Digi-Board username and password.",
    category: "Start Here",
    keywords: ["login", "password", "sign in", "access", "digi-board", "welcome back", "lonnie"],
    steps: [
      "Open the Fitdog Digi-Board login page (link below).",
      "Enter the username and password assigned to your account. The username field starts blank — do not use shared demo logins.",
      "Optional: check Remember me to save your username on this device.",
      "Click Sign In (or press Enter). Use the eye icon to show or hide your password.",
      "After several failed attempts, login may temporarily lock — wait and try again, or email Lonnie@fitdog.com for help.",
      "Your session stays active for about 12 hours, then you sign in again."
    ],
    tips: [
      "Need help? Email Lonnie@fitdog.com from the login screen.",
      "If Digi-Board asks you to set a new password after login, complete that step before the dashboard opens."
    ],
    links: [{ label: "Digi-Board Login", href: "/admin/login" }]
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
    summary: "Open Google Chrome first, then click Cast to TV, then pick the correct lobby monitor.",
    category: "TV Setup",
    keywords: ["tv", "chromecast", "cast", "display", "lobby tv", "screen", "chrome", "monitor"],
    audiences: ["admin", "viewer"],
    steps: [
      "On the computer connected to the lobby TV, open Google Chrome first (Safari and Firefox will not work for casting).",
      "Go to the Lobby Whiteboard URL (link below).",
      "On the whiteboard page, click the orange Cast to TV button.",
      "In Chrome’s device list, select the lobby TV or monitor — read the name carefully so you do not cast to the wrong screen.",
      "Leave the Chrome tab open. Closing the tab stops the cast."
    ],
    tips: [
      "Computer and Chromecast must be on the same Wi‑Fi.",
      "Use the step-by-step pictures below if you are unsure."
    ],
    walkthrough: "lobby-cast",
    visualSteps: [
      {
        illustration: "cast-chrome",
        title: "Step 1 — Open Chrome",
        caption: "Start Google Chrome on the front-desk computer before anything else."
      },
      {
        illustration: "cast-button",
        title: "Step 2 — Cast to TV",
        caption: "On the lobby whiteboard, click the Cast to TV button."
      },
      {
        illustration: "cast-picker",
        title: "Step 3 — Select monitor",
        caption: "Choose the device that matches your lobby TV."
      }
    ],
    links: [{ label: "Lobby Whiteboard URL", href: "/lobby/checkouts" }]
  },
  {
    id: "staff-tv-cast",
    title: "How do I put the staff board on a TV?",
    summary: "Same steps as lobby: Chrome first, Cast to TV, then pick the staff-area monitor.",
    category: "TV Setup",
    keywords: ["tv", "chromecast", "cast", "staff tv", "staff board", "chrome", "monitor"],
    audiences: ["admin", "staff_ops"],
    steps: [
      "On the computer near the staff display, open Google Chrome first.",
      "Open the Staff Digital Whiteboard page (link below).",
      "Click Cast to TV on the staff board.",
      "In Chrome’s picker, select the staff TV or monitor — not the lobby TV.",
      "Keep the tab open for the whole shift."
    ],
    tips: ["Lobby and staff TVs often have different names in the picker — double-check before selecting."],
    walkthrough: "staff-cast",
    visualSteps: [
      {
        illustration: "cast-chrome",
        title: "Step 1 — Open Chrome",
        caption: "Use Chrome on the computer hooked up near the staff display."
      },
      {
        illustration: "cast-button",
        title: "Step 2 — Cast to TV",
        caption: "Click Cast to TV on the staff whiteboard page."
      },
      {
        illustration: "cast-picker",
        title: "Step 3 — Select monitor",
        caption: "Pick the staff-area TV, not the lobby TV."
      }
    ],
    links: [{ label: "Staff Whiteboard URL", href: "/" }]
  },
  {
    id: "troubleshoot-cast",
    title: "Casting is not working",
    summary: "Fix Chromecast and browser issues when Cast to TV fails.",
    category: "Troubleshooting",
    keywords: ["cast failed", "chromecast", "no devices", "tv not showing", "chrome"],
    audiences: ["admin", "staff_ops", "viewer"],
    steps: [
      "Confirm you opened Google Chrome — other browsers cannot use Cast to TV.",
      "Make sure the computer and Chromecast are on the same Wi‑Fi network.",
      "Refresh the whiteboard page and click Cast to TV again.",
      "Restart the TV or Chromecast if no devices appear in the list.",
      "Ask an admin to verify you are on the correct board URL."
    ]
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
    walkthrough: "push-notices",
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
    id: "front-desk-log",
    title: "How does the Front Desk Log (Crossover Log) work?",
    summary: "Track today’s handoffs in Crossover Log, keep closed history in Archived Log, and check out assessment dogs correctly.",
    category: "Staff Board",
    keywords: [
      "front desk log",
      "crossover log",
      "archived log",
      "check out",
      "assessment",
      "handoff",
      "shift log",
      "delete"
    ],
    steps: [
      "Open Staff Digital Whiteboard → Front Desk Log.",
      "Crossover Log shows current-day activity so every role can hand off the shift.",
      "Open Log shows unresolved items that still need follow-up.",
      "Archived Log shows prior-day resolved, completed, Check Out, and archived entries (including past imported notes).",
      "Add a new entry with Add Shift Log Entry, or use Quick Templates for common log types.",
      "For New Dog Assessment entries: choose Mark Check Out (Resolved). They stay on today’s Crossover Log — even if archived the same day — then move to Archived Log the next day.",
      "Delete is only available for entries you created. Super Admin, Admin, and Management can delete any entry."
    ],
    tips: [
      "Front Desk Log is an internal Digi-Board tool. It does not change Lobby or Staff whiteboard Gingr sync.",
      "Use filters (log type, status, assigned to, urgent) to find items quickly during crossover."
    ],
    adminTab: "crossover_communication",
    adminBoard: "staff"
  },
  {
    id: "staff-ops-pages",
    title: "How do Owner Follow Up and Active Issues work?",
    summary: "Track client follow-ups and urgent operational issues alongside the Front Desk Log.",
    category: "Staff Board",
    keywords: ["owner follow up", "active issues", "urgent", "staff admin", "handoff", "front desk log"],
    steps: [
      "Use Front Desk Log (Crossover Log) for daily shift notes and assessment Check Outs — see the Front Desk Log help article.",
      "Open Owner Follow Up to assign client follow-up tasks with due dates and statuses.",
      "Open Active Issues to manage urgent or critical items linked from Front Desk Log and Owner Follow Up.",
      "High, Critical, or urgent Front Desk Log and Owner Follow Up records can create an Active Issue.",
      "Use Push to Staff Whiteboard only when an internal item should become a temporary Push Notice."
    ],
    tips: [
      "These pages are internal Digi-Board tools and do not automatically display on the Staff Digital Whiteboard.",
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
      "Owner Admin — full access. Manager Admin — can manage content and users. Front Desk Coordinator and Team Lead — staff board Push Notices and operations tabs only. Viewer — read-only style access.",
      "The new user logs in with their email and temporary password."
    ],
    adminTab: "users",
    tips: ["Run Supabase migration 007 first if the Users tab shows no data or errors."]
  },
  {
    id: "front-desk-coordinator",
    title: "What can a Front Desk Coordinator or Team Lead do?",
    summary: "Front Desk Coordinator and Team Lead accounts use Staff Digi-Board tools: Push Notices, Front Desk Log, follow-ups, and view-only Staff Directory.",
    category: "Users & Login",
    keywords: ["front desk coordinator", "team leader", "role", "permissions", "push notices", "staff directory", "crossover log"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "After login, you are routed to Staff Digital Whiteboard → Push Notices.",
      "Use Front Desk Log → Crossover Log for today’s handoffs, Open Log for unresolved items, and Archived Log for prior closed entries.",
      "You can also use Owner Follow Up, Active Issues, Push Notices, Notifications, Walks Board, and Help Center.",
      "Staff Directory is view-only — search and review staff records, but you cannot add, edit, or delete entries.",
      "You can delete only Front Desk Log entries you created (unless you are Super Admin, Admin, or Management).",
      "You cannot access Lobby content, global settings, logs, integrations, or the full Admin Users area."
    ],
    adminTab: "crossover_communication",
    adminBoard: "staff",
    tips: ["Use these roles for front desk or team lead staff who need live handler tools without full admin access."]
  },
  {
    id: "groomer-trainer-crossover",
    title: "What can a Groomer or Trainer do?",
    summary: "Groomers and Trainers use Digi-Board staff tools, Front Desk Log handoffs, push panels, and (for trainers) package & class commissions.",
    category: "Users & Login",
    keywords: ["groomer", "trainer", "crossover", "grooming", "training", "handoff", "commissions", "package", "class", "check out"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "Groomers land on Staff Digital Whiteboard → Grooming Push and can use Front Desk Log for handoffs.",
      "Trainers land on Staff Digital Whiteboard → Trainer Push.",
      "On Front Desk Log, use Crossover Log for today’s notes. Assessment dogs use Mark Check Out so they stay on today’s log until the next day.",
      "You can delete only Front Desk Log entries you created.",
      "Trainers: open Commissions → Package & Class Commissions to review earnings, comment, or dispute a row.",
      "Both roles also have Notifications, Video Links, Walks Board, and Help Center."
    ],
    adminTab: "trainer_push",
    adminBoard: "staff",
    tips: ["Assign the Groomer or Trainer dashboard role in Admin Users or Staff Directory when creating a login."]
  },
  {
    id: "dog-handler-basics",
    title: "What can a Dog Handler do?",
    summary: "Dog Handler accounts use Staff Digi-Board tools for yard work, walks, reminders, and Front Desk Log notes.",
    category: "Users & Login",
    keywords: ["dog handler", "daycare", "handler", "walks", "checklist", "front desk log"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "Use the Staff Digital Whiteboard for live check-ins, check-outs, and handler reminders.",
      "Open Walks Board to track dogs that need walks and mark walked or snooze when allowed.",
      "Use Front Desk Log → Crossover Log to add or review today’s handoff notes. You can delete only entries you created.",
      "Open Notifications for alerts assigned to you, and Help Center anytime you need a guide.",
      "Dog Handler accounts do not manage Lobby content, admin users, integrations, or global settings."
    ],
    adminTab: "walks_board",
    adminBoard: "staff",
    tips: ["If a reminder or notice appears on the Staff Whiteboard, follow it and clear it only when your lead says it is done."]
  },
  {
    id: "management-role",
    title: "What can an Assistant Manager (Management) do?",
    summary: "Management can run staff Digi-Board operations, review Front Desk Log history, and delete any Front Desk Log entry when needed.",
    category: "Users & Login",
    keywords: ["assistant manager", "management", "role", "permissions", "front desk log", "delete"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned Management credentials.",
      "Use Staff Digital Whiteboard tools: Push Notices, Front Desk Log, Owner Follow Up, Active Issues, Staff Directory, and related staff tabs.",
      "On Front Desk Log, review Crossover Log (today), Open Log, and Archived Log (prior closed items).",
      "Management can delete any Front Desk Log entry — not only their own.",
      "Help with commissions, write-ups, and management support tabs when those tools are enabled for your account.",
      "Full Super Admin-only areas (integrations secrets, permission matrix, some global settings) may still be restricted."
    ],
    adminTab: "crossover_communication",
    adminBoard: "staff",
    tips: ["Email Lonnie@fitdog.com if you need a permission that is missing from your login."]
  },
  {
    id: "marketing-account",
    title: "What can a Marketing Account do?",
    summary: "Marketing accounts manage lobby-facing Digi-Board content such as promotions, messages, and CAST-TV media when enabled.",
    category: "Users & Login",
    keywords: ["marketing", "promotions", "lobby", "cast-tv", "slideshow"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned Marketing credentials.",
      "Use Lobby Whiteboard tools for promotions, content, and schedule updates your role can access.",
      "If CAST-TV or lobby slideshow tools are enabled for your account, upload and order media there.",
      "Marketing accounts do not manage staff operations, Front Desk Log, Gingr integrations, or admin user security.",
      "Use Help Center for lobby board guides, and email Lonnie@fitdog.com if login access looks wrong."
    ],
    adminTab: "promotions",
    adminBoard: "lobby",
    tips: ["Publish or save changes when your board tools show unsaved work so TVs pick up the latest content."]
  },
  {
    id: "change-password",
    title: "How do I change my password?",
    summary: "Set a new password when Digi-Board prompts you, or ask an admin to reset it from Users.",
    category: "Users & Login",
    keywords: ["password", "reset", "change", "security", "temporary password"],
    steps: [
      "If Digi-Board shows Set New Password after sign-in, enter a new password, confirm it, and click Update Password.",
      "You cannot continue to the dashboard until a required password change is finished.",
      "Super Admin and Admin users can also reset another user’s password from Users → ⋯ → Change password.",
      "If you forgot your password, email Lonnie@fitdog.com from the login screen (Forgot password?)."
    ],
    tips: ["Never share Digi-Board passwords. Each person should use their own assigned login."]
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
    summary: "Confirm your Digi-Board credentials, wait out a temporary lockout, or email Lonnie@fitdog.com.",
    category: "Troubleshooting",
    keywords: ["login failed", "locked out", "401", "unauthorized", "password wrong", "digi-board", "lonnie"],
    steps: [
      "Open /admin/login and confirm you are using your assigned Digi-Board username and password (username starts blank).",
      "Use the eye icon to confirm the password was typed correctly.",
      "Wait about 15 minutes if too many failed attempts temporarily locked the login.",
      "If Digi-Board asks for a new password, complete Set New Password before trying the dashboard again.",
      "Still stuck? Email Lonnie@fitdog.com from the login help link.",
      "Admins only: confirm production auth env vars (ADMIN_PASSWORD_HASH, ADMIN_SESSION_SECRET) are set on Vercel if env-based login is used."
    ],
    links: [{ label: "Digi-Board Login", href: "/admin/login" }]
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
      "Lobby TV token: LOBBY_DISPLAY_TOKEN (optional — embeds token in cast URLs; lobby reads stay open for all staff)",
      "After changing env vars on Vercel, redeploy once."
    ],
    tips: ["See .env.example in the project for the full list."]
  }
];

const EVERYONE: HelpAudience[] = ["admin", "staff_ops", "viewer"];
const ADMIN_ONLY: HelpAudience[] = ["admin"];
const STAFF_OPS_AND_ADMIN: HelpAudience[] = ["admin", "staff_ops"];
const LOBBY_VIEWERS: HelpAudience[] = ["admin", "viewer"];

const ARTICLE_AUDIENCES: Record<string, HelpAudience[]> = {
  "what-is-this": EVERYONE,
  "first-login": EVERYONE,
  "env-vars": ADMIN_ONLY,
  "how-data-flows": ADMIN_ONLY,
  "publish-changes": ADMIN_ONLY,
  "lobby-messages": LOBBY_VIEWERS,
  "lobby-promotions": LOBBY_VIEWERS,
  "lobby-schedule": LOBBY_VIEWERS,
  "lobby-display-settings": ADMIN_ONLY,
  "lobby-tv-cast": LOBBY_VIEWERS,
  "staff-tv-cast": STAFF_OPS_AND_ADMIN,
  "staff-reminders": EVERYONE,
  "staff-display": STAFF_OPS_AND_ADMIN,
  "push-notices": STAFF_OPS_AND_ADMIN,
  "schedule-push-notices": STAFF_OPS_AND_ADMIN,
  "front-desk-log": STAFF_OPS_AND_ADMIN,
  "staff-ops-pages": STAFF_OPS_AND_ADMIN,
  "add-admin-user": ADMIN_ONLY,
  "front-desk-coordinator": STAFF_OPS_AND_ADMIN,
  "groomer-trainer-crossover": STAFF_OPS_AND_ADMIN,
  "dog-handler-basics": STAFF_OPS_AND_ADMIN,
  "management-role": STAFF_OPS_AND_ADMIN,
  "marketing-account": LOBBY_VIEWERS,
  "change-password": EVERYONE,
  "board-switcher": ADMIN_ONLY,
  "preview-and-refresh": ADMIN_ONLY,
  "integrations-check": ADMIN_ONLY,
  "view-logs": ADMIN_ONLY,
  "global-settings": ADMIN_ONLY,
  "troubleshoot-login": EVERYONE,
  "troubleshoot-no-checkouts": EVERYONE,
  "troubleshoot-users-tab": ADMIN_ONLY
};

/** Shared Digi-Board basics for every signed-in role. */
const CORE_ACCOUNT_ARTICLE_IDS = new Set([
  "what-is-this",
  "first-login",
  "change-password",
  "troubleshoot-login",
  "staff-reminders"
]);

const MANAGEMENT_EXTRA_ARTICLE_IDS = new Set([
  "front-desk-log",
  "staff-ops-pages",
  "push-notices",
  "schedule-push-notices",
  "staff-display",
  "management-role",
  "front-desk-coordinator",
  "groomer-trainer-crossover",
  "dog-handler-basics",
  "publish-changes",
  "board-switcher",
  "preview-and-refresh",
  "troubleshoot-no-checkouts",
  "lobby-tv-cast",
  "staff-tv-cast"
]);

const CROSSOVER_STAFF_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "front-desk-log",
  "groomer-trainer-crossover",
  "push-notices",
  "staff-tv-cast",
  "troubleshoot-no-checkouts"
]);

const DOG_HANDLER_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "front-desk-log",
  "dog-handler-basics",
  "staff-tv-cast",
  "troubleshoot-no-checkouts"
]);

const MARKETING_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "marketing-account",
  "lobby-messages",
  "lobby-promotions",
  "lobby-schedule",
  "lobby-tv-cast",
  "troubleshoot-no-checkouts"
]);

function getArticleAudiences(article: HelpArticle): HelpAudience[] {
  return article.audiences ?? ARTICLE_AUDIENCES[article.id] ?? ADMIN_ONLY;
}

export function articleVisibleToRole(article: HelpArticle, role: AdminUserRole): boolean {
  if (isFullAdminRole(role)) return true;
  const audiences = getArticleAudiences(article);

  if (role === "assistant_manager") {
    return audiences.includes("staff_ops") || audiences.includes("viewer") || MANAGEMENT_EXTRA_ARTICLE_IDS.has(article.id);
  }

  if (role === "daycare") {
    return DOG_HANDLER_ARTICLE_IDS.has(article.id);
  }

  if (role === "marketing") {
    return MARKETING_ARTICLE_IDS.has(article.id) || audiences.includes("viewer");
  }

  if (role === "viewer") {
    return audiences.includes("viewer");
  }

  if (isStaffOpsLimitedRole(role)) {
    return audiences.includes("staff_ops");
  }

  if (isCrossoverStaffRole(role)) {
    return CROSSOVER_STAFF_ARTICLE_IDS.has(article.id);
  }

  return false;
}

export function filterHelpArticlesForRole(role: AdminUserRole): HelpArticle[] {
  return HELP_ARTICLES.filter((article) => articleVisibleToRole(article, role));
}

export function filterHelpCategoriesForRole(role: AdminUserRole): HelpCategory[] {
  const visible = new Set(filterHelpArticlesForRole(role).map((article) => article.category));
  return HELP_CATEGORIES.filter((category) => visible.has(category));
}

export function getHelpRoleLabel(role: AdminUserRole): string {
  return ADMIN_USER_ROLE_LABELS[role] ?? role;
}

export function searchHelpArticles(
  query: string,
  category: HelpCategory | "All" = "All",
  role: AdminUserRole = "owner_admin"
) {
  const normalized = query.trim().toLowerCase();

  return filterHelpArticlesForRole(role).filter((article) => {
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
