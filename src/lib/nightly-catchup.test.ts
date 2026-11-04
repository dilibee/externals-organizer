import {it,expect} from 'vitest';
import {nightlyCatchup} from './nightly-catchup';
import {COLLECTIONS,type Store} from './types';
import {queueCatchup} from '../../scripts/nightly-catchup';
function fixture(){
 const s=Object.fromEntries(COLLECTIONS.map(c=>[c,{}])) as Store;
 s.tracks.a={name:'Fake track',rank:1};s.days.old={trackId:'a',date:'2026-11-01',dayNum:1,title:'Fake lesson',kind:'lesson',tasks:[{id:'t',text:'Fake task',min:20}]};return s;
}
it('queues exactly one pending plan only for missed tasks, through fake persistence',async()=>{
 const s=fixture(),writes:unknown[]=[];
 expect(await queueCatchup(async()=>s,async(id,job)=>{writes.push({id,job});s.jobs[id]=job;},'2026-11-04')).toBe(true);
 expect(writes).toHaveLength(1);const job=Object.values(s.jobs)[0];expect(job.kind).toBe('plan');expect(job.status).toBe('pending');expect(job.prompt).toContain('Fake track');expect(job.prompt).toContain('Unfinished past days');
 expect(nightlyCatchup(s,'2026-11-05')).toBeUndefined();job.status='running';expect(nightlyCatchup(s,'2026-11-05')).toBeUndefined();job.status='done';expect(nightlyCatchup(s,'2026-11-05')).toBeUndefined();
 s.jobs={};s.progress.old={dayId:'old',trackId:'a',done:{t:'2026-11-02'}};expect(nightlyCatchup(s,'2026-11-04')).toBeUndefined();
});
it('propagates queue failures and does not apply a plan',async()=>{
 await expect(queueCatchup(async()=>fixture(),async()=>{throw new Error('fake offline')},'2026-11-04')).rejects.toThrow('fake offline');
});
