import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
if (process.platform !== "win32" || !process.env.APPDATA) throw new Error("Startup installation requires Windows.");
const startup = join(process.env.APPDATA, "Microsoft/Windows/Start Menu/Programs/Startup");
const target = join(startup, "Externals Organizer Helper.vbs");
if (process.argv.includes("--uninstall")) {
  if (existsSync(target)) unlinkSync(target);
  console.log("Laptop helper autostart removed. A running helper can be stopped separately.");
} else {
  const node = "C:\\Program Files\\nodejs\\node.exe";
  if (!existsSync(node)) throw new Error("Node was not found at C:\\Program Files\\nodejs\\node.exe");
  const quote = (s: string) => '"' + s + '"';
  const vbs = (s: string) => '"' + s.replaceAll('"', '""') + '"';
  mkdirSync(startup, { recursive: true });
  writeFileSync(target, `Set shell = CreateObject("WScript.Shell")\r\nshell.CurrentDirectory = ${vbs(root)}\r\nshell.Run ${vbs([quote(node), "--import", "tsx", quote(join(root, "scripts/worker.ts"))].join(" "))}, 0, False\r\n`);
  console.log("Laptop helper will launch hidden at your next login.");
}
