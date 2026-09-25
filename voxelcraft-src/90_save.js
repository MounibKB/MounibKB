/* =====================================================================
   PERSISTENCE (IndexedDB, chunk-level, revisioned)
   - meta record per world + one record per touched chunk (per dimension)
   - saves run one at a time; a snapshot of revision N marks only chunks whose
     revision is still <= N as clean (newer edits stay dirty)
   - synchronous localStorage journal on pagehide/unload for tab closing
   - all loaded data is validated; bad records are skipped, never fatal
   ===================================================================== */
const SAVE_VERSION=2;
const DB_NAME='voxelcraft',JOURNAL_KEY='voxelcraft.journal.v2';
let dbp=null;
function openDB(){
  if(dbp)return dbp;
  dbp=new Promise((res,rej)=>{
    if(!window.indexedDB){rej(new Error('IndexedDB not available'));return;}
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains('worlds'))db.createObjectStore('worlds',{keyPath:'id'});if(!db.objectStoreNames.contains('chunks'))db.createObjectStore('chunks');};
    r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>db.close();res(db);};r.onerror=()=>rej(r.error);r.onblocked=()=>rej(new Error('database blocked by another tab'));
  });
  dbp.catch(()=>{dbp=null;});
  return dbp;
}
const idbReq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
const txDone=tx=>new Promise((res,rej)=>{tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error||new Error('transaction error'));tx.onabort=()=>rej(tx.error||new Error('transaction aborted'));});
const chunkDbKey=(wid,dim,key)=>wid+'|'+dim+'|'+keyCXm(key)+','+keyCZm(key);
async function listWorlds(){const db=await openDB();const tx=db.transaction('worlds','readonly');return (await idbReq(tx.objectStore('worlds').getAll())).map(sanitizeMetaHeader).filter(Boolean).sort((a,b)=>b.lastPlayed-a.lastPlayed);}
async function loadMeta(id){const db=await openDB();return await idbReq(db.transaction('worlds','readonly').objectStore('worlds').get(id));}
async function loadDimRecords(id,dim){
  const db=await openDB();const tx=db.transaction('chunks','readonly');const st=tx.objectStore('chunks');const pre=id+'|'+dim+'|';
  const range=IDBKeyRange.bound(pre,pre+'￿');const keys=await idbReq(st.getAllKeys(range));const vals=await idbReq(st.getAll(range));
  const out=new Map();for(let i=0;i<keys.length;i++){const k=keys[i].slice(pre.length).split(',').map(Number);if(k.length===2&&k.every(Number.isInteger))out.set(ckey(k[0],k[1]),vals[i]);}
  return out;
}
async function deleteWorld(id){const db=await openDB();const tx=db.transaction(['worlds','chunks'],'readwrite');tx.objectStore('worlds').delete(id);
  tx.objectStore('chunks').delete(IDBKeyRange.bound(id+'|',id+'|￿'));await txDone(tx);
  try{const j=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'null');if(j&&j.world===id)localStorage.removeItem(JOURNAL_KEY);}catch(e){}}
/* ---------------- validation ---------------- */
function sanitizeMetaHeader(m){if(!m||typeof m!=='object'||typeof m.id!=='string')return null;
  return {id:m.id,name:typeof m.name==='string'?m.name.slice(0,40):'World',seed:m.seed|0,lastPlayed:finite(m.lastPlayed,0),mode:GAMEMODES.includes(m.player&&m.player.mode)?m.player.mode:'survival',
    version:m.version|0,dim:clamp(m.player&&m.player.dim|0,0,2)};}
function sanitizeMeta(m){
  const o={};const P=m.player&&typeof m.player==='object'?m.player:{};
  o.id=String(m.id);o.name=typeof m.name==='string'?m.name.slice(0,40):'World';o.seed=m.seed|0;o.rev=Math.max(1,finite(m.rev,1));
  o.gameTime=Math.max(0,finite(m.gameTime,0));o.dayTime=Math.max(0,finite(m.dayTime,1000));o.created=finite(m.created,Date.now());o.playTicks=Math.max(0,finite(m.playTicks,0));
  o.difficulty=clamp(finite(m.difficulty,2)|0,0,3);
  o.rules=Object.assign({},world.rules);if(m.rules&&typeof m.rules==='object')for(const k in o.rules){const v=m.rules[k];if(typeof v===typeof o.rules[k])o.rules[k]=typeof v==='number'?clamp(v|0,0,100):v;}
  const W=m.weather||{};o.weather={rain:!!W.rain,thunder:!!W.thunder,rainTime:clamp(finite(W.rainTime,12000),1,1e7),thunderTime:clamp(finite(W.thunderTime,30000),1,1e7),rainLevel:0,thunderLevel:0};
  const vecOk=a=>Array.isArray(a)&&a.length>=3&&a.slice(0,3).every(n=>typeof n==='number'&&isFinite(n)&&Math.abs(n)<3e7);
  const vec=(a,d)=>vecOk(a)?[+a[0],clamp(+a[1],-64,512),+a[2]]:d.slice();
  o.spawn=vec(m.spawn,[0.5,80,0.5]);
  o.portals={0:[],1:[],2:[]};if(m.portals)for(const d of [0,1,2])if(Array.isArray(m.portals[d]))o.portals[d]=m.portals[d].filter(p=>p&&[p.x,p.y,p.z].every(Number.isFinite)).slice(0,200).map(p=>({x:p.x|0,y:p.y|0,z:p.z|0,axis:p.axis?1:0}));
  o.dragon={killed:!!(m.dragon&&m.dragon.killed),spawned:!!(m.dragon&&m.dragon.spawned)};
  o.player={posInvalid:!vecOk(P.pos),pos:vec(P.pos,o.spawn),yaw:finite(P.yaw,0),pitch:clamp(finite(P.pitch,0),-1.57,1.57),health:clamp(finite(P.health,20),0,20),food:clamp(finite(P.food,20)|0,0,20),
    saturation:clamp(finite(P.saturation,5),0,20),exhaustion:clamp(finite(P.exhaustion,0),0,40),xpLevel:clamp(finite(P.xpLevel,0)|0,0,21863),xpProgress:clamp(finite(P.xpProgress,0),0,0.9999),
    xpTotal:Math.max(0,finite(P.xpTotal,0)|0),mode:GAMEMODES.includes(P.mode)?P.mode:'survival',flying:!!P.flying,dim:clamp(finite(P.dim,0)|0,0,2),dead:!!P.dead,air:clamp(finite(P.air,300)|0,-20,300),
    fire:clamp(finite(P.fire,0)|0,0,32767),inv:P.inv,effects:Array.isArray(P.effects)?P.effects:[],deathMsg:typeof P.deathMsg==='string'?P.deathMsg.slice(0,100):'',
    bed:P.bed&&[P.bed.x,P.bed.y,P.bed.z].every(Number.isFinite)?{x:P.bed.x|0,y:P.bed.y|0,z:P.bed.z|0,dim:clamp(P.bed.dim|0,0,2)}:null,
    unlocked:Array.isArray(P.unlocked)?P.unlocked.filter(n=>Number.isInteger(n)&&n>=0&&n<RECIPES.length):[],adv:Array.isArray(P.adv)?P.adv.filter(a=>typeof a==='string'&&ADV[a]):[],
    stats:Object.assign({blocksMined:0,blocksPlaced:0,mobsKilled:0,deaths:0,distance:0},P.stats&&typeof P.stats==='object'?Object.fromEntries(Object.entries(P.stats).filter(([k,v])=>Number.isFinite(v))):{})};
  if(o.player.health<=0)o.player.dead=true;
  return o;
}
function decodeChunkRecord(key,r,problems){
  if(!r||typeof r!=='object'){problems.push(key);return null;}
  const out={edits:null,be:[],ents:[],ticks:[],pop:!!r.pop,crystal:!!r.crystal};
  try{if(r.edits)out.edits=S.decodeEdits(r.edits instanceof Uint8Array?r.edits:(typeof r.edits==='string'?S.b64dec(r.edits):new Uint8Array(r.edits)));}catch(e){problems.push(key+' edits');}
  if(Array.isArray(r.be))for(const b of r.be){if(!b||typeof b.type!=='string'||![b.x,b.y,b.z].every(Number.isInteger))continue;const be={type:b.type,x:b.x,y:b.y,z:b.z,items:Array.isArray(b.items)?b.items.map(sanitizeStack):[]};
    if(b.type==='chest')be.items=Array.from({length:27},(_,i)=>be.items[i]||null);
    if(b.type==='furnace'){be.items=[0,1,2].map(i=>be.items[i]||null);be.burn=clamp(b.burn|0,0,32000);be.burnMax=clamp(b.burnMax|0,0,32000);be.cook=clamp(b.cook|0,0,200);be.xp=clamp(finite(b.xp,0),0,1e5);}
    if(b.type==='spawner')be.delay=clamp(b.delay|0,1,2000);out.be.push(be);}
  if(Array.isArray(r.ents))out.ents=r.ents.filter(e=>e&&typeof e==='object'&&typeof e.type==='string').slice(0,500);
  if(Array.isArray(r.ticks))out.ticks=r.ticks.filter(t=>Array.isArray(t)&&t.length>=5&&t.every(Number.isFinite)).slice(0,20000);
  return out;
}
/* ---------------- snapshot building ---------------- */
function serializeBE(be){const o={type:be.type,x:be.x,y:be.y,z:be.z,items:be.items.map(cloneStack)};if(be.type==='furnace'){o.burn=be.burn;o.burnMax=be.burnMax;o.cook=be.cook;o.xp=be.xp;}if(be.type==='spawner')o.delay=be.delay;return o;}
function buildMeta(){
  const p=player;
  return {id:world.id,name:world.name,version:SAVE_VERSION,seed:world.seed,rev:world.rev,gameTime:world.gameTime,dayTime:world.dayTime,created:world.created,lastPlayed:Date.now(),playTicks:world.playTicks,
    difficulty:world.difficulty,rules:world.rules,weather:{rain:world.weather.rain,thunder:world.weather.thunder,rainTime:world.weather.rainTime,thunderTime:world.weather.thunderTime},
    spawn:world.spawn,portals:world.portals,dragon:world.dragon,
    player:{pos:p.pos.slice(),yaw:p.yaw,pitch:p.pitch,health:p.health,food:p.food,saturation:p.saturation,exhaustion:p.exhaustion,xpLevel:p.xpLevel,xpProgress:p.xpProgress,xpTotal:p.xpTotal,
      mode:p.mode,flying:p.flying,dim:world.dim,dead:p.dead,air:p.air,fire:p.fireTicks,inv:p.inv.save(),effects:[...p.effects].map(([k,e])=>[k,e.dur,e.amp]),bed:p.bed,deathMsg:p.deathMsg,
      unlocked:[...p.unlocked],adv:[...p.adv],stats:p.stats,cursor:null}};
}
function chunkTicks(){const m=new Map();for(const e of tickHeap){const k=ckey(Math.floor(e.x/16),Math.floor(e.z/16));if(tickKeys.get(posKey(e.x,e.y,e.z))!==e.t)continue;
  let l=m.get(k);if(!l){l=[];m.set(k,l);}l.push([e.x,e.y,e.z,Math.max(1,e.t-world.gameTime),e.id]);}return m;}
function chunkBEs(){const m=new Map();for(const be of world.be.values()){const k=ckey(Math.floor(be.x/16),Math.floor(be.z/16));let l=m.get(k);if(!l){l=[];m.set(k,l);}l.push(serializeBE(be));}return m;}
function liveEntities(){const m=new Map();for(const e of world.entities){if(e.dead||!e.persistent)continue;const k=ckey(Math.floor(e.pos[0]/16),Math.floor(e.pos[2]/16));
  let l=m.get(k);if(!l){l=[];m.set(k,l);}try{l.push(e.save());}catch(err){}}return m;}
// collect records that need writing: returns [{key, rec, rev}]
function collectDirty(){
  const out=[],ticks=chunkTicks(),bes=chunkBEs(),ents=liveEntities();
  const keys=new Set();for(const [k,m] of world.meta)if(m.rev>m.savedRev)keys.add(k);
  for(const k of ents.keys())keys.add(k);
  for(const k of keys){
    const m=metaOf(k);const e=world.edits.get(k);const live=ents.get(k)||[];const allEnts=live.concat(m.ents);
    const entJSON=JSON.stringify(allEnts);
    if(!(m.rev>m.savedRev)&&entJSON===m.lastEnt)continue;
    const rec={v:SAVE_VERSION,edits:e&&e.size?S.encodeEdits(e):null,be:bes.get(k)||[],ents:allEnts,ticks:(ticks.get(k)||[]).concat(m.ticks),pop:!!m.pop,crystal:!!m.crystalDone};
    out.push({key:k,rec,rev:m.rev,entJSON});
  }
  return out;
}
/* ---------------- save queue ---------------- */
let saving=false,saveQueued=false,saveErrors=0,saveLocked=false;
function requestSave(reason){if(!world.id||!worldReady)return;if(saving){saveQueued=true;return;}doSave(reason);}
async function doSave(reason){
  if(!world.id||!worldReady||saveLocked)return false;
  if(saving){saveQueued=true;return false;}
  saving=true;let ok=false;
  const snapRev=world.rev,wid=world.id,dim=world.dim;
  try{
    const meta=buildMeta();const dirty=collectDirty();
    const db=await openDB();const tx=db.transaction(['worlds','chunks'],'readwrite');
    tx.objectStore('worlds').put(meta);const cs=tx.objectStore('chunks');
    for(const d of dirty){const empty=!d.rec.edits&&!d.rec.be.length&&!d.rec.ents.length&&!d.rec.ticks.length&&!d.rec.pop;
      if(empty)cs.delete(chunkDbKey(wid,dim,d.key));else cs.put(d.rec,chunkDbKey(wid,dim,d.key));}
    await txDone(tx);
    if(world.id===wid&&world.dim===dim){
      for(const d of dirty){const m=metaOf(d.key);m.savedRev=Math.max(m.savedRev,d.rev);m.lastEnt=d.entJSON;}
      world.metaDirty=false;saveErrors=0;
      try{const j=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'null');if(j&&j.world===wid&&j.rev<=snapRev)localStorage.removeItem(JOURNAL_KEY);}catch(e){}
      $('saveState')&&($('saveState').textContent='Saved '+new Date().toLocaleTimeString());ok=true;
    }
  }catch(err){saveErrors++;reportError('save',err);if(saveErrors===1)toast('Saving failed: '+(err&&err.message||err)+' — progress is kept in memory and will be retried');}
  finally{saving=false;if(saveQueued){saveQueued=false;setTimeout(()=>doSave('queued'),50);}}
  return ok;
}
// Complete a save whose snapshot is taken now: an in-flight autosave is waited out first, because its snapshot
// may predate the latest changes. Returns false if the data could not be written; callers must then keep the
// in-memory state instead of discarding it.
async function flushSave(reason){
  for(let i=0;i<3;i++){
    for(let w=0;saving&&w<600;w++)await new Promise(r=>setTimeout(r,25));
    if(saving)return false;
    saveQueued=false;if(await doSave(reason))return true;
    await new Promise(r=>setTimeout(r,150));
  }
  return false;
}
// synchronous emergency journal (page is being hidden/closed)
function writeJournal(){
  if(!world.id||!worldReady||saveLocked)return;
  try{
    const dirty=collectDirty();const chunksOut={};
    for(const d of dirty){const r=Object.assign({},d.rec);if(r.edits)r.edits=S.b64enc(r.edits);chunksOut[d.key]=r;}
    const s=JSON.stringify({world:world.id,dim:world.dim,rev:world.rev,time:Date.now(),meta:buildMeta(),chunks:chunksOut});
    if(s.length>4.5e6){log('journal too large, skipped');return false;}
    localStorage.setItem(JOURNAL_KEY,s);return true;
  }catch(e){log('journal failed',e);return false;}
}
window.addEventListener('pagehide',()=>{writeJournal();doSave('pagehide');});
window.addEventListener('beforeunload',()=>{writeJournal();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){writeJournal();doSave('hidden');}});
/* ---------------- world loading ---------------- */
let worldReady=false,worldLock=null;
async function acquireLock(id){
  if(!navigator.locks||!navigator.locks.request)return true;
  const tryOnce=()=>new Promise(res=>{navigator.locks.request('voxelcraft-world-'+id,{ifAvailable:true},lock=>{if(!lock){res(false);return;}res(true);return new Promise(r=>{worldLock=r;});}).catch(()=>res(true));});
  // a tab that just closed (or this tab quitting) may still hold the lock for a moment: retry briefly
  for(let i=0;i<12;i++){if(await tryOnce())return true;await new Promise(r=>setTimeout(r,250));}
  return false;
}
function releaseLock(){if(worldLock){worldLock();worldLock=null;}}
function resetWorldState(){
  epoch++; // results still in flight from the previous world/dimension's workers are stale from now on
  for(const c of [...chunks.values()]){freeMesh(c.opq);freeMesh(c.trn);}chunks.clear();hiQueue=[];loadQueue=[];lastCenter='';
  world.edits=new Map();world.meta=new Map();world.bases=new Map();world.baseReq=new Set();world.be=new Map();world.entities=[];
  tickHeap.length=0;tickKeys.clear();updQ.length=0;updHead=0;pendingSets=[];particles.length=0;wirePending.clear();world.endGen=null;
}
function applyDimRecords(recs){
  const problems=[];
  for(const [k,r] of recs){const d=decodeChunkRecord(k,r,problems);if(!d)continue;
    if(d.edits&&d.edits.size)world.edits.set(k,d.edits);
    for(const be of d.be)world.be.set(posKey(be.x,be.y,be.z),be);
    const m=metaOf(k);m.ents=d.ents;m.ticks=d.ticks;m.pop=d.pop;m.crystalDone=d.crystal;m.rev=0;m.savedRev=0;m.lastEnt=JSON.stringify(d.ents);}
  if(problems.length){log('corrupted chunk records skipped:',problems);toast(problems.length+' damaged chunk record(s) were skipped (see console)');}
}
async function openWorld(id){
  worldReady=false;saveLocked=false;
  if(!(await acquireLock(id))){alert('This world is already open in another tab. Close it there first.');return false;}
  let raw=await loadMeta(id);if(!raw)throw new Error('world not found');
  let recs=null;
  // newer journal (tab was closed before the async save finished)?
  let journal=null;try{journal=JSON.parse(localStorage.getItem(JOURNAL_KEY)||'null');}catch(e){}
  if(journal&&journal.world===id&&journal.rev>(raw.rev||0)&&journal.meta){raw=journal.meta;log('applying save journal rev',journal.rev);}
  else journal=null;
  const m=sanitizeMeta(raw);
  resetWorldState();
  Object.assign(world,{id:m.id,name:m.name,seed:m.seed,rev:m.rev,gameTime:m.gameTime,dayTime:m.dayTime,created:m.created,playTicks:m.playTicks,difficulty:m.difficulty,rules:m.rules,
    weather:m.weather,spawn:m.spawn,portals:m.portals,dragon:m.dragon,dim:m.player.dim});
  recs=await loadDimRecords(id,world.dim);
  if(journal&&journal.dim===world.dim)for(const k in journal.chunks){const r=journal.chunks[k];recs.set(+k,r);}
  applyDimRecords(recs);
  if(journal){for(const k in journal.chunks)touchChunk(+k);}
  applyPlayerSave(m.player);
  startWorkers();
  worldReady=true;
  if(journal)doSave('journal');
  return true;
}
function applyPlayerSave(P){
  const p=player;
  Object.assign(p,{health:P.health,food:P.food,saturation:P.saturation,exhaustion:P.exhaustion,xpLevel:P.xpLevel,xpProgress:P.xpProgress,xpTotal:P.xpTotal,mode:P.mode,
    flying:P.flying&&(P.mode==='creative'||P.mode==='spectator'),air:P.air,fireTicks:P.fire,bed:P.bed,deathMsg:P.deathMsg,dead:P.dead,ready:false,sleeping:0,using:null,absorption:0});
  p.setPos(P.pos[0],P.pos[1],P.pos[2]);p.renderPrev=p.pos.slice();p.vel=[0,0,0];p.yaw=P.yaw;p.pitch=P.pitch;p.fallDist=0;
  p.inv=new PlayerInventory();p.inv.load(P.inv);p.armor=p.inv.armor;
  p.effects=new Map();for(const e of P.effects)if(Array.isArray(e)&&EFFECTS[e[0]])p.effects.set(e[0],{dur:clamp(e[1]|0,1,1e6),amp:clamp(e[2]|0,0,5)});
  p.unlocked=new Set(P.unlocked);p.adv=new Set(P.adv);p.stats=P.stats;
  awaitSpawn={x:p.pos[0],z:p.pos[2],y:p.pos[1],surface:!!P.posInvalid};
  if(P.posInvalid)log('saved player position was invalid; placing at world spawn');
}
async function createWorld(name,seedStr,mode,difficulty){
  const id='w'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const seed=S.seedFromString(seedStr);
  const meta={id,name:name||'New World',version:SAVE_VERSION,seed,rev:1,gameTime:0,dayTime:1000,created:Date.now(),lastPlayed:Date.now(),difficulty,
    rules:Object.assign({},world.rules,{keepInventory:false,doDaylightCycle:true,doMobSpawning:true,doFireTick:true,mobGriefing:true,randomTickSpeed:3,doWeatherCycle:true,naturalRegeneration:true}),
    weather:{rain:false,thunder:false,rainTime:12000+Math.floor(Math.random()*168000),thunderTime:12000+Math.floor(Math.random()*168000)},spawn:null,portals:{0:[],1:[],2:[]},dragon:{killed:false,spawned:false},
    player:{pos:[0.5,100,0.5],yaw:0,pitch:0,health:20,food:20,saturation:5,mode,dim:0,inv:null,fresh:true}};
  const db=await openDB();const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').put(meta);await txDone(tx);
  return id;
}
/* ---------------- dimension switching ---------------- */
let dimSwitching=false;
async function changeDimension(dim,pos,isRespawn){
  if(dimSwitching)return;dimSwitching=true;
  try{
    showLoading('Loading '+DIMS[dim].name+'…');
    // persist everything in the current dimension first (entities stashed, full save)
    for(const c of [...chunks.values()])stashChunkEntities(c);
    if(!await flushSave('dimension')){
      // never discard unsaved chunks: stay in this dimension and bring the stashed entities back
      for(const c of chunks.values()){const m=world.meta.get(c.key);if(m&&m.ents.length){for(const o of m.ents){const e=entityFromSave(o);if(e)world.entities.push(e);}m.ents=[];}}
      pendingPortal=null;hideLoading();toast('Could not save the world — staying in this dimension so nothing is lost');player.portalCooldown=200;
      if(isRespawn){player.dead=true;showDeath(player.deathMsg||'You died!');} // let the player retry the respawn
      return;}
    const keepPlayer=player;
    resetWorldState();
    world.dim=dim;
    const recs=await loadDimRecords(world.id,dim);applyDimRecords(recs);
    startWorkers();
    keepPlayer.setPos(pos[0],pos[1],pos[2]);keepPlayer.renderPrev=keepPlayer.pos.slice();keepPlayer.vel=[0,0,0];keepPlayer.fallDist=0;keepPlayer.ready=false;
    awaitSpawn={x:pos[0],z:pos[2],y:pos[1],surface:!!isRespawn||pos.surface,portal:pendingPortal};
    if(dim===2)advance('enter_end');if(dim===1)advance('enter_nether');
    world.metaDirty=true;
  }catch(err){reportError('dimension change',err);}
  finally{dimSwitching=false;}
}
/* ---------------- v1 (single-slot localStorage) migration ---------------- */
async function migrateV1(){
  let meta=null,edits='';try{meta=JSON.parse(localStorage.getItem('voxelcraft.meta.v1')||'null');edits=localStorage.getItem('voxelcraft.edits.v1')||'';}catch(e){return null;}
  if(!meta||meta.v!==1||localStorage.getItem('voxelcraft.v1migrated'))return null;
  const id='v1'+Date.now().toString(36);const chunkRecs=[];
  try{const o=edits?JSON.parse(edits):{};for(const k in o){const [cx,cz]=k.split(',').map(Number);if(!Number.isInteger(cx)||!Number.isInteger(cz))continue;
      const b=S.b64dec(o[k]),m=new Map();for(let i=0;i+2<b.length;i+=3){const idx=b[i]|(b[i+1]<<8),vid=b[i+2];m.set(idx,DEF[vid]?vid:0);}
      if(m.size)chunkRecs.push([ckey(cx,cz),{v:2,edits:S.encodeEdits(m),be:[],ents:[],ticks:[],pop:true}]);}}catch(e){log('v1 edits unreadable',e);}
  const P=meta.player||{};const inv={main:(P.slots||[]).slice(0,36).map(s=>s&&{id:migrateV1Item(s.id|0),count:s.count|0}).map(sanitizeStack),armor:[],off:null,sel:P.sel|0};
  const m2={id,name:'Imported world (v1)',version:SAVE_VERSION,seed:meta.seed|0,rev:2,gameTime:0,dayTime:Math.floor(finite(meta.time,0.08)*24000),created:Date.now(),lastPlayed:Date.now(),difficulty:2,
    rules:Object.assign({},world.rules),weather:{rain:false,thunder:false,rainTime:30000,thunderTime:60000},spawn:Array.isArray(P.spawn)?P.spawn:null,portals:{0:[],1:[],2:[]},dragon:{killed:false,spawned:false},
    player:{pos:P.pos,yaw:P.yaw,pitch:P.pitch,health:P.health,food:20,saturation:5,mode:P.creative?'creative':'survival',flying:!!P.flying&&!!P.creative,dim:0,inv}};
  const db=await openDB();const tx=db.transaction(['worlds','chunks'],'readwrite');tx.objectStore('worlds').put(m2);for(const [k,r] of chunkRecs)tx.objectStore('chunks').put(r,chunkDbKey(id,0,k));await txDone(tx);
  localStorage.setItem('voxelcraft.v1migrated',id); // original v1 data is left untouched as a backup
  return id;
}
/* ---------------- export / import ---------------- */
async function exportWorld(id){
  const db=await openDB();const meta=await loadMeta(id);if(!meta)return;
  const tx=db.transaction('chunks','readonly');const range=IDBKeyRange.bound(id+'|',id+'|￿');
  const keys=await idbReq(tx.objectStore('chunks').getAllKeys(range)),vals=await idbReq(tx.objectStore('chunks').getAll(range));
  const chunksOut={};keys.forEach((k,i)=>{const r=Object.assign({},vals[i]);if(r.edits instanceof Uint8Array)r.edits=S.b64enc(r.edits);chunksOut[k.slice(id.length+1)]=r;});
  const blob=new Blob([JSON.stringify({format:'voxelcraft-world',version:SAVE_VERSION,meta,chunks:chunksOut})],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(meta.name||'world').replace(/[^\w\- ]+/g,'_')+'.voxelcraft.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);
}
async function importWorld(file){
  const txt=await file.text();const o=JSON.parse(txt);if(!o||o.format!=='voxelcraft-world'||!o.meta||typeof o.meta!=='object')throw new Error('not a VoxelCraft world file');
  const id='w'+Date.now().toString(36)+'i';
  const meta=Object.assign(sanitizeMeta(Object.assign({},o.meta,{id,name:String(o.meta.name||'Imported').slice(0,36)+' (imported)'})),{version:o.meta.version|0,lastPlayed:Date.now()});
  // validate every chunk record before opening the transaction, so a bad file never leaves a half-imported world
  const recs=[];const src=o.chunks&&typeof o.chunks==='object'?o.chunks:{};
  for(const k of Object.keys(src)){if(!/^[0-2]\|-?\d{1,7},-?\d{1,7}$/.test(k))continue;const r0=src[k];if(!r0||typeof r0!=='object')continue;
    const r=Object.assign({},r0);if(typeof r.edits==='string'){try{r.edits=S.b64dec(r.edits);S.decodeEdits(r.edits);}catch(e){throw new Error('corrupt chunk data at '+k);}}
    recs.push([id+'|'+k,r]);if(recs.length>200000)throw new Error('world file too large');}
  const db=await openDB();const tx=db.transaction(['worlds','chunks'],'readwrite');tx.objectStore('worlds').put(meta);
  for(const [k,r] of recs)tx.objectStore('chunks').put(r,k);
  await txDone(tx);return id;
}
