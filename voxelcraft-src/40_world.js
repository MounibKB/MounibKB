/* =====================================================================
   WORLD: chunk manager, worker pool, authoritative voxel API, block entities,
   tick scheduler (scheduled / random ticks), neighbour-update queue.
   Unloaded space is UNKNOWN (-1) everywhere:
     physics -> solid wall, raycast -> stops without hit, fluids -> no flow,
     AI -> impassable, spawning/random ticks -> skipped, entities there -> frozen.
   ===================================================================== */
const world={
  id:null,name:'',seed:0,dim:0,gameTime:0,dayTime:1000,rev:1,
  edits:new Map(),        // chunkKey -> Map(idx -> voxel)   (current dimension)
  meta:new Map(),         // chunkKey -> {rev, savedRev, ents:[], ticks:[], pop:bool, loadedEntities:bool}
  bases:new Map(),        // chunkKey -> generated baseline (for edit compaction)
  baseReq:new Set(),
  be:new Map(),           // posKey -> block entity (current dimension)
  entities:[],            // live entities (current dimension)
  rules:{keepInventory:false,doDaylightCycle:true,doMobSpawning:true,doFireTick:true,mobGriefing:true,randomTickSpeed:3,doWeatherCycle:true,naturalRegeneration:true},
  weather:{rain:false,thunder:false,rainTime:12000,thunderTime:30000,rainLevel:0,thunderLevel:0},
  spawn:[0.5,80,0.5],portals:{0:[],1:[],2:[]},dragon:{killed:false,spawned:false},
  difficulty:2,hardcore:false,created:Date.now(),playTicks:0,
  metaDirty:true,
};
const chunks=new Map();
class ChunkRec{constructor(cx,cz){this.cx=cx;this.cz=cz;this.key=ckey(cx,cz);this.data=null;this.light=null;this.biomes=null;this.hmap=null;
  this.dataPending=false;this.opq=null;this.trn=null;this.lod=-1;this.wantLod=0;this.reqVer=0;this.gotVer=0;this.inflight=0;this.hasMesh=false;
  this.minY=0;this.maxY=0;this.dist=0;this.hiQueued=false;this.retry=0;}}
function metaOf(key){let m=world.meta.get(key);if(!m){m={rev:0,savedRev:0,ents:[],ticks:[],pop:false};world.meta.set(key,m);}return m;}
function touchChunk(key){const m=metaOf(key);m.rev=++world.rev;}
/* ---------------- worker pool ---------------- */
const WSRC=`'use strict';const S={};(${SHARED.toString()})(S);(${WORKER.toString()})(S);`;
const workerURL=URL.createObjectURL(new Blob([WSRC],{type:'text/javascript'}));
const NW=Math.max(1,Math.min(3,(navigator.hardwareConcurrency||4)-1));
const workers=[];let epoch=0;
let pendingSets=[];
function editsList(){const l=[];for(const [k,m] of world.edits)if(m.size)l.push([k,S.encodeEdits(m)]);return l;}
function spawnWorker(i){
  const w=new Worker(workerURL);
  const rec={w,inflight:0,keys:new Map(),alive:true,restarts:(workers[i]&&workers[i].restarts)||0};
  w.onmessage=e=>{try{onWorkerMsg(e.data,i);}catch(err){reportError('worker message',err);}};
  w.onerror=e=>{e.preventDefault&&e.preventDefault();reportError('worker '+i,e.message||e);restartWorker(i);};
  w.postMessage({t:'init',seed:world.seed,dim:world.dim,epoch,edits:editsList()});
  workers[i]=rec;return rec;
}
function startWorkers(){
  epoch++;for(const r of workers)if(r)r.w.terminate();workers.length=0;
  for(let i=0;i<NW;i++)spawnWorker(i);
}
function restartWorker(i){ // a crashed worker must never freeze the world: recreate it and re-queue its jobs
  const old=workers[i];if(!old)return;old.alive=false;try{old.w.terminate();}catch(e){}
  const lost=[...old.keys.keys()];const rec=spawnWorker(i);rec.restarts=old.restarts+1;
  for(const k of lost){const c=chunks.get(k);if(c){c.inflight=0;c.dataPending=false;if(!c.hiQueued){c.hiQueued=true;hiQueue.push(c);}}}
  if(rec.restarts>5)toast('Chunk worker keeps crashing — see console');
}
const workerFor=(cx,cz)=>((((Math.floor(cx/4)*7+Math.floor(cz/4)*13)%NW)+NW)%NW);
function flushSets(){
  if(!pendingSets.length)return;
  const list=new Int32Array(pendingSets);pendingSets=[];
  for(const r of workers)r.w.postMessage({t:'sets',list});
}
let loadQueue=[],hiQueue=[],lastCenter='';
function onWorkerMsg(m,wi){
  if(m.epoch!==epoch)return; // stale (older world/dimension)
  const rec=workers[wi];
  if(m.t==='mesh'||(m.t==='error'&&m.req==='mesh')){
    rec.inflight=Math.max(0,rec.inflight-1);
    const key=ckey(m.cx,m.cz);const n=(rec.keys.get(key)||1)-1;if(n>0)rec.keys.set(key,n);else rec.keys.delete(key);
    const c=chunks.get(key);
    if(m.t==='error'){reportError('mesh '+m.cx+','+m.cz,m.msg);if(c){c.inflight=Math.max(0,c.inflight-1);c.retry++;c.dataPending=false;}return;}
    if(!c)return;
    c.inflight=Math.max(0,c.inflight-1);
    if(m.data){if(!c.data){c.data=m.data;c.biomes=m.biomes;computeHeightmap(c);onChunkData(c);}c.dataPending=false;}
    if(m.ver<c.gotVer)return;
    c.gotVer=m.ver;
    if(m.light)c.light=m.light;else if(m.lod===0)c.light=null;
    if(m.o.length){if(!c.opq)c.opq=allocMesh();uploadMesh(c.opq,m.o);}else if(c.opq){freeMesh(c.opq);c.opq=null;}
    if(m.tr.length){if(!c.trn)c.trn=allocMesh();uploadMesh(c.trn,m.tr);}else if(c.trn){freeMesh(c.trn);c.trn=null;}
    c.lod=m.lod;c.hasMesh=true;c.minY=m.minY;c.maxY=m.maxY+1;stats.meshes++;
  } else if(m.t==='baseline'){
    const key=ckey(m.cx,m.cz);world.baseReq.delete(key);world.bases.set(key,m.data);compactEdits(key);
  } else if(m.t==='spawn'){onSpawnFound(m.x,m.z);}
  else if(m.t==='error'){reportError('worker '+m.req,m.msg);}
}
function sendMesh(c){
  const wi=workerFor(c.cx,c.cz),rec=workers[wi];
  c.reqVer++;c.inflight++;rec.inflight++;rec.keys.set(c.key,(rec.keys.get(c.key)||0)+1);
  const needData=!c.data&&!c.dataPending;if(needData)c.dataPending=true;
  rec.w.postMessage({t:'mesh',cx:c.cx,cz:c.cz,lod:c.wantLod,ver:c.reqVer,needData});
}
const MAXQ=3;
function dispatch(){
  flushSets(); // edits must reach workers before the remesh requests that depend on them
  for(let i=0;i<hiQueue.length;){
    const c=hiQueue[i];
    if(!chunks.has(c.key)){hiQueue.splice(i,1);continue;}
    const rec=workers[workerFor(c.cx,c.cz)];
    if(rec.inflight<MAXQ+3){hiQueue.splice(i,1);c.hiQueued=false;sendMesh(c);}else i++;
  }
  for(let i=0;i<loadQueue.length;){
    const c=loadQueue[i];
    if(!chunks.has(c.key)||c.inflight||(c.hasMesh&&c.lod===c.wantLod)){loadQueue.splice(i,1);continue;}
    const rec=workers[workerFor(c.cx,c.cz)];
    if(rec.inflight<MAXQ){loadQueue.splice(i,1);sendMesh(c);}else i++;
  }
}
let chunkTimer=0;
function lodDist(){return Math.max(3,Math.round(settings.renderDist*0.6));}
function updateChunks(dt,force,cx0,cz0){
  chunkTimer-=dt;
  const pcx=cx0,pcz=cz0,R=settings.renderDist;
  const cen=pcx+','+pcz+','+R;
  if(cen!==lastCenter||force||chunkTimer<=0){
    chunkTimer=0.5;
    if(cen!==lastCenter){lastCenter=cen;for(const r of workers)r.w.postMessage({t:'center',cx:pcx,cz:pcz,r:R+2});}
    const R2=(R+0.5)*(R+0.5),LD=lodDist();
    for(let dz=-R;dz<=R;dz++)for(let dx=-R;dx<=R;dx++){
      const d2=dx*dx+dz*dz;if(d2>R2)continue;
      const k=ckey(pcx+dx,pcz+dz);let c=chunks.get(k);
      if(!c){c=new ChunkRec(pcx+dx,pcz+dz);chunks.set(k,c);}
      c.dist=Math.sqrt(d2);
      c.wantLod=c.dist>LD+0.5?1:(c.dist<LD-0.5?0:(c.lod<0?(c.dist>LD?1:0):c.lod));
      if(c.dist<=2.5)c.wantLod=0; // chunks near the player always need full data+light
    }
    const U=(R+1.5)*(R+1.5);
    for(const c of [...chunks.values()]){const dx=c.cx-pcx,dz=c.cz-pcz;if(dx*dx+dz*dz>U)unloadChunk(c);}
    const f=forwardVec();const fx=f[0],fz=f[2];
    loadQueue=[];
    for(const c of chunks.values()){
      if(c.inflight||(c.hasMesh&&c.lod===c.wantLod))continue;
      if(c.retry>3&&Math.random()<0.8)continue;
      const dx=c.cx-pcx,dz=c.cz-pcz,l=Math.hypot(dx,dz)||1;
      c.prio=c.dist-(dx*fx+dz*fz)/l*1.5*(c.dist>1.5?1:0)+(c.hasMesh?4:0);
      loadQueue.push(c);
    }
    loadQueue.sort((a,b)=>a.prio-b.prio);
  }
  dispatch();
}
function markDirty(cx,cz,front){
  const c=chunks.get(ckey(cx,cz));if(!c||(!c.hasMesh&&!c.inflight))return;
  if(c.hiQueued){if(front){const i=hiQueue.indexOf(c);if(i>0){hiQueue.splice(i,1);hiQueue.unshift(c);}}return;}
  c.hiQueued=true;if(front)hiQueue.unshift(c);else hiQueue.push(c);
}
function unloadChunk(c){
  // persist entities living in this chunk before it disappears
  stashChunkEntities(c);
  freeMesh(c.opq);freeMesh(c.trn);c.opq=c.trn=null;c.data=null;c.light=null;chunks.delete(c.key);
  if(!world.edits.has(c.key))world.bases.delete(c.key);
}
function computeHeightmap(c){
  const hm=c.hmap||(c.hmap=new Int16Array(256)),d=c.data;
  for(let i=0;i<256;i++){let y=255;const b=i*256;while(y>0){const v=d[b+y];if(v&&(FLAGS[v]&(F_SOLID|F_LIQUID)))break;y--;}hm[i]=y;}
}
/* ---------------- voxel API ---------------- */
function chunkAt(x,z){return chunks.get(ckey(Math.floor(x/16),Math.floor(z/16)));}
function getV(x,y,z){
  if(y<0)return B.BEDROCK;if(y>255)return 0;
  const cx=Math.floor(x/16),cz=Math.floor(z/16),c=chunks.get(ckey(cx,cz));
  if(!c||!c.data)return UNKNOWN;
  return c.data[(((x-cx*16)<<4)|(z-cz*16))<<8|y];
}
const getId=(x,y,z)=>{const v=getV(x,y,z);return v<0?-1:v&255;};
function getLight(x,y,z){ // returns sky<<4|block, or -1 if unknown
  if(y>255)return DIMS[world.dim].sky?0xf0:0;if(y<0)return 0;
  const cx=Math.floor(x/16),cz=Math.floor(z/16),c=chunks.get(ckey(cx,cz));if(!c||!c.data)return -1;
  if(!c.light){const hm=c.hmap[((x-cx*16)<<4)|(z-cz*16)];return (DIMS[world.dim].sky&&y>hm)?0xf0:0x60;}
  return c.light[(((x-cx*16)<<4)|(z-cz*16))<<8|y];
}
function brightnessAt(x,y,z,daylight){ // 0..1 for entity/particle shading
  const l=getLight(Math.floor(x),Math.floor(y),Math.floor(z));if(l<0)return daylight;
  const s=(l>>4)*daylight,b=l&15,lv=Math.max(s,b);const amb=DIMS[world.dim].ambient||0;return amb+(1-amb)*Math.pow(0.8,15-lv);
}
function heightAt(x,z){const c=chunkAt(x,z);if(!c||!c.hmap)return -1;return c.hmap[((x-c.cx*16)<<4)|(z-c.cz*16)];}
function biomeAt(x,z){const c=chunkAt(x,z);if(!c||!c.biomes)return world.dim===1?32:(world.dim===2?40:3);return c.biomes[((x-c.cx*16)<<4)|(z-c.cz*16)];}
const SET_NOTIFY=1,SET_NO_CALLBACKS=2,SET_NO_OBSERVER=4;
function setV(x,y,z,v,flags=SET_NOTIFY){
  if(y<0||y>255)return false;
  const cx=Math.floor(x/16),cz=Math.floor(z/16),c=chunks.get(ckey(cx,cz));
  if(!c||!c.data)return false;
  const lx=x-cx*16,lz=z-cz*16,idx=(lx<<4|lz)<<8|y,old=c.data[idx];
  if(old===v)return false;
  if(v&&!DEF[v&255])return false;
  c.data[idx]=v;
  recordEdit(c.key,idx,v);
  pendingSets.push(x,y,z,v);
  // heightmap
  const hi=(lx<<4)|lz,hm=c.hmap;
  if(hm){if(v&&(FLAGS[v]&(F_SOLID|F_LIQUID))){if(y>hm[hi])hm[hi]=y;}else if(y===hm[hi]){let yy=y-1;const b=hi*256;while(yy>0){const w=c.data[b+yy];if(w&&(FLAGS[w]&(F_SOLID|F_LIQUID)))break;yy--;}hm[hi]=yy;}}
  // approximate light for immediate physics/spawn decisions until the remesh returns real light
  if(c.light){const e=LIGHT[v];if(e)c.light[idx]=(c.light[idx]&0xf0)|Math.max(c.light[idx]&15,e);}
  markDirty(cx,cz,true);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dz)continue;
    const ddx=dx<0?lx+1:(dx>0?16-lx:0),ddz=dz<0?lz+1:(dz>0?16-lz:0);
    if(ddx+ddz<=15)markDirty(cx+dx,cz+dz,false);
  }
  const oid=old&255,nid=v&255;
  if(!(flags&SET_NO_CALLBACKS)){
    if(oid!==nid){const bo=BEH[oid];if(bo&&bo.onRemove)safeCall(bo.onRemove,x,y,z,old,v);removeBE(x,y,z,oid);}
    const bn=BEH[nid];if(bn&&bn.onPlace)safeCall(bn.onPlace,x,y,z,v,old);
  }
  if(flags&SET_NOTIFY){for(let f=0;f<6;f++){const d=FDIR[f];queueUpdate(x+d[0],y+d[1],z+d[2],x,y,z);}}
  if(!(flags&SET_NO_OBSERVER))observerCheck(x,y,z);
  return true;
}
function safeCall(fn,...a){try{return fn(...a);}catch(e){reportError('block behaviour',e);}}
function recordEdit(key,idx,v){
  let e=world.edits.get(key);if(!e){e=new Map();world.edits.set(key,e);}
  const base=world.bases.get(key);
  if(base&&base[idx]===v)e.delete(idx);else e.set(idx,v);
  if(!base&&!world.baseReq.has(key)&&workers.length){world.baseReq.add(key);workers[0].w.postMessage({t:'baseline',cx:keyCXm(key),cz:keyCZm(key)});}
  touchChunk(key);
}
const keyCXm=k=>Math.floor(k/65536)-32768,keyCZm=k=>(k%65536)-32768;
function compactEdits(key){ // drop edits that equal the generated terrain again
  const e=world.edits.get(key),base=world.bases.get(key);if(!e||!base)return;let n=0;
  for(const [idx,v] of e)if(base[idx]===v){e.delete(idx);n++;}
  if(n)touchChunk(key);if(!e.size)world.edits.delete(key);
}
/* ---------------- neighbour updates & ticks ---------------- */
const updQ=[];let updHead=0;
function queueUpdate(x,y,z,fx,fy,fz){updQ.push(x,y,z,fx,fy,fz);}
function processUpdates(budget=6000){
  let n=0;
  while(updHead<updQ.length&&n<budget){
    const x=updQ[updHead],y=updQ[updHead+1],z=updQ[updHead+2],fx=updQ[updHead+3],fy=updQ[updHead+4],fz=updQ[updHead+5];updHead+=6;n++;
    const v=getV(x,y,z);if(v<=0)continue;const b=BEH[v&255];
    if(b&&b.onNeighbor)safeCall(b.onNeighbor,x,y,z,v,fx,fy,fz);
  }
  if(updHead>=updQ.length){updQ.length=0;updHead=0;}
  else if(updHead>60000){updQ.splice(0,updHead);updHead=0;}
}
// scheduled ticks: binary heap ordered by (tick, seq)
const tickHeap=[],tickKeys=new Map();let tickSeq=0;
function scheduleTick(x,y,z,delay,id){
  const k=posKey(x,y,z),t=world.gameTime+Math.max(1,delay|0);
  const cur=tickKeys.get(k);if(cur!==undefined&&cur<=t)return;
  tickKeys.set(k,t);heapPush({t,s:tickSeq++,x,y,z,id:id===undefined?getId(x,y,z):id});
}
function heapPush(e){const h=tickHeap;h.push(e);let i=h.length-1;while(i>0){const p=(i-1)>>1;if(cmpT(h[i],h[p])<0){[h[i],h[p]]=[h[p],h[i]];i=p;}else break;}}
function heapPop(){const h=tickHeap;const top=h[0],last=h.pop();if(h.length){h[0]=last;let i=0;for(;;){const l=i*2+1,r=l+1;let m=i;
  if(l<h.length&&cmpT(h[l],h[m])<0)m=l;if(r<h.length&&cmpT(h[r],h[m])<0)m=r;if(m===i)break;[h[i],h[m]]=[h[m],h[i]];i=m;}}return top;}
const cmpT=(a,b)=>a.t-b.t||a.s-b.s;
function runScheduledTicks(budget=4000){
  let n=0;
  while(tickHeap.length&&tickHeap[0].t<=world.gameTime&&n<budget){
    const e=heapPop();const k=posKey(e.x,e.y,e.z);if(tickKeys.get(k)===e.t)tickKeys.delete(k);else continue;
    const v=getV(e.x,e.y,e.z);
    if(v<0){metaOf(ckey(Math.floor(e.x/16),Math.floor(e.z/16))).ticks.push([e.x,e.y,e.z,1,e.id]);continue;} // chunk unloaded: park it
    if((v&255)!==e.id)continue;
    const b=BEH[e.id];if(b&&b.onTick){safeCall(b.onTick,e.x,e.y,e.z,v);n++;}
  }
}
function randomTicks(pcx,pcz){
  const R=settings.simDist,speed=world.rules.randomTickSpeed|0;if(speed<=0)return;
  for(let dz=-R;dz<=R;dz++)for(let dx=-R;dx<=R;dx++){
    const c=chunks.get(ckey(pcx+dx,pcz+dz));if(!c||!c.data)continue;
    let top=0;for(let i=0;i<256;i+=17)if(c.hmap[i]>top)top=c.hmap[i];top=Math.min(255,top+16);
    const sections=(top>>4)+1;
    for(let s=0;s<sections;s++)for(let k=0;k<speed;k++){
      const r=(Math.random()*4096)|0,lx=r&15,lz=(r>>4)&15,y=(s<<4)|(r>>8);
      const v=c.data[(lx<<4|lz)<<8|y];if(!v||!(FLAGS[v]&F_RTICK))continue;
      const b=BEH[v&255];if(b&&b.randomTick)safeCall(b.randomTick,c.cx*16+lx,y,c.cz*16+lz,v);
    }
  }
}
/* ---------------- block entities ---------------- */
function getBE(x,y,z){return world.be.get(posKey(x,y,z));}
function makeBE(x,y,z,type){
  let be=getBE(x,y,z);if(be&&be.type===type)return be;
  be={type,x,y,z,items:[]};
  if(type==='chest')be.items=new Array(27).fill(null);
  if(type==='furnace'){be.items=[null,null,null];be.burn=0;be.burnMax=0;be.cook=0;be.xp=0;}
  if(type==='spawner'){be.delay=200;}
  world.be.set(posKey(x,y,z),be);touchChunk(ckey(Math.floor(x/16),Math.floor(z/16)));return be;
}
function removeBE(x,y,z,oldId){
  const k=posKey(x,y,z),be=world.be.get(k);if(!be)return;
  // contents are never destroyed: drop them into the world
  for(const st of be.items)if(st)dropItemAt(x+0.5,y+0.5,z+0.5,st,true);
  world.be.delete(k);touchChunk(ckey(Math.floor(x/16),Math.floor(z/16)));
  if(typeof closeScreenFor==='function')closeScreenFor(be);
}
function beDirty(be){touchChunk(ckey(Math.floor(be.x/16),Math.floor(be.z/16)));}
/* ---------------- observers (block-change detectors) ---------------- */
function observerCheck(x,y,z){
  for(let f=0;f<6;f++){const d=FDIR[f],ox=x+d[0],oy=y+d[1],oz=z+d[2];const v=getV(ox,oy,oz);
    if(v>0&&(v&255)===B.OBSERVER&&((v>>8)&7)===OPP[f]&&!((v>>8)&8))scheduleTick(ox,oy,oz,2,B.OBSERVER);}
}
const stats={meshes:0,fps:0,frameMs:0,tickMs:0};
