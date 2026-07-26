import type { OperationsChecklistTemplateSeed } from "@/lib/operations-checklist/types";

type SeedInput = {
  section_key: OperationsChecklistTemplateSeed["section_key"];
  section_label: string;
  section_sort: number;
  assigned_role: OperationsChecklistTemplateSeed["assigned_role"];
  due_time: string | null;
  titles: string[];
  requires_photo?: boolean;
  requires_management_approval?: boolean;
};

function buildSeeds(groups: SeedInput[]): OperationsChecklistTemplateSeed[] {
  const seeds: OperationsChecklistTemplateSeed[] = [];
  for (const group of groups) {
    group.titles.forEach((title, index) => {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 72);
      seeds.push({
        catalog_key: `${group.section_key}__${group.assigned_role}__${String(index + 1).padStart(2, "0")}__${slug}`,
        section_key: group.section_key,
        section_label: group.section_label,
        section_sort: group.section_sort,
        title,
        assigned_role: group.assigned_role,
        due_time: group.due_time,
        sort_order: group.section_sort * 100 + index + 1,
        is_recurring: true,
        requires_photo: Boolean(group.requires_photo),
        requires_management_approval: Boolean(group.requires_management_approval)
      });
    });
  }
  return seeds;
}

/** Canonical daily Operations Checklist task catalog. */
export const OPERATIONS_CHECKLIST_CATALOG: OperationsChecklistTemplateSeed[] = buildSeeds([
  {
    section_key: "opening_crossover",
    section_label: "1. Opening and Crossover",
    section_sort: 1,
    assigned_role: "overnight",
    due_time: "06:30:00",
    titles: [
      "Complete overnight dog count",
      "Confirm every dog is accounted for",
      "Record overnight feeding, medication, potty, health, and behavior notes",
      "Flag vomiting, diarrhea, coughing, injuries, appetite changes, or unusual behavior",
      "Confirm medications were given and recorded in Gingr",
      "Refresh water bowls",
      "Remove soiled bedding",
      "Prepare dogs for morning handoff",
      "Complete crossover with the opening team",
      "Identify dogs requiring management follow-up"
    ]
  },
  {
    section_key: "opening_crossover",
    section_label: "1. Opening and Crossover",
    section_sort: 1,
    assigned_role: "opening_team",
    due_time: "07:00:00",
    titles: [
      "Review overnight crossover notes",
      "Confirm building, yard, and kennel safety",
      "Turn on lights and ventilation",
      "Check gates, latches, doors, cameras, and emergency exits",
      "Inspect yards for hazards, waste, standing water, or damaged equipment",
      "Set up clean water stations",
      "Set up play equipment and time-out pens",
      "Check mop buckets, poop buckets, slip leads, radios, and fanny packs",
      "Assign staff to yards, rotations, walks, and cleaning duties",
      "Review dogs with medical, feeding, behavioral, or handling instructions",
      "Confirm no yard is left unattended"
    ]
  },
  {
    section_key: "morning_dog_care",
    section_label: "2. Morning Dog Care",
    section_sort: 2,
    assigned_role: "handler",
    due_time: "08:30:00",
    titles: [
      "Complete morning potty walks",
      "Confirm every boarding dog was walked or placed in the yard",
      "Check dogs for injuries, collar fit, skin issues, and unusual behavior",
      "Verify feeding instructions and wet ingredients",
      "Prepare and serve breakfast",
      "Refresh water after feeding",
      "Give scheduled morning medications",
      "Record all meals and medications in Gingr",
      "Prepare clean bedding",
      "Separate dogs requiring rest, breaks, or special handling",
      "Review taxi pickups and expected daycare arrivals",
      "Begin required report cards and training snapshots"
    ]
  },
  {
    section_key: "check_in_flow",
    section_label: "3. Check-In Flow",
    section_sort: 3,
    assigned_role: "front_desk",
    due_time: "09:00:00",
    titles: [
      "Review expected arrivals, appointments, training, grooming, and transportation",
      "Confirm emergency contacts and feeding or medication instructions",
      "Check vaccination alerts",
      "Review client notes and special instructions",
      "Alert handlers when a high-needs or special-handling dog arrives",
      "Confirm belongings are labeled",
      "Confirm medication is labeled and documented",
      "Notify groomers and trainers of arrivals",
      "Record late arrivals, cancellations, or service changes",
      "Send required dog information to the Staff Board"
    ]
  },
  {
    section_key: "check_in_flow",
    section_label: "3. Check-In Flow",
    section_sort: 3,
    assigned_role: "handler",
    due_time: "09:30:00",
    titles: [
      "Receive the dog using approved handling procedures",
      "Complete visual body and collar check",
      "Review temperament and handling notes",
      "Introduce the dog to the appropriate yard or rotation",
      "Confirm belongings reach the correct area",
      "Report injuries, illness, or behavior concerns immediately"
    ]
  },
  {
    section_key: "yard_operations",
    section_label: "4. Yard Operations",
    section_sort: 4,
    assigned_role: "handler",
    due_time: "11:00:00",
    titles: [
      "Confirm each active yard has an assigned staff member",
      "Complete dog count at the start of every yard rotation",
      "Review restricted-play and rotation dogs",
      "Maintain active engagement with dogs",
      "Monitor body language and intervene early",
      "Use LIMA-approved handling only",
      "Use slip leads when required",
      "Never carry dogs over the shoulder",
      "Refresh water throughout the shift",
      "Remove waste immediately",
      "Rake turf and clean high-traffic areas",
      "Keep gates and walkways clear",
      "Rotate dogs for rest and breaks",
      "Complete scheduled body and collar checks",
      "Record behavior, health, or safety concerns",
      "Submit an incident report when required",
      "Never leave a yard unattended"
    ]
  },
  {
    section_key: "walks_and_services",
    section_label: "5. Walks and Services",
    section_sort: 5,
    assigned_role: "handler",
    due_time: "13:00:00",
    titles: [
      "Review the Walks Board",
      "Complete “No Plays,” “Break Dogs,” and “Groomed Dogs” walks",
      "Complete private walks and enrichment services",
      "Confirm group classes and training sessions",
      "Confirm grooming appointments",
      "Confirm adventure hikes, beach trips, and taxi services",
      "Mark each service in progress",
      "Mark each service completed",
      "Record completion time",
      "Upload required photos, videos, snapshots, or notes",
      "Escalate missed or delayed services to the Team Lead"
    ],
    requires_photo: true
  },
  {
    section_key: "midday_operations",
    section_label: "6. Midday Operations",
    section_sort: 6,
    assigned_role: "all_staff",
    due_time: "13:00:00",
    titles: [
      "Complete midday dog count",
      "Confirm all dogs are in the correct yard, room, kennel, or service",
      "Review dogs that have not eaten, eliminated, or settled",
      "Serve lunch and snacks as scheduled",
      "Give midday medications",
      "Refresh all water bowls",
      "Complete bedding and kennel checks",
      "Review pending grooming and training services",
      "Check report card and snapshot progress",
      "Review open incidents, vet visits, and management alerts",
      "Complete scheduled yard cleaning",
      "Complete staff crossover before breaks",
      "Confirm every yard remains covered during lunches"
    ]
  },
  {
    section_key: "grooming_flow",
    section_label: "7. Grooming Flow",
    section_sort: 7,
    assigned_role: "groomer",
    due_time: "15:00:00",
    titles: [
      "Review scheduled grooming dogs",
      "Confirm each grooming dog has arrived",
      "Review owner instructions and service selections",
      "Use Grooming Push when the dog is ready",
      "Confirm the dog is brought using a slip lead",
      "Record service start time",
      "Report skin, ear, nail, coat, or health concerns",
      "Complete service notes",
      "Upload grooming photo when required",
      "Mark the dog ready for pickup",
      "Place the dog on the Walks Board when a post-grooming walk is needed",
      "Notify Front Desk of delays or service changes"
    ],
    requires_photo: true
  },
  {
    section_key: "training_flow",
    section_label: "8. Training Flow",
    section_sort: 8,
    assigned_role: "trainer",
    due_time: "15:00:00",
    titles: [
      "Review the day’s training schedule",
      "Confirm each training dog has arrived",
      "Review goals and previous trainer notes",
      "Complete the scheduled session",
      "Record behaviors practiced",
      "Record progress and areas needing reinforcement",
      "Upload the training snapshot",
      "Upload required photo or video",
      "Confirm the client receives a training report, not a daycare report",
      "Notify Front Desk and management of missing information or client concerns"
    ],
    requires_photo: true
  },
  {
    section_key: "transportation_flow",
    section_label: "9. Transportation Flow",
    section_sort: 9,
    assigned_role: "transportation",
    due_time: "16:00:00",
    titles: [
      "Review the assigned route",
      "Confirm dogs, addresses, access instructions, and belongings",
      "Check in with Front Desk before departure",
      "Secure every dog properly",
      "Mark each pickup and drop-off",
      "Record delays or access problems",
      "Confirm each dog is transferred to the correct staff member",
      "Complete vehicle inspection after the route",
      "Remove waste, belongings, and equipment",
      "Report vehicle or safety concerns"
    ]
  },
  {
    section_key: "checkout_flow",
    section_label: "10. Checkout Flow",
    section_sort: 10,
    assigned_role: "front_desk",
    due_time: "17:30:00",
    titles: [
      "Review dogs expected to leave",
      "Confirm all scheduled services were completed",
      "Confirm report card or training snapshot was submitted",
      "Verify belongings, medication, food, and personal items",
      "Review any incident, health, or behavior notes",
      "Confirm payment or open balance",
      "Add the dog to the Staff Board checkout flow",
      "Notify handlers that the owner has arrived",
      "Provide owner updates requiring Front Desk communication",
      "Escalate sensitive conversations to management"
    ]
  },
  {
    section_key: "checkout_flow",
    section_label: "10. Checkout Flow",
    section_sort: 10,
    assigned_role: "handler",
    due_time: "17:30:00",
    titles: [
      "Complete final body and collar check",
      "Confirm the dog is clean and ready",
      "Collect all belongings",
      "Use a slip lead when required",
      "Bring the correct dog to Front Desk",
      "Report last-minute concerns before releasing the dog"
    ]
  },
  {
    section_key: "incidents_vet_followup",
    section_label: "11. Incidents, Vet Visits, and Owner Follow-Up",
    section_sort: 11,
    assigned_role: "management",
    due_time: "18:00:00",
    titles: [
      "Review all newly submitted incidents",
      "Review all reported vet visits",
      "Upload available photos, receipts, or documentation",
      "Confirm the responsible manager was alerted",
      "Assign an owner follow-up",
      "Record who contacted the owner",
      "Record the outcome of the conversation",
      "Update status to In Progress or Resolved",
      "Document corrective action or operational changes",
      "Do not mark resolved without management review"
    ],
    requires_management_approval: true
  },
  {
    section_key: "afternoon_crossover",
    section_label: "12. Afternoon Crossover",
    section_sort: 12,
    assigned_role: "team_lead",
    due_time: "15:00:00",
    titles: [
      "Complete dog count",
      "Review remaining daycare and boarding dogs",
      "Review medications still due",
      "Review meals and snacks still due",
      "Review pending grooming, training, walks, and report cards",
      "Identify dogs requiring breaks or special handling",
      "Review open incidents and owner follow-ups",
      "Confirm staff assignments for the remainder of the shift",
      "Transfer all incomplete tasks to the next team",
      "Require the receiving Team Lead to acknowledge crossover"
    ],
    requires_management_approval: true
  },
  {
    section_key: "closing_operations",
    section_label: "13. Closing Operations",
    section_sort: 13,
    assigned_role: "all_staff",
    due_time: "20:00:00",
    titles: [
      "Confirm all daycare dogs were checked out",
      "Confirm remaining boarding dogs are accounted for",
      "Serve scheduled dinner",
      "Give evening medications",
      "Record feeding and medications in Gingr",
      "Complete final potty walks",
      "Refresh overnight water",
      "Prepare clean bedding",
      "Clean and disinfect yards",
      "Rake turf and remove waste",
      "Clean kennels, common areas, grooming spaces, and food-prep areas",
      "Empty trash and poop buckets",
      "Clean and store equipment",
      "Check gates, doors, lights, ventilation, and cameras",
      "Review overnight instructions",
      "Complete closing crossover",
      "Report unresolved tasks to management",
      "Obtain Team Lead closing approval"
    ],
    requires_management_approval: true
  }
]);

export const OPERATIONS_CHECKLIST_SECTION_ORDER = [
  "opening_crossover",
  "morning_dog_care",
  "check_in_flow",
  "yard_operations",
  "walks_and_services",
  "midday_operations",
  "grooming_flow",
  "training_flow",
  "transportation_flow",
  "checkout_flow",
  "incidents_vet_followup",
  "afternoon_crossover",
  "closing_operations"
] as const;
