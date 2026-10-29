// One-time: copy the claude.ai artifact's export (original/data) into Supabase for OWNER_USER_ID.
import { readOriginal, upsert } from "./common";

const store = readOriginal();
const rows = Object.entries(store).flatMap(([collection, docs]) => Object.entries(docs).map(([id, data]) => ({ collection, id, data })));
await upsert(rows);
console.log(`Imported ${rows.length} documents: ` + Object.entries(store).map(([c, m]) => `${c} ${Object.keys(m).length}`).join(", "));
