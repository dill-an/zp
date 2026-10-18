/**
 * Roster transcribed from the "ZP House Meeting FA 26" sheet (Fall 2026 tab)
 * and the "Brothers for cleans" sheet (cooks vs cleans split).
 *
 * `preferred` is the short name used on the labor grid.
 */
import type { LaborGroup, MemberStatus } from "../schema";

export type SeedMember = {
  first: string;
  last: string;
  preferred?: string;
  pledgeClass: string | null;
  laborGroup: LaborGroup;
  status?: MemberStatus;
  role?: "admin" | "officer" | "member";
  /** Alternate spellings that appear on the cleans sheet. */
  aliases?: string[];
  notes?: string;
};

/** Pledge classes, oldest first. */
export const SEED_PLEDGE_CLASSES = [
  { name: "Psi", sortOrder: 1 },
  { name: "Omega", sortOrder: 2 },
  { name: "Beta Alpha", sortOrder: 3 },
  { name: "Beta Beta", sortOrder: 4, semesterLabel: "Fall 2026" },
] as const;

export const SEED_MEMBERS: SeedMember[] = [
  // Psi
  { first: "Felipe", last: "Abreu", pledgeClass: "Psi", laborGroup: "cooks" },
  { first: "Dannell", last: "Lopez", pledgeClass: "Psi", laborGroup: "cleans" },
  { first: "David", last: "Santana", preferred: "Santana", pledgeClass: "Psi", laborGroup: "cleans", aliases: ["David Santana"] },
  { first: "Andrew", last: "Voelsing", preferred: "Voelsing", pledgeClass: "Psi", laborGroup: "cooks", aliases: ["Veolsing"] },
  { first: "Mario", last: "Zamora Delgado", preferred: "Mario", pledgeClass: "Psi", laborGroup: "cleans", aliases: ["Mario Zamora"] },

  // Omega
  { first: "David", last: "Coll Leon", preferred: "David Coll", pledgeClass: "Omega", laborGroup: "cleans" },
  { first: "Diego", last: "Del Rio", pledgeClass: "Omega", laborGroup: "cooks" },
  { first: "Vincent", last: "Do", pledgeClass: "Omega", laborGroup: "cooks" },
  { first: "Eduardo", last: "Hernandez Sanchez", pledgeClass: "Omega", laborGroup: "cooks" },
  { first: "Andrew", last: "Jacoby", preferred: "Andy", pledgeClass: "Omega", laborGroup: "cleans" },
  { first: "Jace", last: "Lopez", pledgeClass: "Omega", laborGroup: "cooks" },
  { first: "Alcides", last: "Manzo", pledgeClass: "Omega", laborGroup: "cleans" },
  { first: "Dylan", last: "Nguyen", pledgeClass: "Omega", laborGroup: "cleans", role: "admin" },
  { first: "Ponciano", last: "Rubio", preferred: "Ponce", pledgeClass: "Omega", laborGroup: "cleans", aliases: ["Ponciano"] },
  { first: "Cal", last: "Rustad", pledgeClass: "Omega", laborGroup: "cooks" },
  { first: "Daniel", last: "Tecum", pledgeClass: "Omega", laborGroup: "cleans" },
  { first: "Jake", last: "Weiss", pledgeClass: "Omega", laborGroup: "cooks" },

  // Beta Alpha
  { first: "Martin", last: "Meister", pledgeClass: "Beta Alpha", laborGroup: "cleans" },
  { first: "Dominik", last: "Grzeszczak", pledgeClass: "Beta Alpha", laborGroup: "cleans", aliases: ["Dom"] },
  { first: "Noah", last: "Rose", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Jonas", last: "Sun", pledgeClass: "Beta Alpha", laborGroup: "cleans" },
  { first: "Gio", last: "Mandwee", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Nicholas", last: "Ramos", preferred: "Nick", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Theodore", last: "Carman", preferred: "Theo", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Aydan", last: "Radke", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Bodie", last: "Weeks", pledgeClass: "Beta Alpha", laborGroup: "cooks" },
  { first: "Raed", last: "Tulbah", pledgeClass: "Beta Alpha", laborGroup: "cooks" },

  // On the cleans roster but not on the house meeting sheet.
  {
    first: "Payton",
    last: "Berry-Briggs",
    pledgeClass: null,
    laborGroup: "cleans",
    notes: "Listed on the cleans roster but not on the Fall 2026 house meeting sheet; set pledge class.",
  },

  // Beta Beta (Fall 2026 new member class)
  { first: "Marcos", last: "Arroyo-Cruz", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Nolan", last: "Campos-Ramirez", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Seth", last: "Griffin", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Daniel", last: "Idowu", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Angel", last: "Jaramillo", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Aidan", last: "Lee", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Benjamin", last: "Levine", preferred: "Ben", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Kian", last: "Nhuch", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Jiexi", last: "Pan", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Matteo", last: "Paz", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Roy", last: "Rattler III", preferred: "Roy", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Hasin", last: "Shaykat", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Christopher", last: "Vargas", preferred: "Chris", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
  { first: "Albert", last: "Wu", pledgeClass: "Beta Beta", laborGroup: "none", status: "new_member" },
];

/**
 * House meeting attendance from the sheet. Dates are the Sunday meetings;
 * values map "Last, First"-independent keys ("First Last") to P/A/E.
 * Beta Beta had no 9/13 entry (they had not joined yet).
 */
export const SEED_MEETING_DATES_RECORDED = ["2026-09-13", "2026-09-20", "2026-09-27", "2026-10-04", "2026-10-11"] as const;
export const SEED_MEETING_DATES_UPCOMING = [
  "2026-10-18",
  "2026-10-25",
  "2026-11-01",
  "2026-11-08",
  "2026-11-15",
  "2026-11-22",
  "2026-11-29",
  "2026-12-06",
  "2026-12-13",
] as const;

type Mark = "P" | "A" | "E" | "-";
/** Key is "First Last" as in SEED_MEMBERS (first + last). */
export const SEED_ATTENDANCE: Record<string, [Mark, Mark, Mark, Mark, Mark]> = {
  // Beta Beta
  "Marcos Arroyo-Cruz": ["-", "P", "P", "P", "P"],
  "Nolan Campos-Ramirez": ["-", "P", "P", "E", "A"],
  "Seth Griffin": ["-", "P", "P", "P", "A"],
  "Daniel Idowu": ["-", "P", "A", "A", "A"],
  "Angel Jaramillo": ["-", "A", "P", "A", "P"],
  "Aidan Lee": ["-", "P", "A", "A", "A"],
  "Benjamin Levine": ["-", "P", "P", "P", "P"],
  "Kian Nhuch": ["-", "P", "P", "P", "P"],
  "Jiexi Pan": ["-", "A", "P", "P", "P"],
  "Matteo Paz": ["-", "P", "P", "A", "P"],
  "Roy Rattler III": ["-", "A", "A", "P", "A"],
  "Hasin Shaykat": ["-", "P", "P", "P", "A"],
  "Christopher Vargas": ["-", "P", "P", "P", "P"],
  "Albert Wu": ["-", "P", "P", "P", "A"],
  // Beta Alpha
  "Martin Meister": ["P", "P", "P", "P", "P"],
  "Dominik Grzeszczak": ["P", "P", "P", "P", "P"],
  "Noah Rose": ["P", "P", "P", "P", "A"],
  "Jonas Sun": ["A", "A", "A", "P", "P"],
  "Gio Mandwee": ["P", "P", "P", "P", "P"],
  "Nicholas Ramos": ["P", "P", "P", "P", "P"],
  "Theodore Carman": ["E", "P", "P", "P", "P"],
  "Aydan Radke": ["P", "P", "P", "E", "P"],
  "Bodie Weeks": ["P", "P", "P", "P", "P"],
  "Raed Tulbah": ["P", "P", "E", "P", "P"],
  // Omega
  "David Coll Leon": ["P", "P", "A", "P", "A"],
  "Diego Del Rio": ["P", "P", "A", "P", "P"],
  "Vincent Do": ["P", "A", "A", "A", "E"],
  "Eduardo Hernandez Sanchez": ["P", "P", "P", "A", "P"],
  "Andrew Jacoby": ["E", "A", "P", "P", "E"],
  "Jace Lopez": ["P", "P", "P", "P", "P"],
  "Alcides Manzo": ["E", "A", "A", "A", "P"],
  "Dylan Nguyen": ["P", "P", "P", "P", "P"],
  "Ponciano Rubio": ["P", "A", "P", "A", "P"],
  "Cal Rustad": ["P", "P", "A", "P", "P"],
  "Daniel Tecum": ["P", "P", "P", "A", "P"],
  "Jake Weiss": ["E", "P", "P", "P", "P"],
  // Psi
  "Felipe Abreu": ["P", "P", "P", "P", "A"],
  "Dannell Lopez": ["P", "P", "P", "P", "E"],
  "David Santana": ["P", "P", "E", "A", "A"],
  "Andrew Voelsing": ["P", "P", "P", "P", "P"],
  "Mario Zamora Delgado": ["P", "P", "P", "P", "P"],
};
