import { claudeFallback } from './claude-fallback';
import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { tmpdir } from "node:os";

export function childEnv() {
  return Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(VITE_|SUPABASE_|OWNER_USER_ID$|OPENAI_API_KEY$)/i.test(k)));
}
export function codexCommand() {
  const dirs = [...(process.env.PATH || "").split(delimiter), join(process.env.APPDATA || "", "npm")];
  for (const dir of dirs) {
    // npm's .cmd shim cannot be spawned directly without a shell. Run its fixed JS entry with Node instead.
    if (process.platform === "win32" && existsSync(join(dir, "codex.cmd"))) {
      const entry = resolve(dir, "node_modules/@openai/codex/bin/codex.js");
      if (existsSync(entry)) return { command: process.execPath, args: [entry] };
    }
    const exe = join(dir, process.platform === "win32" ? "codex.exe" : "codex");
    if (existsSync(exe)) return { command: exe, args: [] };
  }
  throw new Error("Codex CLI was not found. Install it and sign in with ChatGPT, then restart the helper.");
}
export function runCodex(prompt: string, web = false, timeoutMs = 300_000): Promise<string> {
  if (Buffer.byteLength(prompt, "utf8") > 300 * 1024) return Promise.reject(new Error("The prompt exceeds 300 KB. Remove some context and retry."));
  const cli = codexCommand();
  const cwd = mkdtempSync(join(tmpdir(), "externals-ai-"));
  const output = join(cwd, "answer.txt");
  const started=Date.now();
  const codexResult = new Promise<string>((resolveResult, reject) => {
    const child = spawn(cli.command, [...cli.args, "exec", "-s", "read-only", "--ephemeral", "--skip-git-repo-check",
      "--ignore-user-config", "--ignore-rules", "-c", `web_search="${web ? "live" : "disabled"}"`, "-o", output, "-"],
      { cwd, env: childEnv(), shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["pipe", "ignore", "pipe"] });
    let diagnostic = "", timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      if (child.pid) {
        if (process.platform === "win32") {
          try { execFileSync(join(process.env.SystemRoot || "C:/Windows", "System32/taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { child.kill(); }
        } else { try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); } }
      }
    }, timeoutMs);
    child.stderr.on("data", chunk => { diagnostic = (diagnostic + chunk.toString()).slice(-32000); });
    child.stdin.on("error", () => {});
    child.stdin.end(prompt);
    child.on("error", () => { clearTimeout(timer); rmSync(cwd, { recursive: true, force: true }); reject(new Error("Couldn't launch Codex. Check the CLI installation and login.")); });
    child.on("close", code => {
      clearTimeout(timer);
      try {
        if (timedOut) throw new Error("AI took longer than five minutes. Please retry with a smaller request.");
        if (code !== 0) {
          if (/home directory|user profile|os_get_passwd/i.test(diagnostic)) throw new Error("Codex could not access the Windows user profile. Run the helper from your normal laptop login.");
          if (/quota|usage.limit|rate.limit|credits|limit.reached|429/i.test(diagnostic)) throw new Error("Your Codex usage quota is exhausted. Wait for it to reset, then retry.");
          if (/unauthorized|log.?in|sign.?in|auth|401/i.test(diagnostic)) throw new Error("Codex needs a login. Run codex login on the laptop using your ChatGPT account, then retry.");
          throw new Error("Codex couldn't complete this job. Check the CLI installation and connection, then retry.");
        }
        const result = readFileSync(output, "utf8").trim();
        if (!result) throw new Error("Codex returned an empty answer. Please retry.");
        resolveResult(result);
      } catch (e) { reject(e); }
      finally { rmSync(cwd, { recursive: true, force: true }); }
    });
  });
  return fallbackOnQuota(codexResult,web,async()=>{
    const fallbackCwd=mkdtempSync(join(tmpdir(),'externals-claude-'));
    try{
      const result=await claudeFallback({cwd:fallbackCwd,prompt,timeout:timeoutMs-(Date.now()-started),env:childEnv()});
      return result;
    }finally{rmSync(fallbackCwd,{recursive:true,force:true});}
  });
}

// Injectable boundary keeps quota routing testable without launching either CLI.
export function fallbackOnQuota(primary:Promise<string>,web:boolean,fallback:()=>Promise<string|null>):Promise<string>{
  return primary.catch(async error=>{
    if(web||!(error instanceof Error)||!error.message.includes('usage quota is exhausted'))throw error;
    const result=await fallback();
    if(result===null)throw error;
    return result;
  });
}
