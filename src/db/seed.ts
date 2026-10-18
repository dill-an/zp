/** CLI: seed the database. FORCE_SEED=1 wipes first; SEED_SKIP_PASSWORD_CHANGE=1 skips the first-login password gate. */
import { db } from "./index";
import { seedDatabase } from "./seed-core";

const result = seedDatabase(db, { force: process.env.FORCE_SEED === "1", log: (m) => console.log(m) });
if (!result.seeded) console.log(result.message);
