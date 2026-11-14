import type { TrainingCourseDef, TrainingQuizQuestion } from "@/lib/staff-training/types";
import * as fd from "@/lib/staff-training/scripts/front-desk";
import * as on from "@/lib/staff-training/scripts/overnight";

const fdQuizFinal: TrainingQuizQuestion[] = [
  {
    id: "fd-q1",
    prompt: "Where do you start most Front Desk shifts?",
    choices: ["My Shift", "Admin Users", "CAST-TV board", "Blog generator"],
    correctIndex: 0,
    explanation: "My Shift is the coordinator landing view for needs-attention items and desk notes."
  },
  {
    id: "fd-q2",
    prompt: "Where do you document shift handoffs?",
    choices: ["Team Log (Crossover)", "Integrations", "Lobby slideshow", "Trainer entry only"],
    correctIndex: 0,
    explanation: "Team Log / crossover_communication is the canonical handoff log."
  },
  {
    id: "fd-q3",
    prompt: "Owner callbacks are tracked in which panel?",
    choices: ["Owner Follow Up", "Body Checks", "CAST videos", "Vet visits"],
    correctIndex: 0,
    explanation: "Owner Follow Up holds callback tasks with due dates and assignees."
  }
];

const onQuizFinal: TrainingQuizQuestion[] = [
  {
    id: "on-q1",
    prompt: "Which panel shows the Gingr dog roster for inspections overnight?",
    choices: ["Body Checks", "VIP Auto Book", "Route Generator", "Lobby whiteboard"],
    correctIndex: 0,
    explanation: "Body Checks loads the Gingr roster for recording inspections."
  },
  {
    id: "on-q2",
    prompt: "Where should overnight handoff notes for Front Desk live?",
    choices: ["Team Log Crossover", "Public staff whiteboard editor", "Marketing promotions", "HR PIP"],
    correctIndex: 0,
    explanation: "Team Log is the shared shift log Front Desk reads each morning."
  },
  {
    id: "on-q3",
    prompt: "Can the overnight login open Overnight Command rounds UI?",
    choices: [
      "No — that tab is for management roles; follow site procedure",
      "Yes — always",
      "Only on weekends",
      "Only after enabling Front Desk Command"
    ],
    correctIndex: 0,
    explanation: "Verified: overnight role is not whitelisted for overnight_command."
  }
];

export const STAFF_TRAINING_COURSES: TrainingCourseDef[] = [
  {
    slug: "front_desk",
    title: "Front Desk Coordinator Training",
    description:
      "Step-by-step training for the real Front Desk Coordinator panel in RuffOps: My Shift, Ops Command Center, Team Log, follow-ups, issues, Body Checks, whiteboard tools, and shift handoff.",
    audienceRoleKeys: ["front_desk_coordinator"],
    lessons: [
      {
        slug: "welcome",
        title: "Welcome & login",
        summary: "Digi-Board login and what the Front Desk panel is.",
        section: "Introduction",
        order: 1,
        durationMinutes: 4,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_WELCOME,
        guidedSteps: [
          {
            title: "Open login",
            body: "Go to fitdog.ruffops.com/admin/login and sign in with your Fitdog staff account.",
            highlight: "Use your assigned credentials only."
          }
        ]
      },
      {
        slug: "navigation",
        title: "Sidebar & navigation",
        summary: "How the Front Desk Coordinator hub is organized.",
        section: "Introduction",
        order: 2,
        durationMinutes: 5,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_NAVIGATION,
        guidedSteps: [
          {
            title: "Explore sidebar",
            body: "Click each primary icon once so you know where My Shift, Team Log, and Ops Command Center live.",
            adminTab: "my_shift"
          }
        ],
        verificationNotes: ["Front Desk Command tab is disabled in production (canAccessAdminTab is false)."]
      },
      {
        slug: "my-shift",
        title: "My Shift overview",
        summary: "Start-of-shift needs attention.",
        section: "Dashboard",
        order: 3,
        durationMinutes: 6,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_MY_SHIFT,
        guidedSteps: [
          { title: "Open My Shift", body: "Review needs-attention cards before opening the lobby.", adminTab: "my_shift" }
        ]
      },
      {
        slug: "ops-command-center",
        title: "Ops Command Center",
        summary: "Live floor search and alerts.",
        section: "Dashboard",
        order: 4,
        durationMinutes: 7,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_OPS_COMMAND,
        guidedSteps: [
          {
            title: "Open Ops Command Center",
            body: "Practice finding a dog by name using search.",
            adminTab: "ops_command_center"
          }
        ],
        quiz: [
          {
            id: "fd-ops-q1",
            prompt: "Ops Command Center is best for…",
            choices: ["Live on-site dog lookup", "Editing marketing blog posts", "Payroll", "CAST-TV playlists"],
            correctIndex: 0,
            explanation: "It is the live operational dashboard, not marketing or HR."
          }
        ]
      },
      {
        slug: "team-log",
        title: "Team Log & crossover",
        summary: "Handoffs, templates, and linked follow-ups.",
        section: "Communication",
        order: 5,
        durationMinutes: 10,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_TEAM_LOG,
        guidedSteps: [
          {
            title: "Open Team Log",
            body: "Open Crossover, skim open entries, then practice Add Shift Log Entry (do not save junk data in production).",
            adminTab: "crossover_communication"
          }
        ]
      },
      {
        slug: "owner-follow-up",
        title: "Owner Follow Up",
        summary: "Callback tasks and completion.",
        section: "Communication",
        order: 6,
        durationMinutes: 6,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_OWNER_FOLLOW_UP,
        guidedSteps: [{ title: "Open Owner Follow Up", body: "Filter overdue items.", adminTab: "owner_follow_up" }]
      },
      {
        slug: "active-issues",
        title: "Active Issues",
        summary: "Urgent floor issues workflow.",
        section: "Communication",
        order: 7,
        durationMinutes: 6,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_ACTIVE_ISSUES,
        guidedSteps: [{ title: "Open Active Issues", body: "Review how priority and source are set.", adminTab: "active_issues" }]
      },
      {
        slug: "body-checks",
        title: "Body Checks",
        summary: "Roster inspections from Gingr.",
        section: "Dog care",
        order: 8,
        durationMinutes: 8,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_BODY_CHECKS,
        guidedSteps: [{ title: "Open Body Checks", body: "Walk the roster UI without saving test data on production.", adminTab: "body_checks" }]
      },
      {
        slug: "whiteboard-pushes",
        title: "Whiteboard & pushes",
        summary: "Owner-facing notices from the hub.",
        section: "Displays",
        order: 9,
        durationMinutes: 7,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_WHITEBOARD,
        guidedSteps: [{ title: "Open Whiteboard hub", body: "Identify which push tools you are allowed to use.", adminTab: "sa_whiteboard_hub" }]
      },
      {
        slug: "end-of-shift",
        title: "End of shift",
        summary: "Handoff checklist for coordinators.",
        section: "Wrap-up",
        order: 10,
        durationMinutes: 5,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: fd.FD_END_SHIFT,
        guidedSteps: [{ title: "Team Log summary", body: "Add a closing crossover note when procedure requires it.", adminTab: "crossover_communication" }],
        quiz: fdQuizFinal
      }
    ]
  },
  {
    slug: "overnight",
    title: "Overnight Staff Training",
    description:
      "Training for the overnight role panel: My Shift, Team Log, Body Checks, Submit Request, Notifications, and morning handoff—only verified overnight workflows.",
    audienceRoleKeys: ["overnight"],
    lessons: [
      {
        slug: "welcome",
        title: "Welcome & login",
        summary: "Overnight role scope on the staff board.",
        section: "Introduction",
        order: 1,
        durationMinutes: 4,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_WELCOME,
        guidedSteps: [
          {
            title: "Staff board login",
            body: "Confirm you land on the Overnight sidebar after login."
          }
        ]
      },
      {
        slug: "navigation",
        title: "Overnight navigation",
        summary: "Seven tabs and what is not on your panel.",
        section: "Introduction",
        order: 2,
        durationMinutes: 5,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_NAVIGATION,
        guidedSteps: [{ title: "Sidebar tour", body: "Open each tab once.", adminTab: "my_shift" }],
        verificationNotes: [
          "overnight_command and shift_handoff tabs are not available to the overnight login.",
          "Structured meds/feeding fields live on management handoff UI—document in Team Log when your site requires."
        ]
      },
      {
        slug: "my-shift",
        title: "My Shift",
        summary: "Overnight start-of-shift snapshot.",
        section: "Dashboard",
        order: 3,
        durationMinutes: 5,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_MY_SHIFT,
        guidedSteps: [{ title: "Open My Shift", body: "Read needs-attention before rounds.", adminTab: "my_shift" }]
      },
      {
        slug: "team-log",
        title: "Team Log overnight",
        summary: "Documentation and handoff notes.",
        section: "Communication",
        order: 4,
        durationMinutes: 9,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_TEAM_LOG,
        guidedSteps: [{ title: "Team Log", body: "Review Crossover bucket.", adminTab: "crossover_communication" }]
      },
      {
        slug: "body-checks-roster",
        title: "Body Checks roster",
        summary: "Finding dogs on the overnight roster.",
        section: "Dog care",
        order: 5,
        durationMinutes: 6,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_BODY_CHECKS_ROSTER,
        guidedSteps: [{ title: "Roster", body: "Open Body Checks and locate a dog row.", adminTab: "body_checks" }]
      },
      {
        slug: "body-checks-record",
        title: "Recording a body check",
        summary: "Saving observations and follow-ups.",
        section: "Dog care",
        order: 6,
        durationMinutes: 8,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_BODY_CHECKS_RECORD,
        guidedSteps: [{ title: "Inspection wizard", body: "Practice the flow in training mode on staging if available.", adminTab: "body_checks" }],
        quiz: [
          {
            id: "on-bc-q1",
            prompt: "Body check reports should…",
            choices: ["Describe observations, not diagnoses", "Replace veterinary instructions", "Stay private off RuffOps", "Only be entered by managers"],
            correctIndex: 0,
            explanation: "Record what you see; escalate per Fitdog policy."
          }
        ]
      },
      {
        slug: "notifications",
        title: "Notifications",
        summary: "Inbox and responses overnight.",
        section: "Communication",
        order: 7,
        durationMinutes: 5,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_NOTIFICATIONS,
        guidedSteps: [{ title: "Notifications inbox", body: "Clear items assigned to you.", adminTab: "notifications" }]
      },
      {
        slug: "morning-handoff",
        title: "Morning handoff",
        summary: "What Front Desk needs from overnight.",
        section: "Wrap-up",
        order: 8,
        durationMinutes: 6,
        videoSrc: null,
        captionsVtt: null,
        videoStatus: "pending_capture",
        narrationStatus: "pending_human",
        narrationScript: on.ON_HANDOFF,
        guidedSteps: [{ title: "Final crossover note", body: "Write a scannable handoff in Team Log.", adminTab: "crossover_communication" }],
        quiz: onQuizFinal
      }
    ]
  }
];

export function courseForRole(role: string): TrainingCourseDef | null {
  return STAFF_TRAINING_COURSES.find((course) => course.audienceRoleKeys.includes(role)) ?? null;
}

export function estimatedCourseMinutes(course: TrainingCourseDef): number {
  return course.lessons.reduce((sum, lesson) => sum + lesson.durationMinutes, 0);
}

export function getLesson(courseSlug: string, lessonSlug: string) {
  const course = STAFF_TRAINING_COURSES.find((c) => c.slug === courseSlug);
  return course?.lessons.find((l) => l.slug === lessonSlug) ?? null;
}