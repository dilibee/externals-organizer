// Data layer. Supabase when configured (synced across devices); otherwise a local backend in
// localStorage, seeded in dev from .local/seed.json (npm run seed:local), so the UI runs without an account.
import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { COLLECTIONS, type CollectionName, type Collections, type Store } from "./types";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const supabase: SupabaseClient | null = URL_ && KEY ? createClient(URL_, KEY) : null;
export const mode: "supabase" | "local" = supabase ? "supabase" : "local";

const empty = (): Store => Object.fromEntries(COLLECTIONS.map(c => [c, {}])) as Store;

type Status = "loading" | "signedOut" | "ready" | "error";
interface State { status: Status; store: Store; session: Session | null; error?: string }
let state: State = { status: "loading", store: empty(), session: null };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const setState = (p: Partial<State>) => { state = { ...state, ...p }; emit(); };

function put<K extends CollectionName>(c: K, id: string, data: Collections[K] | null) {
  const col = { ...state.store[c] } as Record<string, Collections[K]>;
  if (data == null) delete col[id]; else col[id] = data;
  state = { ...state, store: { ...state.store, [c]: col } };
}

export const useDB = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
export const getStore = () => state.store;

let onError: (msg: string) => void = () => {};
export const setErrorHandler = (fn: (msg: string) => void) => { onError = fn; };

// ---------- writes: optimistic, one at a time per document ----------
const chains: Record<string, Promise<unknown>> = {};
// While our own write to a doc is in flight, realtime echoes for it are ignored so a slow echo can't undo a newer edit.
const inflight: Record<string, number> = {};
function queue(path: string, fn: () => Promise<unknown>) {
  inflight[path] = (inflight[path] || 0) + 1;
  chains[path] = (chains[path] || Promise.resolve()).then(fn).catch(e => {
    console.error(e); onError("Couldn't save that change. Check your connection and try again.");
  }).finally(() => { inflight[path]--; });
  return chains[path];
}

const LS = "eo.local.v2";
const saveLocal = () => { try { localStorage.setItem(LS, JSON.stringify(state.store)); } catch { onError("Browser storage is full."); } };

async function persist(c: CollectionName, id: string, data: unknown | null) {
  if (!supabase) { saveLocal(); return; }
  const uid = state.session?.user.id;
  if (!uid) throw new Error("Not signed in");
  if (data == null) {
    const { error } = await supabase.from("docs").delete().match({ user_id: uid, collection: c, id });
    if (error) throw error;
  } else {
    const { error } = await supabase.from("docs").upsert({ user_id: uid, collection: c, id, data, updated_at: new Date().toISOString() });
    if (error) throw error;
  }
}

export function setDoc<K extends CollectionName>(c: K, id: string, data: Collections[K]) {
  put(c, id, data); emit();
  return queue(`${c}/${id}`, () => persist(c, id, state.store[c][id] ?? data));
}
export function mergeDoc<K extends CollectionName>(c: K, id: string, patch: Partial<Collections[K]>) {
  const next = { ...(state.store[c][id] || {}), ...patch } as Collections[K];
  return setDoc(c, id, next);
}
export function deleteDoc(c: CollectionName, id: string) {
  put(c, id, null); emit();
  return queue(`${c}/${id}`, () => persist(c, id, null));
}
export async function flush() { await Promise.all(Object.values(chains)); }

// ---------- loading ----------
async function loadSupabase(session: Session) {
  const store = empty(); const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase!.from("docs").select("collection,id,data").range(from, from + page - 1);
    if (error) throw error;
    for (const r of data || []) if ((COLLECTIONS as string[]).includes(r.collection)) (store as any)[r.collection][r.id] = r.data;
    if (!data || data.length < page) break;
  }
  setState({ store, status: "ready", session });
  supabase!.channel("docs-" + session.user.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "docs", filter: `user_id=eq.${session.user.id}` }, payload => {
      const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { collection: CollectionName; id: string; data?: any };
      if (!row?.collection || !row.id) return;
      if (inflight[`${row.collection}/${row.id}`] > 0) return;
      put(row.collection, row.id, payload.eventType === "DELETE" ? null : row.data); emit();
    }).subscribe();
}
export async function boot() {
  if (!supabase) {
    let store: Store | null = null;
    try { const raw = localStorage.getItem(LS); if (raw) store = { ...empty(), ...JSON.parse(raw) }; } catch {}
    if (!store && import.meta.env.DEV) {
      try { const r = await fetch("/.local/seed.json"); if (r.ok) store = { ...empty(), ...(await r.json()) }; } catch {}
    }
    setState({ store: store || empty(), status: "ready" });
    if (store) saveLocal();
    return;
  }
  // INITIAL_SESSION fires once on startup, so this listener alone handles the first load and later sign-ins.
  let loadedFor: string | null = null;
  supabase.auth.onAuthStateChange((_e, session) => {
    if (!session) { loadedFor = null; supabase!.removeAllChannels(); setState({ status: "signedOut", session: null, store: empty() }); return; }
    if (loadedFor === session.user.id) { state = { ...state, session }; return; }   // token refresh
    loadedFor = session.user.id;
    // defer: supabase-js warns against awaiting its own calls inside this callback
    setTimeout(() => loadSupabase(session).catch(e => setState({ status: "error", error: String(e?.message || e) })), 0);
  });
}

export async function signIn(email: string) {
  if (!supabase) return;
  const redirect = window.location.origin + import.meta.env.BASE_URL;
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}
export async function signOut() { await supabase?.auth.signOut(); }

/** Local mode only: replace everything with an exported JSON (the same shape export produces). */
export function importStore(json: Partial<Store>) {
  state = { ...state, store: { ...empty(), ...json } }; emit(); saveLocal();
}
export const exportStore = () => JSON.stringify(state.store, null, 1);
