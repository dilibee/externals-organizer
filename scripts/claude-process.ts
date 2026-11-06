import { spawn } from 'node:child_process';
export type Output = { code: number; text: string; truncated: boolean };
export async function command(file: string, args: string[], options: {cwd?: string; timeout?: number; input?: string; env?: NodeJS.ProcessEnv} = {}, spawnChild = spawn): Promise<Output> {
  return new Promise((resolve,reject) => {
    const child = spawnChild(file,args,{cwd:options.cwd,env:options.env ?? {...process.env,CI:'1',GIT_TERMINAL_PROMPT:'0'},windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
    let text = ''; let stderr = ''; let timedOut = false; let truncated = false;
    const capture = (b: Buffer) => {
      const chunk=b.toString();
      if(text.length+chunk.length>4_000_000)truncated=true;
      text=(text+chunk).slice(-4_000_000);
    };
    child.stdout.on('data',capture); child.stderr.on('data',(b:Buffer)=>{stderr=(stderr+b.toString()).slice(-64000);});
    child.stdin.on('error',()=>{}); child.stdin.end(options.input);
    const timer = setTimeout(() => {
      timedOut = true;
      const termination = new Promise<void>(done => {
        if (process.platform === 'win32') {
          const killer = spawnChild('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
          const killTimer=setTimeout(()=>{killer.kill();child.kill();done();},5000);
          const finish=(code?:number|null)=>{clearTimeout(killTimer);if(code!==0)child.kill();done();};
          killer.once('exit',finish);
          killer.once('error',()=>finish(1));
        } else {
          const killTimer=setTimeout(done,5000);
          child.once('exit',()=>{clearTimeout(killTimer);done();});
          try { process.kill(-child.pid!, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
        }
      });
      // Descendants can retain inherited pipes after the direct child exits.
      // Never wait for close to enforce the caller's deadline.
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.unref();
      void termination.then(()=>resolve({code:124,text:text||stderr,truncated}));
    }, options.timeout ?? 120_000);
    child.on('error',e=>{if(timedOut)return;clearTimeout(timer);reject(e)});
    child.on('close',code=>{if(timedOut)return;clearTimeout(timer);resolve({code:timedOut ? 124 : code ?? 1,text:code===0?text:text||stderr,truncated})});
  });
}
export const ps = (script: string, timeout = 30_000) => command('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{timeout});
