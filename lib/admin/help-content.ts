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
    id: "blog-generator-how-to",
    title: "How to Use the Fitdog Blog Generator",
    summary: "Create topics, generate drafts, review, schedule, and publish Fitdog blog content in RuffOps.",
    category: "Admin Dashboard",
    keywords: [
      "blog",
      "blog generator",
      "fitdog blog",
      "topics",
      "articles",
      "seo",
      "publish",
      "automatic blog",
      "content"
    ],
    steps: [
      "Open the Fitdog Help Center guide for a full walkthrough with screenshots.",
      "Use Topics to score and save ideas, then Blog Generator to create drafts.",
      "Review in Needs Review before Approving, Scheduling, or Publishing.",
      "Check Performance for live publish and subscriber metrics — unavailable analytics stay labeled honestly."
    ],
    tips: [
      "Never approve an article just because it is complete.",
      "Auto-publish stays off unless an authorized admin enables it."
    ],
    links: [
      {
        label: "Open How to Use guide",
        href: "/admin/blog/help/how-to-use-blog-generator"
      },
      {
        label: "Open Blog Generator",
        href: "/admin/automatic-blog"
      }
    ],
    audiences: ["admin"]
  },
  {
    id: "what-is-this",
    title: "What is Fitdog Digi-Board (RuffOps)?",
    summary: "Live ops layer for Fitdog: Lobby and Staff TVs, My Shift / Ops Command Center, Team Log, Grooming Push, Route Generator, and more — Gingr stays the business system of record.",
    category: "Start Here",
    keywords: [
      "overview",
      "intro",
      "lobby",
      "staff",
      "difference",
      "boards",
      "team log",
      "digi-board",
      "ruffops",
      "ops command center",
      "my shift"
    ],
    steps: [
      "Lobby Whiteboard — guest-facing lobby TV. Shows who is checking out, promotions, and class schedule.",
      "Staff Digital Whiteboard — team TV behind the desk. Shows check-ins, check-outs, walks, and push notices.",
      "My Shift / Ops Command Center — your Digi-Board homepage for live dogs, tasks, alerts, and Gingr connection status.",
      "Clean sidebar menu — each role has a short list of primary tabs (about 10 or fewer). Extra tools live inside hubs like Floor Ops, Whiteboard, People & HR, Apps, and Admin.",
      "Team Log, pushes, photos, Route Generator, and other tools still work the same — open them from a hub button if they are not on the main sidebar.",
      "TV boards read cached Supabase data. Tools like Grooming Sync and Route Generator may call Gingr or Fitdog APIs when you use them.",
      "Help Center only shows topics for your Digi-Board role — search for the tool name if you need a how-to. Email Lonnie@fitdog.com anytime."
    ],
    links: [
      { label: "Open Lobby Whiteboard", href: "/lobby/checkouts" },
      { label: "Open Staff Whiteboard", href: "/" },
      { label: "Open My Shift", href: "/admin?board=staff&tab=my_shift" },
      { label: "Open Team Log", href: "/admin?board=staff&tab=crossover_communication" }
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
    id: "cleaned-menu-hubs",
    title: "Where did my menu items go? (Hubs & cleaned sidebar)",
    summary: "Digi-Board menus are shorter now. Primary tabs stay in the sidebar; everything else opens from Floor Ops, Whiteboard, Apps, People & HR, or Admin hubs — no tools were removed.",
    category: "Start Here",
    keywords: [
      "menu",
      "sidebar",
      "hub",
      "floor ops",
      "whiteboard hub",
      "apps hub",
      "people hub",
      "admin hub",
      "missing tab",
      "cleaned menu",
      "navigation"
    ],
    steps: [
      "Your sidebar shows about 10 primary tabs for your role (My Shift, command pages, hubs, Help).",
      "Open Floor Ops for Team Log, follow-ups, issues, alerts, VIP Auto Book, walks, photos, checklist, write-ups, and role command centers.",
      "Open Whiteboard for Standard Notices, Grooming/Trainer push, yard camera push, cast videos, emergency alerts, Live Preview, and TV & Cast Setup.",
      "Open Apps for Route Generator, System Health, Blog Generator, Gingr, and Ruffly when your login allows them.",
      "Admins also get People & HR and Admin hubs for staff accounts, HR, settings, logs, and integrations.",
      "When you open a tool from a hub, use Back to [hub] at the top to return.",
      "Nothing was deleted — if a tool used to be in the sidebar, it is still available from a hub or a primary tab."
    ],
    tips: [
      "Search Help Center for the tool name (for example “VIP Auto Book” or “Route Generator”).",
      "Still stuck? Email Lonnie@fitdog.com or open Help Center from the sidebar."
    ],
    adminTab: "sa_floor_hub",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops", "viewer"]
  },
  {
    id: "need-help-card-dismiss",
    title: "How do I hide the “Need help?” sidebar card?",
    summary: "Every role can close the Need help? card. After you confirm, it stays hidden on that device; Help Center and Lonnie@fitdog.com remain available.",
    category: "Start Here",
    keywords: ["need help", "dismiss", "close", "sidebar", "help card", "lonnie", "help center"],
    steps: [
      "Find the orange Need help? card near the bottom of the left sidebar.",
      "Click the X close button on the card.",
      "Read the notice: you can still open Help Center in the menu or email Lonnie@fitdog.com.",
      "Choose Got it — hide this to dismiss the card permanently on this device, or Keep showing to leave it visible.",
      "Open Help anytime from the Help / Help Center tab in your sidebar menu."
    ],
    tips: [
      "Dismiss preference is saved in this browser only.",
      "Email Lonnie@fitdog.com if you need account or training help."
    ],
    adminTab: "help",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops", "viewer"]
  },
  {
    id: "role-menu-front-desk",
    title: "Front Desk menu: what is on my sidebar?",
    summary: "Front Desk primary tabs plus Floor Ops, Whiteboard, and Apps hubs for every front-desk tool.",
    category: "Admin Dashboard",
    keywords: ["front desk", "menu", "coordinator", "floor ops", "whiteboard"],
    steps: [
      "Primary tabs: My Shift, Front Desk Command, Floor Ops, Whiteboard, Apps, Staff Directory, Submit Request, Notifications, Settings, Help.",
      "My Shift Needs Attention includes today’s Gingr facility-calendar services (group walk, puzzle playtime, private training, daily enrichment, club food, taxi, bath/nails/grooming — Free Daily Walk excluded) plus dogs scheduled or checked in with a birthday today from the Gingr dog profile. Previous Front Desk Notes replace Live board on My Shift.",
      "Floor Ops opens Ops Command Center, Team Log, Owner Follow Up, Active Issues, Fitdog Alerts, VIP Auto Book, Walks, photos, and Shift Handoff.",
      "Whiteboard opens Standard Notices, Grooming Push, Yard Camera Push, and display tools your login allows.",
      "Apps opens Gingr, Ruffly, and other connected apps."
    ],
    adminTab: "front_desk_command",
    adminBoard: "staff",
    audiences: ["staff_ops"]
  },
  {
    id: "role-menu-team-lead",
    title: "Team Lead menu: what is on my sidebar?",
    summary: "Team Lead primary tabs with Floor Ops, Whiteboard, and Apps hubs for yard and floor tools.",
    category: "Admin Dashboard",
    keywords: ["team lead", "team leader", "menu", "yard command", "floor ops"],
    steps: [
      "Primary tabs: My Shift, Yard Command, Floor Ops, Whiteboard, Apps, Submit Request, Settings, Help.",
      "My Shift Needs Attention shows Open Log and Active Issues assigned to you, plus today’s Gingr facility-calendar services (group walk, puzzle playtime, private training, daily enrichment, club food, taxi, bath/nails/grooming — Free Daily Walk excluded) and dogs scheduled or checked in with a birthday today.",
      "Fitdog Alerts (app.fitdog.com payments) are not on the Team Lead dashboard. Coordinator dashboards, including a coordinator who also has a Team Lead account, stay unchanged.",
      "Floor Ops covers Ops Command Center, Team Log, follow-ups, active issues, walks, and photo upload.",
      "Whiteboard covers Standard Notices, Yard Camera Push, Grooming Push, and Live Preview.",
      "Apps covers Route Generator, Gingr, and Ruffly."
    ],
    adminTab: "yard_command",
    adminBoard: "staff",
    audiences: ["staff_ops"]
  },
  {
    id: "role-menu-trainer-groomer",
    title: "Trainer & Groomer menus: where are my tools?",
    summary: "Trainer and Groomer sidebars stay short. Team Log, walks, cameras, and apps open from Floor Ops and Apps hubs.",
    category: "Admin Dashboard",
    keywords: ["trainer", "groomer", "menu", "trainer push", "grooming push", "commissions"],
    steps: [
      "Trainer primary: My Shift, Trainer Ops, Trainer Push, Commissions, Floor Ops, Apps, Submit Request, Notifications, Settings, Help.",
      "Groomer primary: My Shift, Grooming Push, Live Preview, Floor Ops, Apps, Submit Request, Notifications, Settings, Help. Ops Command Center is under Floor Ops when your login includes it.",
      "My Shift Needs Attention shows Open Log and Active Issues assigned to you. Today’s additional services come from the Gingr facility calendar (walks, taxi, club food, enrichment, and private training add-ons excluded). Fitdog Alerts are not on Groomer accounts.",
      "Floor Ops opens Team Log, Walks Board, and Video Links.",
      "Apps opens Gingr and Ruffly."
    ],
    audiences: ["staff_ops"]
  },
  {
    id: "role-menu-dog-handler",
    title: "Daycare / Driver / Hiker menu: where are my tools?",
    summary: "Handler panels keep My Shift and Driver Mode up front. Checklist, walks, photos, write-ups, and Team Log live under Floor Ops.",
    category: "Admin Dashboard",
    keywords: ["daycare", "driver", "hiker", "handler", "menu", "checklist", "write ups"],
    steps: [
      "Primary tabs: My Shift, Driver / Hiker Mode, Floor Ops, Apps, Submit Request, Notifications, Settings, Help.",
      "Floor Ops opens Team Log, Checklist, Walks Board, photo upload / Media Library, and Write Ups.",
      "Apps opens Gingr when you need the business system of record."
    ],
    audiences: ["staff_ops"]
  },
  {
    id: "role-menu-admin",
    title: "Admin & Management menu: hubs for every tool",
    summary: "Admin, Management, and Super Admin share the cleaned 10-tab sidebar with Floor Ops, Whiteboard, Support, People & HR, Apps, and Admin hubs.",
    category: "Admin Dashboard",
    keywords: ["admin", "management", "super admin", "menu", "hubs", "people", "support"],
    steps: [
      "Primary tabs: My Shift, Ops Command Center, Floor Ops, Whiteboard, Support, People & HR, Commissions, Apps, Admin, Help.",
      "Floor Ops — command centers, floor operations, photos, and cameras.",
      "Whiteboard — all push-to-board and display/cast tools.",
      "Support — Support Command Center for complaints, PIPs, and urgent cases.",
      "People & HR — staff directory, users, HR records, write-ups, and PIP.",
      "Apps — Route Generator, System Health, Blog Generator, Gingr, Ruffly.",
      "Admin — Overview, analytics, settings, logs, integrations, templates, and notifications."
    ],
    adminTab: "sa_admin_hub",
    adminBoard: "staff",
    audiences: ["admin"]
  },
  {
    id: "ops-command-center-help",
    title: "How do Ops Command Center and My Shift work?",
    summary: "Role-aware Digi-Board homepage for live dogs, tasks, alerts, and Gingr connection status — not a Gingr replacement.",
    category: "Staff Board",
    keywords: [
      "ops command center",
      "my shift",
      "command center",
      "needs attention",
      "gingr connected",
      "system health",
      "front desk command",
      "yard command",
      "overnight",
      "trainer ops"
    ],
    steps: [
      "Open Staff → My Shift (your role homepage) or Ops Command Center (management live floor view).",
      "Review Needs Attention, My Tasks, Alerts, and live arriving/leaving counts.",
      "Team Lead dashboard: Needs Attention shows Open Log + Active Issues assigned to you, plus today’s Gingr facility-calendar services and birthday dogs (scheduled or checked in). My Shift shows previous Team Lead notes from Team Log instead of Live board. Fitdog / sports-app payment alerts stay off this login.",
      "Coordinator My Shift Needs Attention keeps desk alerts/issues/follow-ups and also shows today’s Gingr facility-calendar services (Free Daily Walk excluded) plus birthday dogs from Gingr date of birth. Previous Front Desk Notes replace Live board. Ops Command Center opens from Floor Ops. Facility feed refreshes hourly 6am–7pm Pacific, 7 days a week.",
      "Groomer dashboard: Needs Attention shows Open Log + Active Issues assigned to you. My Shift shows today’s Gingr facility-calendar additional services (walks, taxi, club food, enrichment, and private training add-ons excluded) instead of Live board. Fitdog / sports-app payment alerts stay off this login.",
      "Check the Gingr pill — Connected means recent webhook or live dog sync activity; Disconnected means no fresh Gingr activity.",
      "Use role tools (Front Desk Command, Yard Command, Driver Mode, Overnight, Trainer Ops, System Health, Shift Handoff) when your login includes them.",
      "Find a Dog searches Digi-Board ops records — open Gingr for reservations, packages, and billing."
    ],
    tips: [
      "RuffOps is the live operations layer. Gingr remains the business system of record.",
      "If Gingr shows Disconnected, confirm the webhook URL is https://fitdog.ruffops.com/api/gingr/webhook and ask an admin to check System Health."
    ],
    adminTab: "ops_command_center",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
  },
  {
    id: "grooming-push-help",
    title: "How do I use Grooming Push?",
    summary: "Select a dog checked in to Gingr, add an optional note, and push a high-priority alert to the Staff Digital Whiteboard.",
    category: "Staff Board",
    keywords: ["grooming push", "groomer", "sync", "checked in", "gingr dogs", "catch", "bath"],
    steps: [
      "Open Staff → Grooming Push (Push to Whiteboard).",
      "Click Select dog from Gingr — Digi loads dogs currently checked in from Gingr (Pacific business day).",
      "Tap Sync if the list looks empty or stale. Wait for the checked-in count to appear under the search box.",
      "Search by dog or owner name, select the dog, optionally add a safety tag or note, then Push to Staff Whiteboard.",
      "Use Type dog manually only when the dog is present but missing from Gingr’s checked-in list.",
      "Clear the active grooming notice from the right panel when handlers have the dog."
    ],
    tips: [
      "Sync pulls Gingr checked-in reservations — not only the short whiteboard checking-in basket.",
      "If Sync shows an error (not just an empty list), tell an admin: GINGR_API_KEY / Gingr connectivity may be down.",
      "Searching with no matches is different from zero dogs loaded — clear the search box to see the full list."
    ],
    adminTab: "grooming_push",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
  },
  {
    id: "commissions-help",
    title: "How do Package & Class Commissions work?",
    summary: "Trainers and managers track package/class sales and earnings from the Commissions tab — one click opens the page.",
    category: "Staff Board",
    keywords: ["commissions", "package", "class", "trainer earnings", "sales"],
    steps: [
      "Open Staff → Commissions (Dashboard list for admins; Commissions section for trainers).",
      "One click opens Package & Class Commissions — you should not need to open Complaints or Requests first.",
      "Review rows for the selected date range, add comments or disputes when allowed, and confirm sales if your role can manage commissions.",
      "Ask Fitdog AI about commissions only if your login can view them — answers stay inside Digi-Board permissions."
    ],
    tips: [
      "Commissions live in Digi-Board; billing still happens in Gingr.",
      "If Commissions is missing from your sidebar, your role needs view_package_commissions — ask an admin."
    ],
    adminTab: "package_commissions",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
  },
  {
    id: "route-generator-help",
    title: "How does Route Generator and Samsara export work?",
    summary: "Pull Fitdog signups, build van routes, approve, then download today’s Samsara CSV — never reuse another day’s file.",
    category: "Admin Dashboard",
    keywords: [
      "route generator",
      "samsara",
      "csv",
      "van routes",
      "upload",
      "internal server error",
      "friday csv",
      "export"
    ],
    steps: [
      "Open Applications → Route Generator (Staff board).",
      "Set Operating date to today → Pull Report → Generate Routes → Approve Routes.",
      "Click Export Samsara CSV (or Re-export after the first download).",
      "Upload that new file in cloud.samsara.com the same day only.",
      "If Digi says CSV validation failed, fix the listed stop (usually missing lat/lng) and export again — do not upload a broken file.",
      "Wrong-day exports are blocked. Never upload Friday’s CSV (or any prior day) on a later day."
    ],
    tips: [
      "Digi downloads the CSV; staff upload it in Samsara. A Samsara Internal Server Error usually means a bad row, not Digi being offline.",
      "Van 4 must never appear. Vehicle names must match Samsara exactly (Van 01, 02, 03, 05, 06).",
      "Owner SMS on Approve is opt-in and respects quiet hours / moving-van gates."
    ],
    adminTab: "route_generator",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
  },
  {
    id: "how-data-flows",
    title: "Where does checkout data come from?",
    summary: "Gingr webhooks fill Supabase; TV boards read that cache. Some Digi tools also pull live Gingr/Fitdog data when you Sync or export.",
    category: "Data & Sync",
    keywords: ["gingr", "supabase", "sync", "webhook", "cache", "data source", "checked in", "heartbeat"],
    steps: [
      "Gingr sends check-in/check-out events to the Digi webhook (Integrations shows the URL).",
      "Events are stored in Supabase — the cached copy Lobby and Staff TVs read.",
      "TV boards do not call Gingr for every refresh — that keeps displays fast and light on Gingr.",
      "Ops Command Center Gingr Connected means recent webhook activity or live dog sync (heartbeat), not that Gingr is replaced.",
      "Grooming Push Sync and similar tools may call Gingr’s reservations API for currently checked-in dogs when you ask for a fresh list.",
      "Route Generator pulls Fitdog signup reports, then you download a Samsara CSV — Digi does not upload to Samsara for you."
    ],
    adminTab: "integrations",
    tips: [
      "If TVs are empty but Gingr has dogs, check Integrations and Logs for webhook failures first.",
      "If Grooming Sync errors, that is usually GINGR_API_KEY or Gingr connectivity — not the TV cache."
    ]
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
    summary: "Shows dogs checking in and out from cached Gingr data, with sticky board dogs so brief empty syncs do not wipe the TV.",
    category: "Staff Board",
    keywords: ["checkout", "checkin", "check-in", "check-out", "dogs", "queue", "flicker", "sticky"],
    steps: [
      "When Gingr prompts a check-in or check-out, the dog appears on the Staff Whiteboard via Supabase cache.",
      "No manual edits needed for normal Gingr flow — the board refreshes on a short interval (often about 2 seconds).",
      "Recognized board dogs stay sticky through short empty sync gaps so the TV does not flicker blank.",
      "Grooming Push and other Digi notices can also appear as temporary overlays — clear them when handlers have the dog.",
      "Lobby and Staff boards are independent URLs — use the Staff board link for the yard TV."
    ],
    adminTab: "display",
    adminBoard: "staff",
    links: [{ label: "View Staff Board", href: "/" }],
    tips: [
      "If the board looks empty, confirm dogs are active in Gingr, then Refresh Admin and reload the public board tab.",
      "Grooming Push Sync lists Gingr checked-in dogs for picking — that list is separate from the short checking-in basket on the TV."
    ]
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
    title: "How does Team Log work?",
    summary: "Team Log is the Digi-Board shift handoff hub: Crossover Log for today, Open Log for unfinished items, and Archived Log for closed history.",
    category: "Staff Board",
    keywords: [
      "team log",
      "front desk log",
      "crossover log",
      "archived log",
      "open log",
      "check out",
      "assessment",
      "handoff",
      "shift log",
      "urgent",
      "critical",
      "delete"
    ],
    steps: [
      "Open Digi-Board → Staff → Team Log (most staff roles land here after login).",
      "Crossover Log — today’s notes and handoffs so every role can see what happened this shift.",
      "Open Log — unresolved items that still need follow-up after today.",
      "Archived Log — prior-day resolved, completed, Check Out, and archived entries.",
      "Add a note with Add Shift Log Entry, or use Quick Templates for common log types.",
      "Mark Critical or Urgent (or turn on Urgent) when management needs immediate attention.",
      "For New Dog Assessment entries: choose Mark Check Out (Resolved). They stay on today’s Crossover Log, then move to Archived Log the next day.",
      "You can delete only entries you created. Super Admin, Admin, and Management can delete any entry."
    ],
    tips: [
      "Team Log is an internal Digi-Board tool. It does not change Lobby or Staff TV Gingr sync.",
      "Use filters (log type, status, assigned to, urgent) during busy crossover.",
      "Comments on Critical/Urgent notes help the next shift — keep them short and clear."
    ],
    adminTab: "crossover_communication",
    adminBoard: "staff"
  },
  {
    id: "staff-ops-pages",
    title: "How do Owner Follow Up and Active Issues work?",
    summary: "Track client callbacks and urgent floor issues alongside Team Log.",
    category: "Staff Board",
    keywords: ["owner follow up", "active issues", "urgent", "staff admin", "handoff", "team log"],
    steps: [
      "Use Team Log for daily shift notes and assessment Check Outs — see the Team Log help article.",
      "Open Owner Follow Up to assign client follow-up tasks with due dates and statuses.",
      "Open Active Issues to manage urgent or critical items linked from Team Log and Owner Follow Up.",
      "High, Critical, or urgent Team Log and Owner Follow Up records can create an Active Issue.",
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
    id: "vip-auto-book-help",
    title: "How does VIP Auto Book work?",
    summary: "Track owners who always want their dogs booked on app.fitdog.com for classes, hikes, or excursions on a weekly or monthly schedule.",
    category: "Staff Board",
    keywords: ["vip", "auto book", "fitdog sports", "app.fitdog.com", "hike", "class", "excursion", "weekly", "monthly"],
    steps: [
      "Open Digi-Board → Staff → VIP Auto Book (Admin, Management, and Front Desk).",
      "Click Sync Fitdog Directory (or wait for the daily pull) to load owner/dog names from app.fitdog.com and confirm Last Day Booked (clears Re-book Needed when a future class is already booked).",
      "Add VIP Client — type a dog or owner name and pick a match from the popup list.",
      "Choose service type (Group Class, Adventure Hike, Beach Excursion, Trainer-Led Hike, etc.), cadence (weekly/monthly), and days or week of month.",
      "Edit a row with the pencil icon (or open the row and click Edit) to change schedule, pickup/drop-off, notes, or status.",
      "Delete a row with the trash icon (or Delete in the detail view) when the client should leave VIP Auto Book.",
      "Use the VIP list during booking windows so those dogs are never missed on Fitdog Sports."
    ],
    tips: [
      "VIP Auto Book is a Digi-Board tracker — it does not auto-create bookings inside app.fitdog.com yet.",
      "fitdog.ruffops.com is the Digi-Board login shortcut; owner/dog data still comes from the Fitdog Sports employee API."
    ],
    adminTab: "vip_auto_book",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
  },
  {
    id: "fitdog-alerts-help",
    title: "How do Fitdog Alerts work?",
    summary: "Operations alerts for declined payments, card issues, and Fitdog sync problems — for Admin and Management.",
    category: "Staff Board",
    keywords: [
      "fitdog alerts",
      "declined payment",
      "card declined",
      "payment failed",
      "operations",
      "critical"
    ],
    steps: [
      "Open Digi-Board → Staff → Fitdog Alerts (Operations).",
      "New alerts appear when Fitdog sync finds declined cards, failed payments, or related payment errors.",
      "Open an alert to review owner, dog, amount, reason, and activity history.",
      "Assign, resolve, or mark paid/waived when the billing issue is handled.",
      "Critical / declined payment alerts also notify Digi-Board staff inboxes (and Super Admin SMS when Twilio is configured)."
    ],
    tips: [
      "Fitdog Alerts do not replace Team Log — use Team Log for shift notes; use Fitdog Alerts for payment/ops failures.",
      "If the list looks stale, use Sync / refresh when available, then check Integrations for Fitdog sync health."
    ],
    adminTab: "fitdog_alerts",
    adminBoard: "staff",
    audiences: ["admin", "staff_ops"]
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
    summary: "Coordinator and Team Lead accounts use My Shift, Team Log, Push Notices, Route Generator (when enabled), follow-ups, and view-only Staff Directory.",
    category: "Users & Login",
    keywords: [
      "front desk coordinator",
      "team leader",
      "team lead",
      "role",
      "permissions",
      "push notices",
      "staff directory",
      "team log",
      "crossover log",
      "route generator",
      "my shift",
      "ops command center"
    ],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "Your sidebar is cleaned: primary tabs plus Floor Ops, Whiteboard, and Apps hubs (see “Where did my menu items go?”).",
      "Start from My Shift / Front Desk Command or Yard Command for live dogs and Gingr connection status.",
      "Team Lead dashboard: My Shift Needs Attention is assigned Open Log + Active Issues, plus previous Team Lead Team Log notes. Coordinator dashboards still see the full desk view including Fitdog Alerts.",
      "Open Floor Ops for Team Log, Owner Follow Up, Active Issues, Walks Board, and photos.",
      "Open Whiteboard for Push Notices and related live alerts; open Apps for Route Generator / Gingr / Ruffly when enabled.",
      "Staff Directory is view-only for Front Desk — search and review staff, but you cannot add, edit, or delete directory rows.",
      "You can delete only Team Log entries you created (Super Admin, Admin, and Management can delete any).",
      "You cannot access Lobby content tools, global settings, logs, integrations, or the full Admin Users area."
    ],
    adminTab: "crossover_communication",
    adminBoard: "staff",
    tips: [
      "Use these roles for desk/team-lead staff who need live yard tools without full admin access.",
      "Search Help for Route Generator, Push Notices, or Team Log when you need step-by-step screens."
    ]
  },
  {
    id: "groomer-trainer-crossover",
    title: "What can a Groomer or Trainer do?",
    summary: "Groomers use Grooming Push (Sync from Gingr checked-in dogs) and Team Log; Trainers use Trainer Push, Team Log, and Package & Class Commissions.",
    category: "Users & Login",
    keywords: [
      "groomer",
      "trainer",
      "crossover",
      "team log",
      "grooming",
      "grooming push",
      "sync",
      "training",
      "handoff",
      "commissions",
      "package",
      "class",
      "check out",
      "my shift"
    ],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "Your sidebar stays short — use Floor Ops and Apps hubs for Team Log, walks, cameras, Gingr, and Ruffly.",
      "Open My Shift when it appears — your role homepage for tasks and alerts.",
      "Groomers: open Grooming Push → Select dog from Gingr. Tap Sync if the list is empty; choose a checked-in dog, add a note if needed, then Push to Staff Whiteboard.",
      "Trainers: open Trainer Push for training alerts, Commissions for package/class sales, then Floor Ops → Team Log when notes are needed.",
      "On Team Log, use Crossover Log for today’s notes. Assessment dogs: Mark Check Out so they stay on today’s log until the next day.",
      "You can delete only Team Log entries you created.",
      "Trainers: open Commissions (one click) to review package/class earnings, comment, or dispute a row.",
      "Both roles also have Notifications, Video Links, Walks Board, and Help Center."
    ],
    adminTab: "grooming_push",
    adminBoard: "staff",
    tips: [
      "Grooming Sync loads dogs currently checked in to Gingr — not only the short whiteboard checking-in basket.",
      "If Sync shows an error message, tell a lead or admin (Gingr API key / connectivity).",
      "Assign the Groomer or Trainer dashboard role in Admin Users or Staff Directory when creating a login."
    ]
  },
  {
    id: "dog-handler-basics",
    title: "What can a Dog Handler do?",
    summary: "Dog Handler, Driver, and Hiker accounts use My Shift, Check List, Walks Board, Staff Whiteboard, and Team Log for yard work.",
    category: "Users & Login",
    keywords: ["dog handler", "daycare", "handler", "walks", "checklist", "team log", "driver", "hiker", "my shift"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned email and password.",
      "Primary tabs: My Shift, Driver / Hiker Mode, Floor Ops, Apps, Submit Request, Notifications, Settings, Help.",
      "Open Floor Ops → Check List for today’s dog-handler daily recurring push notices and mark each one completed.",
      "Use the Staff Digital Whiteboard for live check-ins, check-outs, and yard reminders (including grooming catch notices).",
      "Open Floor Ops → Walks Board to track dogs that need walks and mark walked or snooze when allowed.",
      "Open Floor Ops → Team Log → Crossover Log to add or review today’s handoff notes. You can delete only entries you created.",
      "Open Notifications for alerts assigned to you, and Help Center anytime you need a guide.",
      "Dog Handler / Driver / Hiker accounts do not manage Lobby content, admin users, integrations, or global settings."
    ],
    adminTab: "checklist",
    adminBoard: "staff",
    tips: [
      "Mark each daily push notice complete on your Check List after you finish the task.",
      "If a notice also appears on the Staff Whiteboard, follow it and clear the TV overlay only when your lead says it is done."
    ]
  },
  {
    id: "management-role",
    title: "What can an Assistant Manager (Management) do?",
    summary: "Management runs Ops Command Center, Team Log, Fitdog Alerts, commissions, and other staff Digi tools — and can delete any Team Log entry when needed.",
    category: "Users & Login",
    keywords: [
      "assistant manager",
      "management",
      "role",
      "permissions",
      "team log",
      "fitdog alerts",
      "delete",
      "ops command center",
      "commissions",
      "route generator",
      "hubs"
    ],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned Management credentials.",
      "Use the cleaned Admin-style sidebar: My Shift, Ops Command Center, Floor Ops, Whiteboard, Support, People & HR, Commissions, Apps, Admin, Help.",
      "Use Ops Command Center / My Shift for live floor state and Gingr Connected / Disconnected health.",
      "Open Floor Ops / Whiteboard / Apps hubs for Team Log, Push Notices, Fitdog Alerts, Route Generator, and related tools.",
      "On Team Log, review Crossover Log (today), Open Log, and Archived Log (prior closed items).",
      "Management can delete any Team Log entry — not only their own.",
      "Open Commissions from the sidebar when you have package/class commission access.",
      "Full Super Admin-only areas (integration secrets, permission matrix, some global settings) may still be restricted."
    ],
    adminTab: "ops_command_center",
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
      "Marketing accounts do not manage staff operations, Team Log, Gingr integrations, or admin user security.",
      "Use Help Center for lobby board guides, and email Lonnie@fitdog.com if login access looks wrong."
    ],
    adminTab: "promotions",
    adminBoard: "lobby",
    tips: ["Publish or save changes when your board tools show unsaved work so TVs pick up the latest content."]
  },
  {
    id: "viewer-basics",
    title: "What can a Viewer do?",
    summary: "Viewer accounts get read-focused Digi-Board help for lobby boards, casting, and login — not staff operations editing.",
    category: "Users & Login",
    keywords: ["viewer", "read only", "lobby", "cast", "help"],
    steps: [
      "Sign in at Fitdog Digi-Board with your assigned Viewer credentials.",
      "Use Help Center topics for Lobby Whiteboard, Cast to TV, login, and password help.",
      "Open Lobby Whiteboard to watch guest-facing checkout and promo content.",
      "Viewer accounts are not for Team Log editing, Push Notices, or admin user management.",
      "Email Lonnie@fitdog.com if you need a different Digi-Board role."
    ],
    adminTab: "content",
    adminBoard: "lobby",
    audiences: ["admin", "viewer"],
    tips: ["If you only need to watch TVs, Cast to TV help articles cover Chrome casting steps."]
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
    summary: "Use Integrations for Supabase/webhook health, and Ops Command Center for the live Gingr Connected pill.",
    category: "Data & Sync",
    keywords: [
      "health",
      "status",
      "integration",
      "webhook",
      "failed",
      "test connection",
      "gingr connected",
      "disconnected",
      "system health"
    ],
    steps: [
      "Open Integrations — check Supabase status, last sync time, and failed webhook count (zero is healthy).",
      "Click Test Connection to verify Supabase read access (safe, no Gingr calls).",
      "Open Ops Command Center / System Health — Gingr Connected means recent webhook or live dog sync activity.",
      "Disconnected means no fresh Gingr activity — confirm webhook URL https://fitdog.ruffops.com/api/gingr/webhook and GINGR_API_KEY on Vercel.",
      "For Grooming Push empty Sync with an error toast, treat it as Gingr API connectivity, not only TV cache."
    ],
    adminTab: "integrations",
    tips: ["After env var changes on Vercel, redeploy once, then re-check Integrations and Ops Command Center."]
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
    summary: "Usually a Gingr webhook/cache issue — check Integrations, Logs, and Ops Command Center Gingr health.",
    category: "Troubleshooting",
    keywords: [
      "missing",
      "empty",
      "no dogs",
      "checkout not showing",
      "stale",
      "gingr disconnected",
      "grooming sync"
    ],
    steps: [
      "Confirm dogs are checked in or prompted for checkout in Gingr first.",
      "Open Ops Command Center — if Gingr shows Disconnected, fix webhook/API before expecting live board updates.",
      "Open Integrations — check last sync time and failed webhook count.",
      "Open Logs — look for unprocessed or failed webhook events.",
      "Click Refresh in Admin, then hard-reload the public board tab (Lobby vs Staff use different URLs).",
      "Grooming Push empty list: tap Sync and read the message — an API error is different from “no checked-in dogs” or a search with no matches."
    ],
    adminTab: "integrations",
    links: [
      { label: "Lobby Board", href: "/lobby/checkouts" },
      { label: "Staff Board", href: "/" },
      { label: "Ops Command Center", href: "/admin?board=staff&tab=ops_command_center" }
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
  "ops-command-center-help": STAFF_OPS_AND_ADMIN,
  "grooming-push-help": STAFF_OPS_AND_ADMIN,
  "commissions-help": STAFF_OPS_AND_ADMIN,
  "route-generator-help": STAFF_OPS_AND_ADMIN,
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
  "fitdog-alerts-help": STAFF_OPS_AND_ADMIN,
  "vip-auto-book-help": STAFF_OPS_AND_ADMIN,
  "add-admin-user": ADMIN_ONLY,
  "front-desk-coordinator": STAFF_OPS_AND_ADMIN,
  "groomer-trainer-crossover": STAFF_OPS_AND_ADMIN,
  "dog-handler-basics": STAFF_OPS_AND_ADMIN,
  "management-role": STAFF_OPS_AND_ADMIN,
  "marketing-account": LOBBY_VIEWERS,
  "viewer-basics": LOBBY_VIEWERS,
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
  "cleaned-menu-hubs",
  "need-help-card-dismiss",
  "change-password",
  "troubleshoot-login",
  "staff-reminders"
]);

const MANAGEMENT_EXTRA_ARTICLE_IDS = new Set([
  "what-is-this",
  "cleaned-menu-hubs",
  "need-help-card-dismiss",
  "role-menu-admin",
  "front-desk-log",
  "staff-ops-pages",
  "fitdog-alerts-help",
  "vip-auto-book-help",
  "ops-command-center-help",
  "grooming-push-help",
  "commissions-help",
  "route-generator-help",
  "push-notices",
  "schedule-push-notices",
  "staff-display",
  "management-role",
  "front-desk-coordinator",
  "role-menu-front-desk",
  "role-menu-team-lead",
  "groomer-trainer-crossover",
  "role-menu-trainer-groomer",
  "dog-handler-basics",
  "role-menu-dog-handler",
  "publish-changes",
  "board-switcher",
  "preview-and-refresh",
  "integrations-check",
  "how-data-flows",
  "troubleshoot-no-checkouts",
  "lobby-tv-cast",
  "staff-tv-cast"
]);

const CROSSOVER_STAFF_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "what-is-this",
  "cleaned-menu-hubs",
  "need-help-card-dismiss",
  "front-desk-log",
  "groomer-trainer-crossover",
  "role-menu-trainer-groomer",
  "ops-command-center-help",
  "grooming-push-help",
  "commissions-help",
  "push-notices",
  "staff-display",
  "staff-tv-cast",
  "troubleshoot-no-checkouts"
]);

const DOG_HANDLER_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "what-is-this",
  "cleaned-menu-hubs",
  "need-help-card-dismiss",
  "front-desk-log",
  "dog-handler-basics",
  "role-menu-dog-handler",
  "ops-command-center-help",
  "staff-display",
  "staff-tv-cast",
  "troubleshoot-no-checkouts"
]);

const MARKETING_ARTICLE_IDS = new Set([
  ...CORE_ACCOUNT_ARTICLE_IDS,
  "what-is-this",
  "cleaned-menu-hubs",
  "need-help-card-dismiss",
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

  if (role === "daycare" || role === "driver" || role === "hiker") {
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
