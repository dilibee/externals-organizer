import {catchupCounts} from '../src/lib/brief-input';
import {admin} from './common';
const {db,owner}=admin();let pending=0,running=0,ready=0;
for(let from=0;;from+=1000){const {data,error}=await db.from('docs').select('data').match({user_id:owner,collection:'jobs'}).order('id').range(from,from+999);if(error)throw new Error('Externals brief inputs unavailable');const counts=catchupCounts(data.map(r=>r.data));pending+=counts.pending;running+=counts.running;ready+=counts.ready;if(data.length<1000)break;}
console.log(JSON.stringify({externals:`${ready} plan(s) ready to review and Apply in Catch-up; ${pending} queued; ${running} running`}));
