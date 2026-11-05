import {it,expect} from 'vitest';
import {catchupCounts} from './brief-input';
it('counts only nightly catch-up plans as ready in Catch-up',()=>{
 expect(catchupCounts([{kind:'plan',key:'nightly-catchup:2026-11-04',status:'done'},{kind:'plan',key:'goal:cpp',status:'done'},{kind:'plan',status:'done'},{kind:'plan',status:'pending'}])).toEqual({pending:1,running:0,ready:1});
});
