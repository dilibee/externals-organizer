export function lockIsStale(mtimeMs: number, now = Date.now()): boolean {
  return now - mtimeMs > 90_000;
}

export const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function retryFinal<T>(save: () => Promise<T>, wait = delay): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await save(); }
    catch (error) {
      if (attempt >= 3) throw error;
      await wait(2000);
    }
  }
}
