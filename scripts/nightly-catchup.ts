import { nightlyCatchup } from '../src/lib/nightly-catchup';
import { pathToFileURL } from 'node:url';

export async function queueCatchup(load:()=>Promise<import('../src/lib/types').Store>, insert:(id:string,job:import('../src/lib/types').Job)=>Promise<void>, today:string) {
  const job=nightlyCatchup(await load(),today);if(!job)return false;
  await insert(`nightly-catchup-${today}`,job);return true;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  // Runtime only. Tests import the pure logic without loading credentials or live data.
  const {admin,loadStore}=await import('./common');
  const {db,owner}=admin();
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date());
  const queued=await queueCatchup(loadStore,async(id,job)=>{
    const {error}=await db.from('docs').upsert({user_id:owner,collection:'jobs',id,data:job},{onConflict:'user_id,collection,id',ignoreDuplicates:true});
    if(error)throw new Error('Could not queue catch-up proposal');
  },today);
  console.log(JSON.stringify({status:queued?'ok':'no_work',count:queued?1:0,message:queued?'Catch-up proposal queued; review required':'No new catch-up plan needed'}));
}
