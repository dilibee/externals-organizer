import {test,expect} from 'vitest';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {command} from './claude-process';

test('successful JSON stays separate from stderr diagnostics',async()=>{
 const child=Object.assign(new EventEmitter(),{stdin:new PassThrough(),stdout:new PassThrough(),stderr:new PassThrough()});
 const spawnFake=((_file:unknown,_args:unknown,options:any)=>{
 expect(options.windowsHide).toBe(true);expect(options.stdio).toEqual(['pipe','pipe','pipe']);
 queueMicrotask(()=>{child.stderr.write('rate limit diagnostic');child.stdout.write('{"result":"discuss rate limits"}');child.emit('close',0);});return child;
 }) as unknown as Parameters<typeof command>[3];
 expect(await command('fake',['-p'],{input:'fake'},spawnFake)).toEqual({code:0,text:'{"result":"discuss rate limits"}',truncated:false});
});
