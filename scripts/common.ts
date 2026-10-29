// Shared helpers for the Node scripts (import, snapshot, apply).
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { COLLECTIONS, type Store } from "../src/lib/types";

export const ROOT = join(import.meta.dirname, "..");

export function readOriginal(dir = join(ROOT, "original", "data")): Store {
  const store = Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as any;
  for (const c of COLLECTIONS) {
    const p = join(dir, c);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p).filter(f => f.endsWith(".json"))) store[c][f.slice(0, -5)] = JSON.parse(readFileSync(join(p, f), "utf8"));
  }
  return store;
}

/** Service-role client plus the owner's user id; both come from .env and never reach the browser. */
export function admin() {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY, owner = process.env.OWNER_USER_ID;
  if (!url || !key || !owner) throw new Error("Set VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OWNER_USER_ID in .env");
  return { db: createClient(url, key, { auth: { persistSession: false } }), owner };
}

export async function loadStore(): Promise<Store> {
  const { db, owner } = admin();
  const store = Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as any;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("docs").select("collection,id,data").eq("user_id", owner).range(from, from + 999);
    if (error) throw error;
    for (const r of data) if (store[r.collection]) store[r.collection][r.id] = r.data;
    if (data.length < 1000) break;
  }
  return store;
}

export async function upsert(rows: { collection: string; id: string; data: unknown }[]) {
  const { db, owner } = admin();
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from("docs").upsert(rows.slice(i, i + 200).map(r => ({ ...r, user_id: owner, updated_at: new Date().toISOString() })));
    if (error) throw error;
  }
}

export async function remove(rows: { collection: string; id: string }[]) {
  const { db, owner } = admin();
  for (const r of rows) {
    const { error } = await db.from("docs").delete().match({ user_id: owner, collection: r.collection, id: r.id });
    if (error) throw error;
  }
}
