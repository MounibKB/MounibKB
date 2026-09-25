/* =====================================================================
   BLOCK BEHAVIOURS: placement state, support rules, drops, fluids,
   gravity, plants, leaves, fire, TNT, portals, doors, beds ...
   BEH[id] = {onPlace, onRemove, onNeighbor, onTick, randomTick, onUse, onEntityInside, onStep}
   ===================================================================== */
const BEH=new Array(256).fill(null);
const beh=(id,o)=>{BEH[id]=Object.assign(BEH[id]||{},o);};
const solidTop=v=>{if(v<=0)return false;const f=FLAGS[v];if(f&F_FULLCOL)return true;const id=v&255;
  if(id===B.STONE_SLAB||id===B.OAK_SLAB||id===B.COBBLESTONE_SLAB)return ((v>>8)&3)!==0;if(DEF[id].key.endsWith('stairs'))return ((v>>8)&4)!==0;
  return id===B.SOUL_SAND||id===B.FARMLAND||id===B.GLASS||(f&F_SOLID&&(f&F_CUBE));};
const sturdy=v=>v>0&&(FLAGS[v]&F_OPAQUE)&&(FLAGS[v]&F_SOLID);
const replaceable=v=>v===0||(v>0&&(FLAGS[v]&F_REPL));
const SOIL=new Set([B.GRASS_BLOCK,B.DIRT,B.PODZOL,B.FARMLAND,B.MOSS_BLOCK,B.PALE_MOSS_BLOCK,B.MYCELIUM,B.MUD]);
const hFacingOf=yaw=>{const a=((-yaw/(Math.PI/2))%4+4)%4;return Math.round(a)&3;}; // 0 N,1 E,2 S,3 W  (yaw 0 looks -z)
/* ---------------- placement ---------------- */
// ctx: {x,y,z, face (hit face 0..5), hy (hit y fraction), yaw, pitch}; returns voxel or -1
function placementState(id,ctx){
  const d=DEF[id];if(!d)return -1;const kind=d.place,f=ctx.face,h=hFacingOf(ctx.yaw);
  const cur=getV(ctx.x,ctx.y,ctx.z);
  switch(kind){
    case 'axis':return V(id,f<=1?1:(f<=3?0:2));
    case 'facingOpp':return V(id,(h+2)&3);
    case 'facingSame':return V(id,h);
    case 'facing6':case 'facing6obs':{
      if(ctx.pitch>0.8)return V(id,kind==='facing6'?2:3);if(ctx.pitch<-0.8)return V(id,kind==='facing6'?3:2);
      const hf=HFACE[h];return V(id,kind==='facing6'?OPP[hf]:hf);}
    case 'slab':{
      if((cur&255)===id&&((cur>>8)&3)!==2)return V(id,2);
      const top=f===2||(f!==3&&ctx.hy>0.5);return V(id,top?1:0);}
    case 'stairs':{const top=f===2||(f!==3&&ctx.hy>0.5);return V(id,h|(top?4:0));}
    case 'torch':{if(f===3)return V(id,0);if(f===2)return -1;const wall={5:0,0:1,4:2,1:3}[f];return V(id,1+wall);}
    case 'wallH':{if(f===2||f===3)return -1;return V(id,{5:0,0:1,4:2,1:3}[f]);}
    case 'attach6':{if(f===3)return V(id,0);if(f===2)return V(id,1);return V(id,2+{5:0,0:1,4:2,1:3}[f]);}
    case 'door':{
      const up=getV(ctx.x,ctx.y+1,ctx.z);if(!replaceable(up)||!solidTop(getV(ctx.x,ctx.y-1,ctx.z)))return -1;
      // hinge on the side with a solid block / next to another door
      const [lx,lz]=HVEC[(h+3)&3];const left=getV(ctx.x+lx,ctx.y,ctx.z+lz);const hinge=(left&255)===id?16:0;
      return V(id,h|hinge);}
    case 'trapdoor':{const top=f===2||(f!==3&&ctx.hy>0.5);return V(id,((h+2)&3)|(top?8:0));}
    case 'bed':{const [dx,dz]=HVEC[h];if(!replaceable(getV(ctx.x+dx,ctx.y,ctx.z+dz))||!solidTop(getV(ctx.x,ctx.y-1,ctx.z))||!solidTop(getV(ctx.x+dx,ctx.y-1,ctx.z+dz)))return -1;return V(id,h);}
    case 'rail':return V(id,railShape(ctx.x,ctx.y,ctx.z,(h&1)));
    case 'snowlayer':{if((cur&255)===B.SNOW){const l=(cur>>8)&7;if(l>=7)return V(B.SNOW_BLOCK);return V(id,l+1);}return V(id,0);}
    case 'vine':{if(f===2||f===3)return -1;const wall={5:0,0:1,4:2,1:3}[f];return V(id,(cur&255)===B.VINE?((cur>>8)|(1<<wall)):(1<<wall));}
  }
  return V(id,0);
}
function railShape(x,y,z,dflt){
  const r=(dx,dz)=>(getId(x+dx,y,z+dz)===B.RAIL);
  const n=r(0,-1),s=r(0,1),e=r(1,0),w=r(-1,0);
  if((n||s)&&!(e||w))return 0;if((e||w)&&!(n||s))return 1;
  if(s&&e)return 2;if(s&&w)return 3;if(n&&w)return 4;if(n&&e)return 5;return dflt;
}
/* ---------------- survival (support) ---------------- */
function canSurvive(x,y,z,v){
  const d=DEF[v&255];if(!d||!d.support)return true;const s=v>>8;const below=getV(x,y-1,z);
  if(below<0)return true; // unknown: never break blocks because a neighbour chunk is unloaded
  switch(d.support){
    case 'soil':return SOIL.has(below&255);
    case 'sandy':return [B.SAND,B.RED_SAND,B.TERRACOTTA,B.DIRT,B.PODZOL,B.GRASS_BLOCK].includes(below&255)||DEF[below&255].key.endsWith('terracotta');
    case 'farmland':return (below&255)===B.FARMLAND;
    case 'cane':{if((below&255)===B.SUGAR_CANE)return true;if(![B.GRASS_BLOCK,B.DIRT,B.SAND,B.RED_SAND,B.PODZOL,B.MUD].includes(below&255))return false;
      for(const [dx,dz] of HVEC){const n=getV(x+dx,y-1,z+dz);if(n<0||(n&255)===B.WATER||(n&255)===B.ICE)return true;}return false;}
    case 'cactus':{if((below&255)!==B.CACTUS&&(below&255)!==B.SAND&&(below&255)!==B.RED_SAND)return false;
      for(const [dx,dz] of HVEC){const n=getV(x+dx,y,z+dz);if(n>0&&(FLAGS[n]&F_SOLID))return false;}return true;}
    case 'mushroom':return (below&255)===B.MYCELIUM||(below&255)===B.PODZOL||sturdy(below);
    case 'solidTop':return solidTop(below);
    case 'water':return (below&255)===B.WATER&&(((below>>8)&15)===0);
    case 'torch':{const a=s&7;if(a===0||a>4)return solidTop(below);const [dx,dz]=HVEC[a-1];const w=getV(x+dx,y,z+dz);return w<0||sturdy(w);}
    case 'wallH':{const [dx,dz]=HVEC[s&3];const w=getV(x+dx,y,z+dz);return w<0||sturdy(w);}
    case 'attach6':{const a=s&7;let n;if(a===0)n=below;else if(a===1)n=getV(x,y+1,z);else{const [dx,dz]=HVEC[a-2];n=getV(x+dx,y,z+dz);}return n<0||(n>0&&(FLAGS[n]&F_SOLID)&&(FLAGS[n]&F_CUBE));}
  }
  return true;
}
/* ---------------- drops ---------------- */
function canHarvest(id,tool){const d=DEF[id];if(!d.needTool)return true;const it=tool&&ITEM[tool.id];if(!it||!it.tool)return false;
  if(it.tool.type!==d.tool&&!(d.tool==='shears'&&it.tool.type==='shears'))return false;return it.tool.level>=d.level;}
function blockDrops(v,tool,rng=Math.random){
  const id=v&255,d=DEF[id],s=v>>8,out=[];if(!d||d.hard<0&&!(tool&&tool.creative))return out;
  if(!canHarvest(id,tool))return out;
  const silk=enchLvl(tool,'silk_touch')>0,fortune=enchLvl(tool,'fortune'),shears=tool&&ITEM[tool.id]&&ITEM[tool.id].key==='shears';
  const add=(key,n)=>{const iid=typeof key==='number'?key:I[key.toUpperCase()];if(iid&&n>0)out.push(mkStack(iid,n));};
  const rr=(a,b)=>a+Math.floor(rng()*(b-a+1));
  if(silk&&d.drop!==undefined&&ITEM[id]&&!d.key.endsWith('_door')){add(id,1);return out;}
  if(d.key.endsWith('slab')){add(id,(s&3)===2?2:1);return out;}
  const drop=d.drop;
  if(drop===undefined){if(ITEM[id])add(id,1);return out;}
  if(drop===null)return out;
  switch(drop){
    case '__leaves':{if(shears){add(id,1);break;}const w=d.wood,sap=[0.05,0.05,0.05,0.025,0.05,0.05,0.05,0.05][w]*(1+fortune*0.25);
      if(rng()<sap){out.push(mkStack(B.SAPLING,1));out[out.length-1].sapling=w;}if(rng()<0.02*(1+fortune))add('stick',rr(1,2));if((w===0)&&rng()<0.005*(1+fortune))add('apple',1);break;}
    case '__grass':{if(shears){add(id,1);break;}if(rng()<0.125)add('wheat_seeds',1);break;}
    case '__wheat':{if((s&7)>=7){add('wheat',1);add('wheat_seeds',rr(0,3));}else add('wheat_seeds',1);break;}
    case '__carrots':add('carrot',(s&7)>=7?rr(1,4)+(fortune?rr(0,fortune):0):1);break;
    case '__potatoes':add('potato',(s&7)>=7?rr(1,4)+(fortune?rr(0,fortune):0):1);if((s&7)>=7&&rng()<0.02)add('potato',0);break;
    case '__door':add(id===B.OAK_DOOR?'oak_door_item':'iron_door_item',1);break;
    case '__bed':add('bed_item',1);break;
    default:{let n=1;if(d.dropCount)n=rr(d.dropCount[0],d.dropCount[1]);
      if(id===B.SNOW)n=(s&7)+1;
      if(d.fortune&&fortune){if(d.key.endsWith('ore')){const bonus=Math.max(0,Math.floor(rng()*(fortune+2))-1);n*=bonus+1;}else n=Math.min(n+rr(0,fortune),id===B.GLOWSTONE?4:9);}
      add(drop,n);}
  }
  return out;
}
function xpForBlock(v,tool){const d=DEF[v&255];if(!d.xp||enchLvl(tool,'silk_touch')||!canHarvest(v&255,tool))return 0;return d.xp[0]+Math.floor(Math.random()*(d.xp[1]-d.xp[0]+1));}
// destroy a block, spawning its drops (used by players, explosions, pistons, support loss, fluids)
function destroyBlock(x,y,z,drops=true,tool=null,byPlayer=null){
  const v=getV(x,y,z);if(v<=0)return false;const id=v&255;
  if(drops){const st=blockDrops(v,tool);for(const s of st){if(s.sapling!==undefined){const sw=s.sapling;delete s.sapling;s.id=B.SAPLING;s.count=1;s.sap=sw;}dropItemAt(x+0.5,y+0.4,z+0.5,s);}
    const xp=xpForBlock(v,tool);if(xp>0)spawnXP(x+0.5,y+0.5,z+0.5,xp);}
  const d=DEF[id];
  // two-block structures: remove the other half silently
  if(id===B.OAK_DOOR||id===B.IRON_DOOR){const oy=((v>>8)&8)?y-1:y+1;if(getId(x,oy,z)===id)setV(x,oy,z,0);}
  if(id===B.BED){const s=v>>8,[dx,dz]=HVEC[s&3],sg=(s&4)?-1:1;const ox=x+dx*sg,oz=z+dz*sg;if(getId(ox,y,oz)===B.BED)setV(ox,y,oz,0,SET_NO_CALLBACKS);}
  setV(x,y,z,0);
  particlesForBlock(x,y,z,v);if(byPlayer!==false)sfx.block(d.sound,'break',x,y,z);
  return true;
}
/* ---------------- default neighbour behaviour: support check ---------------- */
function supportBehaviour(id){beh(id,{onNeighbor(x,y,z,v){if(!canSurvive(x,y,z,v))destroyBlock(x,y,z,true,null,false);}});}
for(const d of DEF)if(d&&d.support)supportBehaviour(d.id);
/* ---------------- fluids ---------------- */
const isFluid=(v,id)=>v>0&&(v&255)===id;
const fluidSource=v=>((v>>8)&15)===0;
function fluidDelay(id){return id===B.WATER?5:(world.dim===1?10:30);}
function flowable(nv,id){ // can fluid `id` flow into a cell holding nv (not counting same-fluid level checks)
  if(nv<0)return false;if(nv===0)return true;const nid=nv&255;
  if(nid===id)return false;if(nid===B.WATER||nid===B.LAVA)return true;
  const f=FLAGS[nv];return !!(f&F_REPL)&&!(f&F_SOLID)||(!(f&F_SOLID)&&!(f&F_OPAQUE)&&[B.TORCH,B.REDSTONE_WIRE,B.REDSTONE_TORCH,B.RAIL,B.SUGAR_CANE,B.WHEAT,B.CARROTS,B.POTATOES,B.SAPLING,B.DANDELION,B.POPPY,B.CORNFLOWER,B.BLUE_ORCHID,B.ALLIUM,B.DEAD_BUSH,B.BROWN_MUSHROOM,B.RED_MUSHROOM,B.LEVER,B.STONE_BUTTON,B.COBWEB].includes(nid));
}
function flowInto(x,y,z,id,state){
  const nv=getV(x,y,z);if(nv<0)return;const nid=nv&255;
  if(id===B.WATER&&nid===B.LAVA){setV(x,y,z,fluidSource(nv)?B.OBSIDIAN:B.COBBLESTONE);sfx.play('fizz',x,y,z);return;}
  if(id===B.LAVA&&nid===B.WATER){setV(x,y,z,B.STONE);sfx.play('fizz',x,y,z);return;}
  if(nv>0&&nid!==id)destroyBlock(x,y,z,true,null,false);
  setV(x,y,z,V(id,state));
}
function slopeDist(x,y,z,id,depth,fromDir){
  let best=1000;
  for(let h=0;h<4;h++){if(h===((fromDir+2)&3))continue;const [dx,dz]=HVEC[h];const nx=x+dx,nz=z+dz;const nv=getV(nx,y,nz);
    if(nv<0||!(flowable(nv,id)||(isFluid(nv,id)&&!fluidSource(nv))))continue;
    const bv=getV(nx,y-1,nz);if(bv>=0&&(flowable(bv,id)||isFluid(bv,id)))return depth;
    if(depth<(id===B.WATER?4:2)){const d=slopeDist(nx,y,nz,id,depth+1,h);if(d<best)best=d;}}
  return best;
}
function fluidTick(x,y,z,v){
  const id=v&255,water=id===B.WATER;let s=v>>8,level=s&7,falling=!!(s&8);
  if(water&&world.dim===1){setV(x,y,z,0);return;}
  const drop=water||world.dim===1?1:2;
  // lava hardening when touching water
  if(!water){for(const f of [0,1,3,4,5]){const d=FDIR[f];const n=getV(x+d[0],y+d[1],z+d[2]);if(isFluid(n,B.WATER)){setV(x,y,z,(level===0&&!falling)?B.OBSIDIAN:B.COBBLESTONE);sfx.play('fizz',x,y,z);return;}}}
  if(!(level===0&&!falling)){
    const above=getV(x,y+1,z);let ns;
    if(isFluid(above,id))ns=8;
    else{let minN=99,sources=0;
      for(const [dx,dz] of HVEC){const n=getV(x+dx,y,z+dz);if(isFluid(n,id)){const nl=(n>>8)&7,nf=(n>>8)&8;if(nl===0&&!nf)sources++;minN=Math.min(minN,nf?0:nl);}}
      const below=getV(x,y-1,z);
      if(water&&sources>=2&&(below>0&&((FLAGS[below]&F_SOLID)||(isFluid(below,id)&&fluidSource(below)))))ns=0;
      else{const nl=minN+drop;ns=nl>7?-1:nl;}}
    if(ns<0){setV(x,y,z,0);return;}
    if(ns!==s){setV(x,y,z,V(id,ns));s=ns;level=s&7;falling=!!(s&8);}
  }
  const below=getV(x,y-1,z);if(below<0)return;
  if(flowable(below,id)||(isFluid(below,id)&&!fluidSource(below)&&!((below>>8)&8))){flowInto(x,y-1,z,id,8);return;}
  if(isFluid(below,id)&&!fluidSource(below))return;
  const spread=(falling?0:level)+drop;if(spread>7)return;
  // Minecraft flow rule: spread toward the nearest drop within range; with no drop in range spread everywhere passable
  const costs=[Infinity,Infinity,Infinity,Infinity];
  for(let h=0;h<4;h++){const [dx,dz]=HVEC[h];const nv=getV(x+dx,y,z+dz);
    if(nv<0||!(flowable(nv,id)||(isFluid(nv,id)&&((nv>>8)&7)>spread&&!((nv>>8)&8))))continue;
    const bv=getV(x+dx,y-1,z+dz);costs[h]=(bv>=0&&(flowable(bv,id)||isFluid(bv,id)))?0:slopeDist(x+dx,y,z+dz,id,1,h);}
  const mc=Math.min(...costs);if(mc===Infinity)return;
  for(let h=0;h<4;h++)if(costs[h]===mc){const [dx,dz]=HVEC[h];flowInto(x+dx,y,z+dz,id,spread);}
}
for(const id of [B.WATER,B.LAVA])beh(id,{
  onPlace(x,y,z,v){scheduleTick(x,y,z,fluidDelay(id),id);},
  onNeighbor(x,y,z,v){scheduleTick(x,y,z,fluidDelay(id),id);},
  onTick:fluidTick,
  randomTick(x,y,z,v){if(id===B.LAVA&&world.rules.doFireTick&&Math.random()<0.1)igniteNear(x,y,z);},
});
DEF[B.LAVA].randomTick=true;FLAGS[B.LAVA]|=F_RTICK;
/* ---------------- gravity blocks ---------------- */
for(const id of [B.SAND,B.RED_SAND,B.GRAVEL,B.DRAGON_EGG])beh(id,{
  onPlace(x,y,z){scheduleTick(x,y,z,2,id);},onNeighbor(x,y,z){scheduleTick(x,y,z,2,id);},
  onTick(x,y,z,v){const b=getV(x,y-1,z);if(b<0)return;if(y>0&&(b===0||(FLAGS[b]&F_LIQUID)||(FLAGS[b]&F_REPL)&&!(FLAGS[b]&F_SOLID))){setV(x,y,z,0);spawnFallingBlock(x,y,z,v);}}});
/* ---------------- plants, soil ---------------- */
const lightAt=(x,y,z)=>{const l=getLight(x,y,z);return l<0?0:Math.max((l>>4)-skyDarken(),l&15);};
const rawBlockLight=(x,y,z)=>{const l=getLight(x,y,z);return l<0?0:(l&15);};
beh(B.GRASS_BLOCK,{randomTick(x,y,z,v){
  const a=getV(x,y+1,z);if(a<0)return;
  if(a>0&&(FLAGS[a]&F_OPAQUE)||(a>0&&(FLAGS[a]&F_LIQUID))){setV(x,y,z,B.DIRT);return;}
  if(lightAt(x,y+1,z)>=9)for(let i=0;i<4;i++){const nx=x+randInt(-1,1),ny=y+randInt(-3,1),nz=z+randInt(-1,1);
    if(getV(nx,ny,nz)===B.DIRT){const aa=getV(nx,ny+1,nz);if(aa>=0&&!(aa>0&&(FLAGS[aa]&F_OPAQUE))&&lightAt(nx,ny+1,nz)>=4)setV(nx,ny,nz,B.GRASS_BLOCK);}}},
  onNeighbor(x,y,z,v){const a=getV(x,y+1,z);const snowy=(a&255)===B.SNOW||(a&255)===B.SNOW_BLOCK?1:0;if(a>=0&&((v>>8)&1)!==snowy)setV(x,y,z,V(B.GRASS_BLOCK,snowy),0);}});
beh(B.MYCELIUM,{randomTick(x,y,z){const a=getV(x,y+1,z);if(a>0&&(FLAGS[a]&F_OPAQUE)){setV(x,y,z,B.DIRT);return;}
  const nx=x+randInt(-1,1),ny=y+randInt(-3,1),nz=z+randInt(-1,1);if(getV(nx,ny,nz)===B.DIRT&&getV(nx,ny+1,nz)===0)setV(nx,ny,nz,B.MYCELIUM);}});
function waterNear(x,y,z,r=4){for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(let dy=0;dy<=1;dy++){const v=getV(x+dx,y+dy,z+dz);if(v>0&&(v&255)===B.WATER)return true;}return false;}
beh(B.FARMLAND,{
  randomTick(x,y,z,v){const m=(v>>8)&7;const wet=waterNear(x,y,z)||(world.weather.rain&&skyVisible(x,y+1,z));
    if(wet){if(m<7)setV(x,y,z,V(B.FARMLAND,7),0);}
    else if(m>0)setV(x,y,z,V(B.FARMLAND,m-1),0);
    else{const a=getId(x,y+1,z);if(![B.WHEAT,B.CARROTS,B.POTATOES].includes(a))setV(x,y,z,B.DIRT);}},
  onNeighbor(x,y,z,v){const a=getV(x,y+1,z);if(a>0&&(FLAGS[a]&F_SOLID)&&(FLAGS[a]&F_CUBE))setV(x,y,z,B.DIRT);}});
function trampleFarmland(x,y,z,fall){if(fall>0.5&&getId(x,y,z)===B.FARMLAND&&Math.random()<fall-0.5){setV(x,y,z,B.DIRT);}}
for(const id of [B.WHEAT,B.CARROTS,B.POTATOES])beh(id,{randomTick(x,y,z,v){
  const age=(v>>8)&7;if(age>=7||lightAt(x,y,z)<9)return;const fl=getV(x,y-1,z);const wet=((fl>>8)&7)>0;
  if(Math.random()<(wet?1/3:1/8))setV(x,y,z,V(id,age+1),0);}});
function growCrop(x,y,z,v,amount){const id=v&255,age=(v>>8)&7;if(age>=7)return false;setV(x,y,z,V(id,Math.min(7,age+amount)),0);return true;}
beh(B.SAPLING,{randomTick(x,y,z,v){if(lightAt(x,y+1,z)>=9&&Math.random()<1/7)growSapling(x,y,z,v);}});
function growSapling(x,y,z,v){
  const s=v>>8;if(!(s&8)){setV(x,y,z,V(B.SAPLING,s|8),0);return true;}
  const wood=s&7;const kind=['oak','birch','spruce','jungle','acacia','cherry','pale_oak','mangrove'][wood];
  // check headroom
  for(let yy=1;yy<=6;yy++){const a=getV(x,y+yy,z);if(a!==0&&!(a>0&&(FLAGS[a]&F_REPL))&&!(DEF[a&255]&&DEF[a&255].key.endsWith('leaves')))return false;}
  const writes=[];const put=(px,py,pz,pv,mode)=>{const cur=getV(px,py,pz);if(cur<0)return;
    if(mode===1||cur===0||(FLAGS[cur]&F_REPL)&&!(FLAGS[cur]&F_LIQUID)||(mode===2&&DEF[cur&255].key.endsWith('leaves')))writes.push([px,py,pz,pv]);};
  setV(x,y,z,0,0);
  S.TREES[kind](Math.random,x,y-1,z,put);
  for(const [px,py,pz,pv] of writes){if(px===x&&py===y-1&&pz===z)continue;setV(px,py,pz,pv);}
  return true;
}
beh(B.SUGAR_CANE,{randomTick(x,y,z,v){if(getV(x,y+1,z)!==0)return;let h=1;while(getId(x,y-h,z)===B.SUGAR_CANE)h++;if(h>=3)return;
  const age=(v>>8)&15;if(age>=15){setV(x,y+1,z,B.SUGAR_CANE);setV(x,y,z,B.SUGAR_CANE,0);}else setV(x,y,z,V(B.SUGAR_CANE,age+1),0);}});
beh(B.CACTUS,{randomTick(x,y,z,v){if(getV(x,y+1,z)!==0)return;let h=1;while(getId(x,y-h,z)===B.CACTUS)h++;if(h>=3)return;
  const age=(v>>8)&15;if(age>=15){if(canSurvive(x,y+1,z,B.CACTUS))setV(x,y+1,z,B.CACTUS);setV(x,y,z,B.CACTUS,0);}else setV(x,y,z,V(B.CACTUS,age+1),0);},
  onEntityInside(e){e.hurt(DMG.cactus,1);}});
for(const id of [B.BROWN_MUSHROOM,B.RED_MUSHROOM])beh(id,{randomTick(x,y,z,v){if(Math.random()>0.04)return;let n=0;
  for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++)for(let dy=-1;dy<=1;dy++)if(getId(x+dx,y+dy,z+dz)===id)n++;if(n>=5)return;
  const nx=x+randInt(-1,1),ny=y+randInt(-1,1),nz=z+randInt(-1,1);if(getV(nx,ny,nz)===0&&canSurvive(nx,ny,nz,id)&&lightAt(nx,ny,nz)<13)setV(nx,ny,nz,id);}});
beh(B.ICE,{randomTick(x,y,z){if(rawBlockLight(x,y+1,z)>11||world.dim===1)setV(x,y,z,world.dim===1?0:B.WATER);}});
beh(B.SNOW,{randomTick(x,y,z){if(rawBlockLight(x,y,z)>11)destroyBlock(x,y,z,false,null,false);}});
beh(B.VINE,{randomTick(x,y,z,v){if(Math.random()>0.15)return;const b=getV(x,y-1,z);if(b===0)setV(x,y-1,z,V(B.VINE,(v>>8)&15));},
  onNeighbor(x,y,z,v){let s=(v>>8)&15,keep=0;for(let h=0;h<4;h++)if(s&(1<<h)){const [dx,dz]=HVEC[h];const w=getV(x+dx,y,z+dz);if(w<0||sturdy(w)||(w&255)===B.VINE||DEF[w&255].key.endsWith('leaves'))keep|=1<<h;}
    const up=getV(x,y+1,z);if(!keep&&!(up>0&&((up&255)===B.VINE||sturdy(up)||DEF[up&255].key.endsWith('leaves'))))destroyBlock(x,y,z,false,null,false);else if(keep!==s&&keep)setV(x,y,z,V(B.VINE,keep),0);}});
/* ---------------- leaves (distance-based decay) ---------------- */
const LEAF_IDS=new Set(S.WOOD_LEAVES);
const isLog=id=>S.WOOD_LOG.includes(id)||id===B.CRIMSON_STEM||id===B.WARPED_STEM;
for(const id of LEAF_IDS)beh(id,{
  onNeighbor(x,y,z){scheduleTick(x,y,z,1,id);},
  onTick(x,y,z,v){let dist=7;for(let f=0;f<6;f++){const d=FDIR[f];const n=getV(x+d[0],y+d[1],z+d[2]);if(n<0){dist=Math.min(dist,1);continue;}
      const nid=n&255;if(isLog(nid)){dist=1;break;}if(LEAF_IDS.has(nid))dist=Math.min(dist,((n>>9)&7)+1);}
    dist=Math.min(7,dist);const s=v>>8,nd=(s&1)|(dist<<1);if(nd!==s)setV(x,y,z,V(id,nd));},
  randomTick(x,y,z,v){const s=v>>8;if(!(s&1)&&((s>>1)&7)>=7)destroyBlock(x,y,z,true,null,false);}});
/* ---------------- fire ---------------- */
const FLAM=id=>DEF[id]?DEF[id].flammable||0:0,BURN=id=>DEF[id]?DEF[id].burn||0:0;
function fireCanStay(x,y,z){const b=getV(x,y-1,z);if(b<0)return true;if(solidTop(b))return true;for(let f=0;f<6;f++){const d=FDIR[f];if(FLAM(getId(x+d[0],y+d[1],z+d[2]))>0)return true;}return false;}
beh(B.FIRE,{
  onPlace(x,y,z){scheduleTick(x,y,z,30+randInt(0,10),B.FIRE);},
  onNeighbor(x,y,z){if(!fireCanStay(x,y,z))setV(x,y,z,0);},
  onTick(x,y,z,v){
    if(!world.rules.doFireTick)return;
    const below=getId(x,y-1,z),eternal=below===B.NETHERRACK||below===B.MAGMA_BLOCK;
    if(!fireCanStay(x,y,z)){setV(x,y,z,0);return;}
    if(!eternal&&world.weather.rain&&skyVisible(x,y,z)&&Math.random()<0.6){setV(x,y,z,0);return;}
    let age=(v>>8)&15;age=Math.min(15,age+randInt(0,1));setV(x,y,z,V(B.FIRE,age),0);
    scheduleTick(x,y,z,30+randInt(0,10),B.FIRE);
    if(!eternal){let fl=false;for(let f=0;f<6;f++){const d=FDIR[f];if(FLAM(getId(x+d[0],y+d[1],z+d[2]))>0)fl=true;}
      if(!fl&&(age>3||!solidTop(getV(x,y-1,z)))){setV(x,y,z,0);return;}if(age===15&&Math.random()<0.25&&!FLAM(below)){setV(x,y,z,0);return;}}
    for(let f=0;f<6;f++){const d=FDIR[f],nx=x+d[0],ny=y+d[1],nz=z+d[2],nid=getId(nx,ny,nz);if(nid<=0)continue;const bo=BURN(nid);
      if(bo&&Math.random()*(f===2||f===3?250:300)<bo){if(DEF[nid].tnt){setV(nx,ny,nz,0);spawnPrimedTnt(nx,ny,nz,40);}
        else if(Math.random()<(age+10)/30&&!world.weather.rain)setV(nx,ny,nz,V(B.FIRE,Math.min(15,age+randInt(0,4))));else setV(nx,ny,nz,0);}}
    for(let i=0;i<3;i++){const nx=x+randInt(-1,1),ny=y+randInt(-1,2),nz=z+randInt(-1,1);if(getV(nx,ny,nz)!==0)continue;let odds=0;
      for(let f=0;f<6;f++){const d=FDIR[f];odds=Math.max(odds,FLAM(getId(nx+d[0],ny+d[1],nz+d[2])));}
      if(odds>0&&Math.random()*100<odds*(ny>y+1?0.5:1)*(world.difficulty+1)/3)setV(nx,ny,nz,V(B.FIRE,Math.min(15,age+randInt(0,3))));}
  },
  onEntityInside(e){e.setFire(8);e.hurt(DMG.inFire,1);}});
function igniteNear(x,y,z){for(let i=0;i<3;i++){const nx=x+randInt(-1,1),ny=y+1+randInt(0,1),nz=z+randInt(-1,1);if(getV(nx,ny,nz)!==0)continue;
  for(let f=0;f<6;f++){const d=FDIR[f];if(FLAM(getId(nx+d[0],ny+d[1],nz+d[2]))>0){setV(nx,ny,nz,B.FIRE);return;}}}}
function tryIgnite(x,y,z,face){ // flint & steel / fire charge on a block face
  const d=FDIR[face],tx=x+d[0],ty=y+d[1],tz=z+d[2];const hit=getV(x,y,z);
  if(hit>0&&DEF[hit&255].tnt){setV(x,y,z,0);spawnPrimedTnt(x,y,z,80);return true;}
  if(getV(tx,ty,tz)!==0)return false;
  if(tryCreatePortal(tx,ty,tz))return true;
  if(!fireCanStay(tx,ty,tz)&&!solidTop(getV(tx,ty-1,tz)))return false;
  setV(tx,ty,tz,B.FIRE);return true;
}
/* ---------------- TNT ---------------- */
beh(B.TNT,{onNeighbor(x,y,z){if(redstonePowerAt(x,y,z)>0){setV(x,y,z,0);spawnPrimedTnt(x,y,z,80);}}});
/* ---------------- portals ---------------- */
function tryCreatePortal(x,y,z){
  for(const axis of [0,1]){const [dx,dz]=axis?[0,1]:[1,0];
    // find frame bottom-left
    let by=y;while(by>0&&getV(x,by-1,z)===0)by--;if(getV(x,by-1,z)!==B.OBSIDIAN)continue;
    let lx=x,lz=z;let n=0;while(getV(lx-dx,by,lz-dz)===0&&n<22){lx-=dx;lz-=dz;n++;}if(getV(lx-dx,by,lz-dz)!==B.OBSIDIAN)continue;
    let w=0;while(getV(lx+dx*w,by,lz+dz*w)===0&&w<22)w++;if(w<2||w>21||getV(lx+dx*w,by,lz+dz*w)!==B.OBSIDIAN)continue;
    let h=0;while(h<22&&getV(lx,by+h,lz)===0)h++;if(h<3||h>21)continue;
    let ok=true;
    for(let i=0;i<w&&ok;i++){if(getV(lx+dx*i,by-1,lz+dz*i)!==B.OBSIDIAN||getV(lx+dx*i,by+h,lz+dz*i)!==B.OBSIDIAN)ok=false;
      for(let j=0;j<h&&ok;j++)if(getV(lx+dx*i,by+j,lz+dz*i)!==0)ok=false;}
    for(let j=0;j<h&&ok;j++)if(getV(lx-dx,by+j,lz-dz)!==B.OBSIDIAN||getV(lx+dx*w,by+j,lz+dz*w)!==B.OBSIDIAN)ok=false;
    if(!ok)continue;
    for(let i=0;i<w;i++)for(let j=0;j<h;j++)setV(lx+dx*i,by+j,lz+dz*i,V(B.NETHER_PORTAL,axis),0);
    registerPortal(world.dim,lx+dx*Math.floor(w/2),by,lz+dz*Math.floor(w/2),axis);sfx.play('portal',x,y,z);return true;
  }
  return false;
}
beh(B.NETHER_PORTAL,{onNeighbor(x,y,z,v){const ax=(v>>8)&1,[dx,dz]=ax?[0,1]:[1,0];
  for(const [ox,oy,oz] of [[dx,0,dz],[-dx,0,-dz],[0,1,0],[0,-1,0]]){const n=getV(x+ox,y+oy,z+oz);if(n<0)continue;if(n!==B.OBSIDIAN&&(n&255)!==B.NETHER_PORTAL){setV(x,y,z,0);return;}}},
  onEntityInside(e){e.portalTicks=(e.portalTicks||0)+1;e.inPortal='nether';}});
beh(B.END_PORTAL,{onEntityInside(e){e.inPortal='end';e.portalTicks=999;}});
function registerPortal(dim,x,y,z,axis){const L=world.portals[dim]||(world.portals[dim]=[]);if(!L.some(p=>Math.abs(p.x-x)<4&&Math.abs(p.z-z)<4&&Math.abs(p.y-y)<4))L.push({x,y,z,axis});world.metaDirty=true;}
function checkEndPortal(x,y,z){ // after inserting an eye: look for a complete 12-frame ring with eyes around a 3x3 hole
  for(let cx=x-4;cx<=x+4;cx++)for(let cz=z-4;cz<=z+4;cz++){
    let ok=true;
    for(let a=-1;a<=1&&ok;a++){for(const [fx,fz] of [[cx+a,cz-2],[cx+a,cz+2],[cx-2,cz+a],[cx+2,cz+a]]){const v=getV(fx,y,fz);if((v&255)!==B.END_PORTAL_FRAME||!((v>>8)&4)){ok=false;break;}}}
    if(!ok)continue;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)setV(cx+a,y,cz+b,B.END_PORTAL,0);
    sfx.play('portal_open',cx,y,cz);toast('The End portal opens…');return true;
  }
  return false;
}
/* ---------------- doors / trapdoors / beds ---------------- */
// door state: facing(0..3) | open 4 | upper 8 | hinge 16 | powered 32
for(const id of [B.OAK_DOOR,B.IRON_DOOR])beh(id,{
  onNeighbor(x,y,z,v){const s=v>>8,upper=s&8,oy=upper?y-1:y+1,o=getV(x,oy,z);
    if(o>=0&&(o&255)!==id){setV(x,y,z,0);return;}
    if(upper){queueUpdate(x,y-1,z,x,y,z);return;}
    if(!canSurviveDoor(x,y,z)){destroyBlock(x,y,z,true,null,false);return;}
    const pw=redstonePowerAt(x,y,z)>0||redstonePowerAt(x,y+1,z)>0,was=!!(s&32);
    if(pw!==was){setV(x,y,z,V(id,pw?(s|32):(s&~32)),SET_NO_CALLBACKS);setDoor(x,y,z,pw);}},
  onPlace(x,y,z,v){const s=v>>8;if(!(s&8)&&getV(x,y+1,z)===0)setV(x,y+1,z,V(id,s|8),SET_NO_CALLBACKS);}});
const canSurviveDoor=(x,y,z)=>{const b=getV(x,y-1,z);return b<0||solidTop(b);};
function setDoor(x,y,z,open){const v=getV(x,y,z);if(v<0)return;const id=v&255,s=v>>8;if(!!(s&4)===open)return;const ns=open?(s|4):(s&~4);
  setV(x,y,z,V(id,ns),SET_NO_CALLBACKS|SET_NOTIFY);const u=getV(x,y+1,z);if((u&255)===id)setV(x,y+1,z,V(id,(u>>8)&~4|(open?4:0)),SET_NO_CALLBACKS);
  sfx.play(open?'door_open':'door_close',x,y,z);}
beh(B.OAK_DOOR,{onUse(x,y,z,v){const s=v>>8,ly=(s&8)?y-1:y;const lv=getV(x,ly,z);setDoor(x,ly,z,!((lv>>8)&4));return true;}});
// trapdoor state: facing(0..3) | open 4 | top 8 | powered 16
beh(B.OAK_TRAPDOOR,{onUse(x,y,z,v){setV(x,y,z,V(B.OAK_TRAPDOOR,(v>>8)^4));sfx.play(((v>>8)&4)?'door_close':'door_open',x,y,z);return true;},
  onNeighbor(x,y,z,v){const s=v>>8,pw=redstonePowerAt(x,y,z)>0,was=!!(s&16);
    if(pw!==was){const ns=pw?(s|16|4):((s&~16)&~4);setV(x,y,z,V(B.OAK_TRAPDOOR,ns),SET_NO_CALLBACKS);sfx.play(pw?'door_open':'door_close',x,y,z);}}});
beh(B.BED,{onNeighbor(x,y,z,v){const s=v>>8,[dx,dz]=HVEC[s&3],sg=(s&4)?-1:1;const o=getV(x+dx*sg,y,z+dz*sg);if(o>=0&&(o&255)!==B.BED)setV(x,y,z,0);},
  onPlace(x,y,z,v){const s=v>>8;if(s&4)return;const [dx,dz]=HVEC[s&3];if(getV(x+dx,y,z+dz)===0||replaceable(getV(x+dx,y,z+dz)))setV(x+dx,y,z+dz,V(B.BED,(s&3)|4),SET_NO_CALLBACKS);},
  onUse(x,y,z,v){trySleep(x,y,z,v);return true;}});
beh(B.RAIL,{onPlace(x,y,z){for(const [dx,dz] of HVEC){const n=getV(x+dx,y,z+dz);if((n&255)===B.RAIL){const sh=railShape(x+dx,y,z+dz,(n>>8)&7);if(sh!==((n>>8)&7))setV(x+dx,y,z+dz,V(B.RAIL,sh),0);}}
  const sh=railShape(x,y,z,(getV(x,y,z)>>8)&7);if(sh!==((getV(x,y,z)>>8)&7))setV(x,y,z,V(B.RAIL,sh),0);}});
beh(B.MAGMA_BLOCK,{onStep(e){if(!e.sneaking&&!e.fireImmune)e.hurt(DMG.hotFloor,1);}});
beh(B.COBWEB,{onEntityInside(e){e.inWeb=true;}});
/* ---------------- block use (right click) ---------------- */
beh(B.CRAFTING_TABLE,{onUse(){openCrafting(3);return true;}});
beh(B.CHEST,{onUse(x,y,z,v){openChest(x,y,z,v);return true;}});
beh(B.FURNACE,{onUse(x,y,z){openFurnace(x,y,z);return true;},onPlace(x,y,z){makeBE(x,y,z,'furnace');}});
beh(B.ENCHANTING_TABLE,{onUse(x,y,z){openEnchanting(x,y,z);return true;}});
beh(B.END_PORTAL_FRAME,{onUse(x,y,z,v,stack){if(!stack||stack.id!==I.EYE_OF_ENDER||((v>>8)&4))return false;setV(x,y,z,V(B.END_PORTAL_FRAME,(v>>8)|4),0);
  consumeHeld(1);sfx.play('eye_place',x,y,z);checkEndPortal(x,y,z);return true;}});
beh(B.SPAWNER,{onPlace(x,y,z){makeBE(x,y,z,'spawner');}});
