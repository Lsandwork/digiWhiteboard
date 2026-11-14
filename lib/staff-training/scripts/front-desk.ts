/** Exact spoken narration — record as American English, conversational trainer pace. */

export const FD_WELCOME = `Welcome to Fitdog Front Desk training. I'm going to walk you through the real RuffOps Digi-Board—the same screens you'll use every shift at fitdog dot ruffops dot com.

Before we touch a customer record, log in at the admin login page using the username and password Fitdog gave you. After login you'll land on the staff board. As a Front Desk Coordinator, your sidebar is labeled Front Desk Coordinator. Every icon you see is a real tool—not a demo.

Pause here if you need to log in on your own screen. When you're ready, press play again.`;

export const FD_NAVIGATION = `Let's tour navigation. Your primary sidebar shows My Shift, Ops Command Center, Team Log, Owner Follow Up, Active Issues, Video Links, Notifications, Gingr Route Generator, Whiteboard, Staff Directory, Submit Request, Settings, and Help.

Click an icon once to open that panel. The page never leaves fitdog dot ruffops dot com—you stay inside RuffOps.

Important: some features like User Interactions or VIP Auto Book are allowed for your role even when they're not on the sidebar. Open them from Help quick links or by typing the tab name in the URL after an admin shows you once.

Front Desk Command exists in the codebase but is turned off for everyone right now—do not hunt for it. Use My Shift and Ops Command Center instead.`;

export const FD_MY_SHIFT = `My Shift is your start-of-shift home. Open My Shift from the sidebar.

You'll see what needs attention today—facility calendar items from Gingr, birthday dogs, and desk notes left for coordinators. Read the list before the lobby gets busy.

Use My Shift to decide your first actions: check Team Log for overnight notes, scan Ops Command Center for live dogs, and open Notifications for anything assigned to you.

When you finish a task somewhere else, come back to My Shift to confirm nothing new landed while you were working.`;

export const FD_OPS_COMMAND = `Ops Command Center is the live floor picture. Open it from the sidebar.

You'll see dogs on site, tasks, and alerts. Use search when a client calls and you need a name quickly.

From here you can jump into Team Log or follow-ups when an alert points you that way. This panel reads live data—it is not a static report.

If Gingr data is slow, you'll see a health indicator. Wait or refresh after a minute; don't duplicate work in Team Log while sync catches up.`;

export const FD_TEAM_LOG = `Team Log is crossover communication—handoffs between shifts. In the sidebar it's labeled Team Log; the tab id is crossover communication.

Open the Crossover bucket for today's open entries. To add an entry, choose Add Shift Log Entry or Quick Log Templates.

Fill log type, subject, and details. Set priority and status. Assign to a teammate if someone else must finish it. You can tie a dog or owner name when the note is about one family.

Use Create owner follow-up or Create active issue when the template fits—those spawn real tasks in the other panels.

Before you leave shift, archive the crossover day only when your supervisor's procedure says it's complete. Never delete another employee's entry; coordinators can delete their own unless an admin steps in.`;

export const FD_OWNER_FOLLOW_UP = `Owner Follow Up tracks callbacks. Open Owner Follow Up from the sidebar.

Each row is a promise to call or email an owner. Filter by open, overdue, or yours. Open a row to edit notes, due date, and assignee.

When the owner is contacted, mark complete. Use Push to Whiteboard only when your site policy says the whole floor must see it—it's loud.

Common mistake: creating a follow-up in Team Log and forgetting to link the phone number. Put the best callback number in the details every time.`;

export const FD_ACTIVE_ISSUES = `Active Issues are urgent floor problems. Open Active Issues from the sidebar.

Create an issue when something must be fixed today—equipment, behavior, safety concern on the floor. Pick the source honestly; many issues start from Team Log.

Assign and set priority. Resolve when handled. Management may get SMS on high priority—treat the subject line seriously.

Do not use Active Issues for routine daycare notes; Team Log is usually enough.`;

export const FD_BODY_CHECKS = `Body Checks connect to Gingr's roster. Open Body Checks from the sidebar—or from the hub if your layout shows it.

You'll see dogs eligible for inspection today. Open a dog, run through ears, nails, coat, and physical notes, then save the report.

Follow-up fields track whether grooming or a manager needs to act. Overnight and handlers use the same tool; your entries are visible to the team.

Never guess medical diagnoses—record what you see and escalate through Team Log or management per Fitdog policy.`;

export const FD_WHITEBOARD = `Whiteboard pushes reach owners and staff displays. Open Whiteboard from the sidebar.

From the hub you can reach Standard Notices, Grooming Push, Yard camera push, and related tools allowed to coordinators.

Draft the message, pick departments, preview, then push. Confirm on Live Preview when your site requires it.

If you're unsure which push type to use, ask a team lead before pushing to everyone.`;

export const FD_END_SHIFT = `End-of-shift for Front Desk means leaving the next team unblocked.

Review Team Log crossover for open items. Close or reassign your Owner Follow Ups. Clear or hand off Active Issues you own. Skim Notifications.

Add one Team Log entry summarizing anything unusual—even if it's “quiet night, all checkouts done.”

Log out only after handoff is documented. The next coordinator starts on My Shift and Team Log, not your memory.`;