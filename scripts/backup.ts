// Unlike snapshot, export every collection, including chats/jobs and updated_at.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { admin } from './common';
const target=process.argv[2]; if(!target) throw new Error('Supply a local staging target');
const {db,owner}=admin();
const access=await db.auth.admin.listUsers({page:1,perPage:1});
if(access.error) throw new Error('Local credentials cannot prove complete owner access; backup aborted');
const rows:unknown[]=[];
for(let from=0;;from+=500){
  const {data,error}=await db.from('docs').select('*').eq('user_id',owner).order('collection').order('id').range(from,from+499);
  if(error || !data) throw new Error('Cannot read all owner docs; backup aborted');
  rows.push(...data);if(data.length<500)break;
}
await mkdir(target,{recursive:true});
await writeFile(resolve(target,'docs.json'),JSON.stringify(rows));
console.log('Externals export complete');
