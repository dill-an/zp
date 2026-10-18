/**
 * Clean job definitions and the weekly assignments transcribed from the
 * "Brothers for cleans" sheet ("Week 1", "All cleans" tabs).
 *
 * Offsets are days after the week's Sunday. "Sun" cleans are due the following Sunday (7).
 */
import type { JobCategory, JobKind } from "../schema";

export type SeedJobType = {
  key: string;
  name: string;
  kind: JobKind;
  category: JobCategory;
  windowLabel: string;
  startOffsetDays: number;
  dueOffsetDays: number;
  slots: number;
  points: number;
  instructions: string;
  isActive?: boolean;
};

export const SEED_JOB_TYPES: SeedJobType[] = [
  {
    key: "upstairs_commons",
    name: "Upstairs Commons",
    kind: "clean",
    category: "commons",
    windowLabel: "Mon-Wed",
    startOffsetDays: 1,
    dueOffsetDays: 3,
    slots: 1,
    points: 1,
    instructions: "Vacuum, wipe tables and surfaces, take out trash and recycling, straighten furniture.",
  },
  {
    key: "basement_commons",
    name: "Basement Commons",
    kind: "clean",
    category: "commons",
    windowLabel: "Mon-Wed",
    startOffsetDays: 1,
    dueOffsetDays: 3,
    slots: 1,
    points: 1,
    instructions: "Sweep/vacuum, wipe surfaces, take out trash and recycling, put away stray items.",
  },
  {
    key: "basement_bathroom",
    name: "Basement Bathroom",
    kind: "clean",
    category: "bathroom",
    windowLabel: "Sat-Sun",
    startOffsetDays: 6,
    dueOffsetDays: 7,
    slots: 1,
    points: 1,
    instructions: "Scrub toilet, sink and shower; mop floor; restock toilet paper and soap; empty trash.",
  },
  {
    key: "bathroom_2",
    name: "2nd Floor Bathroom",
    kind: "clean",
    category: "bathroom",
    windowLabel: "Sun",
    startOffsetDays: 7,
    dueOffsetDays: 7,
    slots: 1,
    points: 1,
    instructions: "Scrub toilet, sink and shower; mop floor; restock toilet paper and soap; empty trash.",
  },
  {
    key: "bathroom_3",
    name: "3rd Floor Bathroom",
    kind: "clean",
    category: "bathroom",
    windowLabel: "Sun",
    startOffsetDays: 7,
    dueOffsetDays: 7,
    slots: 1,
    points: 1,
    instructions: "Scrub toilet, sink and shower; mop floor; restock toilet paper and soap; empty trash.",
  },
  {
    key: "bathroom_4",
    name: "4th Floor Bathroom",
    kind: "clean",
    category: "bathroom",
    windowLabel: "Sun",
    startOffsetDays: 7,
    dueOffsetDays: 7,
    slots: 1,
    points: 1,
    instructions: "Scrub toilet, sink and shower; mop floor; restock toilet paper and soap; empty trash.",
  },
  { key: "kitchen_mon", name: "Monday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Mon", startOffsetDays: 1, dueOffsetDays: 1, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash." },
  { key: "kitchen_tue", name: "Tuesday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Tue", startOffsetDays: 2, dueOffsetDays: 2, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash." },
  { key: "kitchen_wed", name: "Wednesday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Wed", startOffsetDays: 3, dueOffsetDays: 3, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash." },
  { key: "kitchen_thu", name: "Thursday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Thu", startOffsetDays: 4, dueOffsetDays: 4, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash." },
  { key: "kitchen_sat", name: "Saturday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Sat", startOffsetDays: 6, dueOffsetDays: 6, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash." },
  { key: "kitchen_sun", name: "Sunday Kitchen", kind: "clean", category: "kitchen", windowLabel: "Sun", startOffsetDays: 7, dueOffsetDays: 7, slots: 2, points: 1, instructions: "Dishes, counters, stove, sweep and mop, take out trash. Done before house meeting." },
  {
    key: "kitchen_sameday",
    name: "Kitchen Clean (same-day Sunday)",
    kind: "clean",
    category: "kitchen",
    windowLabel: "Sun (week start)",
    startOffsetDays: 0,
    dueOffsetDays: 0,
    slots: 2,
    points: 1,
    instructions: "One-off kitchen clean on the Sunday that opens the week (used for the first week of the semester).",
    isActive: false,
  },
];

/** week_start (Sunday) -> job key -> names in slot order (preferred names / aliases as on the sheet). */
export const SEED_WEEKS: Record<string, Record<string, string[]>> = {
  "2026-09-13": {
    kitchen_sameday: ["Martin", "Alcides"],
    upstairs_commons: ["David Coll"],
    basement_commons: ["Ponce"],
    basement_bathroom: ["Ponce"],
    bathroom_2: ["Felipe"],
    bathroom_3: ["Mario"],
    bathroom_4: ["Jace"],
    kitchen_mon: ["Dom", "Payton"],
    kitchen_tue: ["Dylan", "Daniel"],
    kitchen_wed: ["Dannell", "Santana"],
    kitchen_thu: ["Jonas", "David Coll"],
    kitchen_sat: ["Andy", "Mario"],
    kitchen_sun: ["Martin", "Andy"],
  },
  "2026-09-20": {
    upstairs_commons: ["Daniel"],
    basement_commons: ["Jonas"],
    basement_bathroom: ["Alcides"],
    bathroom_2: ["Theo"],
    bathroom_3: ["Gio"],
    bathroom_4: ["Andy"],
    kitchen_mon: ["Daniel", "David Coll"],
    kitchen_tue: ["Payton", "Dominik"],
    kitchen_wed: ["Dylan", "Ponciano"],
    kitchen_thu: ["Dannell", "David Santana"],
    kitchen_sat: ["Alcides", "Mario"],
    kitchen_sun: ["Jonas", "Martin"],
  },
  "2026-09-27": {
    upstairs_commons: ["Nick"],
    basement_commons: ["Dylan"],
    basement_bathroom: ["Daniel"],
    bathroom_2: ["Cal"],
    bathroom_3: ["Aydan"],
    bathroom_4: ["Dylan"],
    kitchen_mon: ["Martin", "Ponce"],
    kitchen_tue: ["Payton", "Dominik"],
    kitchen_wed: ["David Coll", "Mario"],
    kitchen_thu: ["Daniel", "Andy"],
    kitchen_sat: ["Jonas", "Alcides"],
    kitchen_sun: ["Dannell", "Santana"],
  },
  "2026-10-04": {
    upstairs_commons: ["Dylan"],
    basement_commons: ["Dylan"],
    basement_bathroom: ["Vincent"],
    bathroom_2: ["Jake"],
    bathroom_3: ["Santana"],
    bathroom_4: ["Veolsing"],
    kitchen_mon: ["Payton", "Dominik"],
    kitchen_tue: ["Jonas", "Alcides"],
    kitchen_wed: ["David Coll", "Mario"],
    kitchen_thu: ["Daniel", "Andy"],
    kitchen_sat: ["Ponce", "Santana"],
    kitchen_sun: ["Dannell", "Martin"],
  },
  "2026-10-11": {
    upstairs_commons: ["Dylan"],
    basement_commons: ["Dylan"],
    basement_bathroom: ["Raed"],
    bathroom_2: ["Payton"],
    bathroom_3: ["Eduardo"],
    bathroom_4: ["Dylan"],
    kitchen_mon: ["Payton", "Dominik"],
    kitchen_tue: ["Jonas", "Alcides"],
    kitchen_wed: ["David Coll", "Mario"],
    kitchen_thu: ["Daniel", "Andy"],
    kitchen_sat: ["Ponce", "Santana"],
    kitchen_sun: ["Dannell", "Martin"],
  },
};
