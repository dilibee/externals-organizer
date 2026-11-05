export function catchupCounts(jobs:{kind?:string;key?:string;status?:string}[]){
 let pending=0,running=0,ready=0;
 for(const j of jobs)if(j.kind==='plan'){
  if(j.status==='pending')pending++;if(j.status==='running')running++;
  if(j.status==='done'&&j.key?.startsWith('nightly-catchup:'))ready++;
 }
 return {pending,running,ready};
}
