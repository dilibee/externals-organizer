import { tmpdir } from 'node:os';
import { mkdir, mkdtemp, rm, open, readFile, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { delimiter, resolve, join } from 'node:path';
import { command } from './claude-process';

export function localDay(now=new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
}
// Exclusive lock serializes reservations across all three independent repositories.
// A stale lock or corrupt counter fails closed; never reset an uncertain budget.
export async function reserve(workspace:string, env:NodeJS.ProcessEnv=process.env, date=localDay()) {
  const max=Number(env.CLAUDE_FALLBACK_DAILY_MAX??10);
  if(!Number.isSafeInteger(max)||max<=0)return false;
  const file=join(workspace,'overnight/data/status',`claude-fallback-${date}.json`);
  await mkdir(resolve(file,'..'),{recursive:true});
  let lock;
  try{lock=await open(file+'.lock','wx');}catch{return false;}
  try{
    let count=0;
    try{count=JSON.parse(await readFile(file,'utf8')).count;}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')return false;}
    if(!Number.isSafeInteger(count)||count<0||count>=max)return false;
    await writeCounter();return true;
    async function writeCounter(){
      const tmp=file+`.${process.pid}.tmp`;
      const f=await open(tmp,'wx');
      try{await f.writeFile(JSON.stringify({count:count+1}));await f.sync();}finally{await f.close();}
      await rename(tmp,file);
    }
  }finally{await lock.close();await unlink(file+'.lock');}
}
export const limited=(text:string)=>/usage[ -]?limit|quota.{0,30}(exceed|exhaust|reached)|hit.{0,20}(limit|cap)|too many requests|rate[ -]?limit|try again (at|in)|insufficient_quota|credits? exhausted|reached.{0,20}(limit|quota)|limit.{0,20}(reached|exceeded|reset)/i.test(text);
export async function claudeFallback(options:{workspace?:string;cwd:string;prompt:string;schema?:unknown;tools?:string[];timeout:number;env?:NodeJS.ProcessEnv},run=command):Promise<string|null>{
  const workspace=options.workspace??resolve(import.meta.dirname,'../..');
  if(options.timeout<=0||!await reserve(workspace))return null;
  console.log('Claude fallback call reserved (shared daily budget)');
  const env=Object.fromEntries(Object.entries(options.env??process.env).filter(([k])=>!/^(ANTHROPIC_API_KEY$|ANTHROPIC_AUTH_TOKEN$|VITE_|SUPABASE_|OWNER_USER_ID$|ATRACKER_|OPENAI_API_KEY$)/i.test(k)));
  const args=['-p','--model','sonnet','--output-format','json','--safe-mode','--restricted','--setting-sources','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-session-persistence'];
  if(options.schema){
    const schema=JSON.parse(JSON.stringify(options.schema), (key,value)=>key==='$schema'?undefined:value);
    args.push('--json-schema',JSON.stringify(schema));
  }
  const tools=options.tools??[];
  args.push('--tools',tools.join(','));
  if(tools.length)args.push('--allowedTools',tools.join(','),'--add-dir',resolve(options.cwd));
  args.push('--permission-mode','dontAsk');
  // Prefer the native CLI; npm's fixed JS entry also avoids cmd.exe. Prompts stay on stdin.
  const native=process.platform==='win32'?[...(process.env.PATH??process.env.Path??'').split(delimiter).map(dir=>join(dir,'claude.exe')),resolve(process.env.USERPROFILE??'','.local/bin/claude.exe')].find(file=>existsSync(file)):undefined;
  const file=native??(process.platform==='win32'?process.execPath:'claude');
  const prefix=process.platform==='win32'&&!native?[resolve(process.env.APPDATA??'','npm/node_modules/@anthropic-ai/claude-code/cli.js')]:[];
  const work=await mkdtemp(join(tmpdir(),'claude-isolated-'));
  let result;
  try{result=await run(file,[...prefix,...args],{cwd:work,input:options.prompt,env,timeout:options.timeout});}
  finally{await rm(work,{recursive:true,force:true});}
  if(result.code||result.truncated)throw new Error('Claude fallback failed');
  let response;
  try{response=JSON.parse(result.text);}catch{throw new Error('Claude fallback invalid JSON');}
  if(response.is_error||response.error||response.errors?.length||response.subtype&&response.subtype!=='success')throw new Error('Claude fallback failed or usage limited');
  const value=options.schema?response.structured_output:response.result;
  if(options.schema ? !value||typeof value!=='object' : typeof value!=='string'||!value.trim())throw new Error('Claude fallback empty output');
  return options.schema?JSON.stringify(value):value;
}
