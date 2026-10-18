import type { ChairCategory } from "../schema";

export type SeedChair = {
  slug: string;
  name: string;
  category: ChairCategory;
  isExec?: boolean;
  description: string;
  responsibilities: string[];
};

/** Slugs must match CHAIR_PERMISSIONS in src/lib/permissions.ts. */
export const SEED_CHAIRS: SeedChair[] = [
  {
    slug: "president",
    name: "President",
    category: "exec",
    isExec: true,
    description: "Runs the chapter, chairs house meetings and exec, and is the point of contact for nationals and the university.",
    responsibilities: ["Run weekly house meeting and exec meeting", "Hold chairs accountable to their task boards", "Represent the chapter to alumni, nationals and MIT"],
  },
  {
    slug: "vice_president",
    name: "Vice President",
    category: "exec",
    isExec: true,
    description: "Backs up the president, oversees committees and chair progress.",
    responsibilities: ["Check in with every chair weekly", "Run meetings when the president is out", "Coordinate standards and sanctions with the house manager"],
  },
  {
    slug: "treasurer",
    name: "Treasurer",
    category: "exec",
    isExec: true,
    description: "Owns the budget, dues collection and the ledger.",
    responsibilities: ["Set dues amounts and due dates each semester", "Record every payment and keep balances current", "Chase late dues and set up payment plans", "Report finances at house meeting"],
  },
  {
    slug: "secretary",
    name: "Secretary",
    category: "exec",
    isExec: true,
    description: "Keeps the roster, takes attendance and records minutes.",
    responsibilities: ["Take attendance at every house meeting", "Post minutes within 24 hours", "Keep the roster and contact info current"],
  },
  {
    slug: "house_manager",
    name: "House Manager",
    category: "house",
    isExec: true,
    description: "Runs the cleans schedule, house maintenance and work sanctions.",
    responsibilities: ["Post the cleans schedule every Sunday", "Verify cleans and log missed ones", "Assign punishment jobs and verify completion", "Track maintenance requests and coordinate repairs"],
  },
  {
    slug: "steward",
    name: "Steward",
    category: "house",
    description: "Runs the kitchen: cook shifts, groceries and kitchen standards.",
    responsibilities: ["Publish the weekly cook schedule", "Order groceries within budget", "Keep the kitchen stocked and sanitary"],
  },
  {
    slug: "standards",
    name: "Standards Chair",
    category: "internal",
    description: "Handles conduct issues, standards hearings and fines.",
    responsibilities: ["Hear standards cases", "Record sanctions and follow up on completion", "Keep the sanctions policy posted"],
  },
  {
    slug: "social_chair",
    name: "Social Chair",
    category: "social",
    description: "Plans socials, mixers and formals.",
    responsibilities: ["Plan at least one social per month", "Submit event registrations and risk plans", "Coordinate setup and cleanup crews"],
  },
  {
    slug: "rush_chair",
    name: "Rush Chair",
    category: "external",
    description: "Runs recruitment.",
    responsibilities: ["Plan the rush calendar", "Track PNMs and bids", "Coordinate rush events with social and risk"],
  },
  {
    slug: "new_member_educator",
    name: "New Member Educator",
    category: "internal",
    description: "Runs the new member program for the current pledge class.",
    responsibilities: ["Run weekly new member meetings", "Track new member requirements", "Plan initiation with the president"],
  },
  {
    slug: "risk_manager",
    name: "Risk Manager",
    category: "internal",
    description: "Owns risk management and sober monitor coverage for events.",
    responsibilities: ["Assign sober monitors for every registered event", "Keep the risk policy posted", "Run the annual risk training"],
  },
  {
    slug: "philanthropy_chair",
    name: "Philanthropy Chair",
    category: "external",
    description: "Plans philanthropy and service events.",
    responsibilities: ["Plan one philanthropy event per semester", "Track service hours", "Coordinate with other houses on joint events"],
  },
  {
    slug: "brotherhood_chair",
    name: "Brotherhood Chair",
    category: "internal",
    description: "Plans brotherhood events and retreats.",
    responsibilities: ["Plan a brotherhood event every month", "Organize the semester retreat"],
  },
  {
    slug: "alumni_relations",
    name: "Alumni Relations",
    category: "external",
    description: "Keeps alumni engaged and informed.",
    responsibilities: ["Send the semester newsletter", "Plan homecoming and alumni weekend", "Maintain the alumni contact list"],
  },
  {
    slug: "athletics_chair",
    name: "Athletics Chair",
    category: "internal",
    description: "Runs intramural sign-ups and teams.",
    responsibilities: ["Register IM teams each season", "Post game schedules"],
  },
  {
    slug: "scholarship_chair",
    name: "Scholarship Chair",
    category: "internal",
    description: "Supports academics and tracks the house GPA.",
    responsibilities: ["Organize study hours", "Track grade reports", "Connect brothers with tutoring"],
  },
  {
    slug: "historian",
    name: "Historian",
    category: "internal",
    description: "Documents the chapter's history and photos.",
    responsibilities: ["Collect photos from every event", "Maintain the composite and archives"],
  },
  {
    slug: "webmaster",
    name: "Webmaster / IT",
    category: "internal",
    description: "Maintains the website, this app and member accounts.",
    responsibilities: ["Keep the website and this app running", "Create accounts for new members", "Reset passwords on request"],
  },
];

export type SeedTask = {
  chair: string;
  title: string;
  description?: string;
  /** Days from today (negative = already overdue). */
  dueInDays?: number;
  priority?: "low" | "normal" | "high" | "urgent";
  recurrence?: "none" | "weekly" | "biweekly" | "monthly";
  checklist?: string[];
};

export const SEED_TASKS: SeedTask[] = [
  { chair: "president", title: "Assign every chair in the app", description: "Open Chairs and set the current holder for each position so task boards and permissions work.", dueInDays: 2, priority: "high" },
  { chair: "president", title: "Set exec meeting time for the rest of the semester", dueInDays: 7 },
  { chair: "treasurer", title: "Set Fall 2026 dues amount and bill all members", description: "Open Dues, edit the Fall 2026 period amount and due date, then use Bill members.", dueInDays: 3, priority: "high", checklist: ["Confirm amount with exec", "Set due date", "Bill all active members", "Post Venmo handle in settings"] },
  { chair: "treasurer", title: "Reconcile Venmo payments against the ledger", dueInDays: 7, recurrence: "weekly" },
  { chair: "secretary", title: "Take attendance at Sunday house meeting", dueInDays: 0, recurrence: "weekly" },
  { chair: "secretary", title: "Post minutes from last house meeting", dueInDays: 1 },
  { chair: "house_manager", title: "Post cleans for this week", description: "Open Labor, create this week and assign every slot. Use Auto-fill to balance counts.", dueInDays: 0, priority: "high", recurrence: "weekly" },
  { chair: "house_manager", title: "Walk the house and log maintenance issues", dueInDays: 4, recurrence: "weekly" },
  { chair: "steward", title: "Publish this week's cook schedule", dueInDays: 0, recurrence: "weekly" },
  { chair: "social_chair", title: "Plan Halloween social", dueInDays: 12, priority: "high", checklist: ["Pick theme", "Register event with risk manager", "Set budget with treasurer", "Assign setup and cleanup crews"] },
  { chair: "rush_chair", title: "Draft spring rush calendar", dueInDays: 30 },
  { chair: "new_member_educator", title: "Finalize Beta Beta education schedule", dueInDays: 5, priority: "high" },
  { chair: "risk_manager", title: "Confirm sober monitors for next social", dueInDays: 10 },
  { chair: "alumni_relations", title: "Send fall alumni newsletter", dueInDays: 21 },
  { chair: "philanthropy_chair", title: "Pick and schedule fall philanthropy event", dueInDays: 14 },
  { chair: "webmaster", title: "Get every brother to log in and change their password", description: "Default password is in the README. Follow up with anyone who has not logged in.", dueInDays: 7, priority: "normal" },
];
