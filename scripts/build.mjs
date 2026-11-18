import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
const entries={};
const add=async(route,file,type)=>entries[route]={type,base64:(await readFile(file)).toString('base64')};
await add('/','game/index.html','text/html; charset=utf-8');entries['/index.html']=entries['/'];
for(const file of await readdir('game/src'))if(/\.(js|css)$/.test(file))await add('/src/'+file,'game/src/'+file,file.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8');
for(const [route,file] of Object.entries(JSON.parse(await readFile('game/audio-map.json','utf8'))))await add(route,file,'audio/mp4');
for(const folder of ['contacts','moments','weixun']){
 for(const file of await readdir('game/assets/'+folder)){
  const type={png:'image/png',svg:'image/svg+xml',jpg:'image/jpeg'}[file.split('.').pop()];
  if(type)await add('/assets/'+folder+'/'+file,'game/assets/'+folder+'/'+file,type);
 }
}
await writeFile('worker/assets.generated.js','export default '+JSON.stringify(entries)+';\n');
await mkdir('dist/server',{recursive:true});
await build({entryPoints:['worker/server.js'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
console.log('Built public Worker; only whitelisted game routes and audio are served.');
