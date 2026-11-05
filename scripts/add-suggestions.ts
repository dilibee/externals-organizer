import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import type {Suggestion} from '../src/lib/types';
export type Gap={skill:string;count:number;change?:number};
const normalize=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export function suggestions(gaps:Gap[],existing:Record<string,Suggestion>,now=new Date()){
 const seen=new Set(Object.values(existing).map(s=>normalize(s.text))),rows:{id:string;data:Suggestion}[]=[];
 for(const gap of [...gaps].sort((a,b)=>b.count-a.count||a.skill.localeCompare(b.skill))){
  if(rows.length===5)break;
  if(typeof gap.skill!=='string'||!gap.skill.trim()||gap.skill.length>80||/@|https?:|[\r\n]/i.test(gap.skill)||!Number.isFinite(gap.count)||gap.count<=0)continue;
  const skill=normalize(gap.skill),text=`Study ${skill}: practise one small exercise and explain the solution.`,id='coop-gap-'+createHash('sha256').update(skill).digest('hex').slice(0,20);
  if(existing[id]||seen.has(normalize(text)))continue;
  seen.add(normalize(text));rows.push({id,data:{text,why:`Weekly co-op report: ${gap.count} saved postings mention this gap${gap.change===undefined?'':`; change ${gap.change>=0?'+':''}${gap.change}`}.`,min:20,status:'new',createdAt:now.toISOString()}});
 }
 return rows;
}
export async function addSuggestions(gaps:Gap[],load:()=>Promise<Record<string,Suggestion>>,insert:(rows:ReturnType<typeof suggestions>)=>Promise<void>){const rows=suggestions(gaps,await load());if(rows.length)await insert(rows);return rows.length;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{let input='';for await(const c of process.stdin)input+=c;const gaps=JSON.parse(input);if(!Array.isArray(gaps))throw Error();
 const {admin}=await import('./common');const {db,owner}=admin();
 const count=await addSuggestions(gaps,async()=>{const rows:Record<string,Suggestion>={};for(let from=0;;from+=1000){const {data,error}=await db.from('docs').select('id,data').match({user_id:owner,collection:'suggestions'}).order('id').range(from,from+999);if(error)throw error;for(const row of data)rows[row.id]=row.data;if(data.length<1000)break;}return rows;},async rows=>{const {error}=await db.from('docs').upsert(rows.map(r=>({user_id:owner,collection:'suggestions',...r})),{onConflict:'user_id,collection,id',ignoreDuplicates:true});if(error)throw error;});
 console.log(JSON.stringify({added:count}));}catch{console.error('Suggestions failed');process.exitCode=1;}
}
