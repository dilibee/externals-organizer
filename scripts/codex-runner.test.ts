import { afterEach, describe, expect, it, vi } from "vitest";
import { childEnv, runCodex, fallbackOnQuota } from "./codex-runner";
afterEach(() => vi.unstubAllEnvs());
describe("Codex isolation", () => {
  it("removes database credentials and API-key billing from the child environment", () => {
    for (const key of ["SUPABASE_SERVICE_ROLE_KEY", "OWNER_USER_ID", "VITE_SUPABASE_URL", "SUPABASE_OTHER", "vite_other", "OPENAI_API_KEY"]) vi.stubEnv(key, "test-placeholder");
    vi.stubEnv("APPDATA", "profile-path");
    const env = childEnv();
    expect(Object.keys(env).filter(k => /^(SUPABASE_|VITE_|OWNER_USER_ID$|OPENAI_API_KEY$)/i.test(k))).toEqual([]);
    expect(env.APPDATA).toBe("profile-path");
  });
  it("rejects oversized UTF-8 prompts before creating a child", async () => {
    await expect(runCodex("x".repeat(300 * 1024 + 1))).rejects.toThrow("300 KB");
    await expect(runCodex("\u20ac".repeat(103000))).rejects.toThrow("300 KB");
  });
});

it('routes only non-web quota failures and preserves quota errors at the cap',async()=>{
 const quota=new Error('Your Codex usage quota is exhausted.');let calls=0;
 const fallback=async()=>{calls++;return 'Claude answer';};
 expect(await fallbackOnQuota(Promise.resolve('Codex answer'),false,fallback)).toBe('Codex answer');
 await expect(fallbackOnQuota(Promise.reject(quota),true,fallback)).rejects.toBe(quota);
 await expect(fallbackOnQuota(Promise.reject(new Error('login')),false,fallback)).rejects.toThrow('login');
 expect(calls).toBe(0);
 expect(await fallbackOnQuota(Promise.reject(quota),false,fallback)).toBe('Claude answer');expect(calls).toBe(1);
 await expect(fallbackOnQuota(Promise.reject(quota),false,async()=>null)).rejects.toBe(quota);
});
