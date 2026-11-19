import http from 'node:http';
import worker from '../dist/server/index.js';
const port=Number(process.argv[2]??4183);
if(!Number.isInteger(port)||port<1024||port>65535)throw new RangeError('Please choose a local preview port between 1024 and 65535.');
http.createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:req.headers,...(body.length?{body,duplex:'half'}:{})});const response=await worker.fetch(request,{SESSION_SECRET:'local-preview-only',GLOBAL_DAILY_LIMIT:'300',PLAYER_DAILY_LIMIT:'150'},{waitUntil:p=>p.catch(()=>{})});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(500);res.end('Preview unavailable');}}).listen(port,'127.0.0.1',()=>console.log(`Hosted preview: http://127.0.0.1:${port}`));
