import {test} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {reserve,claudeFallback} from './claude-fallback';
test('shared reservations serialize and Claude receives safe invocation',async()=>{
 const workspace=await mkdtemp(join(tmpdir(),'fallback-fake-'));
 try{
 assert.equal((await Promise.all(Array.from({length:12},()=>reserve(workspace,{CLAUDE_FALLBACK_DAILY_MAX:'1'})))).filter(Boolean).length,1);
 assert.equal(await reserve(workspace,{CLAUDE_FALLBACK_DAILY_MAX:'1'}),false);
 const options={workspace,cwd:workspace,prompt:'fake',schema:{$schema:'test',type:'object'},timeout:1000,env:{ANTHROPIC_API_KEY:'fake',ANTHROPIC_AUTH_TOKEN:'fake'}};
 assert.equal(await claudeFallback(options,async(_f,args,o)=>{
 assert.equal(o!.input,'fake');assert.equal(o!.env!.ANTHROPIC_API_KEY,undefined);assert.equal(o!.env!.ANTHROPIC_AUTH_TOKEN,undefined);
 assert.deepEqual(args.slice(args.indexOf('-p')),['-p','--model','sonnet','--output-format','json','--safe-mode','--restricted','--setting-sources','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--disable-slash-commands','--no-session-persistence','--json-schema','{"type":"object"}','--tools','','--permission-mode','dontAsk']);
 assert.notEqual(o!.cwd,workspace);assert.equal(args[args.indexOf('--json-schema')+1],'{"type":"object"}');
 return {code:0,text:'{"structured_output":{"ok":true}}',truncated:false};}),'{"ok":true}');
 for(const text of ['{"is_error":true}','{"subtype":"error_during_execution","errors":["rate limit"]}','{}','invalid'])await assert.rejects(claudeFallback(options,async()=>({code:0,text,truncated:false})));
 assert.equal(await claudeFallback({...options,schema:undefined},async()=>({code:0,text:JSON.stringify({subtype:'success',result:'This answer discusses rate limits and quota exceeded errors.'}),truncated:false})),'This answer discusses rate limits and quota exceeded errors.');
 assert.equal(await claudeFallback({...options,schema:undefined,tools:['Read']},async(_f,args)=>{
 assert.deepEqual(args.slice(args.indexOf('--tools')),['--tools','Read','--allowedTools','Read','--add-dir',workspace,'--permission-mode','dontAsk']);
 return {code:0,text:'{"result":"read complete"}',truncated:false};
 }),'read complete');
 await assert.rejects(claudeFallback(options,async()=>({code:124,text:'',truncated:false})));
 }finally{await rm(workspace,{recursive:true,force:true});}
});
