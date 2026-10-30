import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'builder-mini-'));
const state=join(scratch,'state');
const cli=resolve(root,'node_modules/wrangler/bin/wrangler.js');
const origin='http://127.0.0.1:18800';
let worker,output='';
const run=(...args)=>execFileSync(process.execPath,[cli,...args],{cwd:root,stdio:'pipe',env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
const checks=[];
async function request(path,session,method='GET'){
 const res=await fetch(origin+path,{method,headers:{Accept:'application/json',...(session?{'X-Mini-Session':session}:{})},redirect:'manual',signal:AbortSignal.timeout(30000)});
 const body=await res.json();return{status:res.status,body,requestId:res.headers.get('X-Request-Id')};
}
function check(name,value){assert.ok(value,name);checks.push({name,passed:true});}
try{
 run('d1','migrations','apply','demo-grants','--local','--persist-to',state);
 worker=spawn(process.execPath,[cli,'dev','--local','--ip','127.0.0.1','--port','18800','--persist-to',state],{cwd:root,stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 worker.stdout.on('data',b=>output+=b);worker.stderr.on('data',b=>output+=b);
 let ready=false;const deadline=Date.now()+45000;
 while(Date.now()<deadline){if(worker.exitCode!==null)throw Error(output);try{const r=await fetch(origin+'/api/mini/config');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}
 check('Worker ready',ready);
 const page=await fetch(origin+'/mini.html');check('Real mini page served',page.ok&&(await page.text()).includes('id="terminal-toggle"'));
 const a=await request('/api/mini/session',null,'POST');check('Create isolated paid/free session',a.status===201&&a.body.orders.length===2);
 const b=await request('/api/mini/session',null,'POST');check('Independent second session',b.status===201&&b.body.session!==a.body.session);
 const paid=a.body.orders.find(o=>o.price>0),free=a.body.orders.find(o=>o.price===0);assert.ok(paid&&free);
 const initial=await request('/api/mini/state/'+paid.token,a.body.session);check('Page and state read do not consume token',initial.status===200&&initial.body.used_at===null);
 const cross=await request('/api/mini/orders/'+paid.id+'/renew',b.body.session,'POST');check('Other session cannot renew order',cross.status===404||cross.status===403);
 const reuse=await request('/api/mini/orders/'+paid.id+'/renew',a.body.session,'POST');check('Unused link is reused',reuse.status===200&&reuse.body.token===paid.token&&reuse.body.reused===true);
 const key=randomUUID();const grant=await request('/api/download/'+paid.token+'?idem='+key,a.body.session);check('Paid grant succeeds with server trace',grant.status===200&&Array.isArray(grant.body._trace)&&grant.body._trace.length>0&&!!grant.requestId);
 const after=await request('/api/mini/state/'+paid.token,a.body.session);check('D1 stores original key',after.body.idempotency_key===key&&after.body.used_at!==null);
 const retry=await request('/api/download/'+paid.token+'?idem='+key,a.body.session);const retried=await request('/api/mini/state/'+paid.token,a.body.session);check('Retry preserves original D1 timestamp',retry.status===200&&retried.body.used_at===after.body.used_at);
 const other=await request('/api/download/'+paid.token+'?idem='+randomUUID(),a.body.session);check('Other UUID denied',other.status===403);
 async function file(grant){const url=new URL(grant.body.downloadUrl);assert.equal(url.origin,origin);const res=await fetch(url);const bytes=Buffer.from(await res.arrayBuffer());const sha256=createHash('sha256').update(bytes).digest('hex');check('Actual fixture bytes and SHA256 match',res.status===200&&sha256===a.body.expectedSha256);return{status:res.status,bytes:bytes.length,sha256};}
 const paidFile=await file(grant);
 const freeGrant=await request('/api/download/'+free.token+'?idem='+randomUUID(),a.body.session);check('Free order uses same actual grant flow',freeGrant.status===200);const freeFile=await file(freeGrant);
 const renewed=await request('/api/mini/orders/'+paid.id+'/renew',a.body.session,'POST');check('Consumed link can be renewed by owning session',renewed.status===200&&renewed.body.token!==paid.token&&renewed.body.reused===false);
 const keys=Array.from({length:100},()=>randomUUID());const responses=await Promise.all(keys.map(key=>request('/api/download/'+renewed.body.token+'?idem='+key,a.body.session)));const statuses=responses.map(r=>r.status);const winner=statuses.indexOf(200);const raced=await request('/api/mini/state/'+renewed.body.token,a.body.session);check('100 competing keys produce exactly one winner',statuses.filter(s=>s===200).length===1&&statuses.filter(s=>s===403).length===99&&raced.body.idempotency_key===keys[winner]);
 const finalB=await request('/api/mini/orders',b.body.session);check('Second session remains intact',finalB.status===200&&finalB.body.orders.every(o=>!a.body.orders.some(a=>a.id===o.id)));
 const summary={scenario:'Mini web real loopback HTTP buyer/download/renew and backend trace',checks,paidFile,freeFile,race:{total:100,granted:1,denied:99,winnerMatchesD1:true},requestTrace:{requestId:grant.requestId,stages:grant.body._trace},scope:'Synthetic sessions and files; no remote provider deployment or payment proof'};
 await mkdir(resolve(root,'evidence'),{recursive:true});await writeFile(resolve(root,'evidence/mini-smoke.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
}finally{
 if(worker&&worker.exitCode===null){const stopped=once(worker,'exit');worker.kill();await Promise.race([stopped,new Promise(r=>setTimeout(r,10000))]);if(worker.exitCode===null)worker.kill('SIGKILL');}
 await rm(scratch,{recursive:true,force:true,maxRetries:5,retryDelay:500});
}
