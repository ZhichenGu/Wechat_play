import http from 'node:http';
import {access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';

import worker from '../dist/server/index.js';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
const sessionKeyOnly=args.includes('--session-key-only');
if(!sessionKeyOnly){
 try{await access(resolve(root,'.dev.vars'));process.loadEnvFile(resolve(root,'.dev.vars'));}catch{}
 if(!process.env.NPC_API_KEY)throw new Error('NPC_API_KEY is required for the local AI preview.');
}

const sqlite=new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE usage_counters(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL DEFAULT 0,expires_at INTEGER NOT NULL)');
const DB={prepare(sql){return {bind(...args){return {
 async first(){return sqlite.prepare(sql).get(...args)||null;},
 async run(){return sqlite.prepare(sql).run(...args);}
};}};}};
const env={DB,SESSION_SECRET:'local-ai-preview-only',...(process.env.NPC_API_KEY?{NPC_API_KEY:process.env.NPC_API_KEY}:{}),GLOBAL_DAILY_LIMIT:'300',PLAYER_DAILY_LIMIT:'150'};
const port=Number(args.find(arg=>/^\d+$/.test(arg))??4184);
if(!Number.isInteger(port)||port<1024||port>65535)throw new RangeError('Please choose a local preview port between 1024 and 65535.');

http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks);
  const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body,duplex:'half'}:{})});
  const response=await worker.fetch(request,env,{waitUntil:promise=>promise.catch(()=>{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500);res.end('Preview unavailable');}
}).listen(port,'127.0.0.1',()=>console.log(`AI preview: http://127.0.0.1:${port}`));
