import {it,expect,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {suggestions,addSuggestions} from './add-suggestions';
import {Today} from '../src/views/Today';
import {COLLECTIONS} from '../src/lib/types';
const fixture=vi.hoisted(()=>({store:{} as any}));
vi.mock('../src/lib/db',()=>({useDB:()=>fixture,getStore:()=>fixture.store}));
it('caps suggestions at five, normalizes dedupe and preserves accepted/dismissed decisions',async()=>{
 const gaps=Array.from({length:8},(_,i)=>({skill:'Skill '+i,count:9-i}));gaps.push({skill:' SKILL 0 ',count:2},{skill:'private@example.org',count:50});
 const rows=suggestions(gaps,{});expect(rows).toHaveLength(5);expect(rows.every(r=>r.data.status==='new')).toBe(true);const old=Object.fromEntries(rows.map((r,i)=>[r.id,{...r.data,status:i%2?'dismissed':'accepted'}]));expect(suggestions(gaps.slice(0,5),old as any)).toEqual([]);
 let inserts=0;await addSuggestions(gaps,async()=>({}),async r=>{inserts=r.length});expect(inserts).toBe(5);
});
it('a directly written suggestion displays in Today with accept and dismiss controls',()=>{
 const rows=suggestions([{skill:'C++',count:4}],{});fixture.store={...Object.fromEntries(COLLECTIONS.map(c=>[c,{}])),suggestions:{[rows[0].id]:rows[0].data}};
 const html=renderToStaticMarkup(createElement(Today,{go:()=>{}}));expect(html).toContain('Study c++');expect(html).toContain('Add to today');expect(html).toContain('Dismiss');
});
