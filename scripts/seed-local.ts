// Dev only: bundle original/data into .local/seed.json so `npm run dev` works without Supabase.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, readOriginal } from "./common";

const store = readOriginal();
mkdirSync(join(ROOT, ".local"), { recursive: true });
writeFileSync(join(ROOT, ".local", "seed.json"), JSON.stringify(store));
console.log(Object.entries(store).map(([c, m]) => `${c}: ${Object.keys(m).length}`).join(", "));
