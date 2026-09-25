/* =====================================================================
   MOBS: Mob base (goals + A* navigation), mob definitions & models,
   natural spawning / despawning, chunk population
   ===================================================================== */
/* ---------------- navigation (A* on block grid) ---------------- */
function passable(x,y,z){const v=getV(x,y,z);if(v<0)return false;if(v===0)return true;const f=FLAGS[v],id=v&255;
  if(id===B.LAVA||id===B.FIRE||id===B.CACTUS||id===B.COBWEB||id===B.NETHER_PORTAL)return false;
  if(f&F_SOLID){const bs=S.collisionBoxes(v,(dx,dy,dz)=>getV(x+dx,y+dy,z+dz));for(const b of bs)if(b[4]>3)return false;return true;}return true;}
function floorOk(x,y,z,mob){const v=getV(x,y-1,z);if(v<0)return false;const id=v&255;
  if(id===B.LAVA||id===B.MAGMA_BLOCK&&!mob.fireImmune||id===B.CACTUS||id===B.FIRE)return false;
  if(FLAGS[v]&F_LIQUID)return id===B.WATER;
  if(DEF[id].model==='fence'||DEF[id].model==='wall')return false;
  return !!(FLAGS[v]&F_SOLID)||(FLAGS[v]&F_CLIMB);}
function standable(x,y,z,mob){const hh=Math.ceil(mob.h);for(let i=0;i<hh;i++)if(!passable(x,y+i,z))return false;return floorOk(x,y,z,mob);}
function findPath(mob,tx,ty,tz,maxNodes=500){
  const sx=Math.floor(mob.pos[0]),sy=Math.floor(mob.pos[1]+0.01),sz=Math.floor(mob.pos[2]);
  tx=Math.floor(tx);ty=Math.floor(ty);tz=Math.floor(tz);
  const key=(x,y,z)=>((x-sx+512)*1024+(z-sz+512))*512+(y+128);
  const open=[],came=new Map(),g=new Map();
  const h=(x,y,z)=>Math.hypot(x-tx,(y-ty)*1.5,z-tz);
  const push=n=>{open.push(n);let i=open.length-1;while(i>0){const p=(i-1)>>1;if(open[p].f>n.f){open[i]=open[p];open[p]=n;i=p;}else break;}};
  const pop=()=>{const t=open[0],l=open.pop();if(open.length){open[0]=l;let i=0;for(;;){const a=i*2+1,b=a+1;let m=i;if(a<open.length&&open[a].f<open[m].f)m=a;if(b<open.length&&open[b].f<open[m].f)m=b;if(m===i)break;[open[i],open[m]]=[open[m],open[i]];i=m;}}return t;};
  push({x:sx,y:sy,z:sz,f:h(sx,sy,sz)});g.set(key(sx,sy,sz),0);
  let best=null,bestH=1e9,n=0;
  while(open.length&&n<maxNodes){
    const c=pop();n++;const ck=key(c.x,c.y,c.z),cg=g.get(ck);
    const hh=h(c.x,c.y,c.z);if(hh<bestH){bestH=hh;best=c;}
    if(c.x===tx&&c.z===tz&&Math.abs(c.y-ty)<=1){best=c;break;}
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz)continue;
      if(dx&&dz&&(!passable(c.x+dx,c.y,c.z)||!passable(c.x,c.y,c.z+dz)||!passable(c.x+dx,c.y+1,c.z)||!passable(c.x,c.y+1,c.z+dz)))continue;
      const nx=c.x+dx,nz=c.z+dz;let ny=null;
      if(standable(nx,c.y,nz,mob))ny=c.y;
      else if(standable(nx,c.y+1,nz,mob)&&passable(c.x,c.y+Math.ceil(mob.h),c.z)&&!(dx&&dz))ny=c.y+1;
      else{for(let d=1;d<=3;d++){if(!passable(nx,c.y-d+1,nz))break;if(standable(nx,c.y-d,nz,mob)){ny=c.y-d;break;}}}
      if(ny===null)continue;
      let cost=(dx&&dz)?1.414:1;if(ny!==c.y)cost+=0.5;
      const wv=getV(nx,ny,nz);if(wv>0&&(FLAGS[wv]&F_LIQUID))cost+=3;
      for(const [ax,az] of HVEC)if(getId(nx+ax,ny,nz+az)===B.CACTUS||getId(nx+ax,ny-1,nz+az)===B.LAVA)cost+=4;
      const nk=key(nx,ny,nz),ng=cg+cost;
      if(ng<(g.get(nk)??1e9)){g.set(nk,ng);came.set(nk,c);push({x:nx,y:ny,z:nz,f:ng+h(nx,ny,nz)});}
    }
  }
  if(!best)return null;
  const path=[];let c=best;while(c){path.push([c.x,c.y,c.z]);c=came.get(key(c.x,c.y,c.z));}
  path.reverse();if(path.length)path.shift();
  return path;
}
/* ---------------- Mob ---------------- */
const MOBS={};
class Mob extends LivingEntity{
  constructor(type){const d=MOBS[type];super(type,d.w,d.h,d.hp);this.def=d;this.goals=[];this.target=null;this.path=null;this.pathT=0;this.pathGoal=null;
    this.moveX=0;this.moveZ=0;this.wantJump=false;this.speedMul=1;this.lookAt=null;this.walkPhase=0;this.anger=0;this.baby=false;this.inLove=0;this.stuck=0;this.lastPos=[0,0,0];
    this.fireImmune=!!d.fireImmune;this.noFall=!!d.flying;this.noGravity=!!d.flying;this.persistent=d.category!=='monster';this.sheared=false;this.fuse=-1;this.variant=0;
    if(d.init)d.init(this);}
  displayName(){return this.def.name;}
  eyeH(){return this.h*0.85;}
  navigateTo(x,y,z,speed=1){
    const px=Math.floor(x),py=Math.floor(y),pz=Math.floor(z);
    if(this.pathGoal&&this.pathGoal[0]===px&&this.pathGoal[2]===pz&&this.path&&this.pathT>0){this.speedMul=speed;return !!this.path;}
    this.pathGoal=[px,py,pz];this.pathT=30+((Math.random()*20)|0);this.path=this.def.flying?[[px,py,pz]]:findPath(this,x,y,z,this.def.category==='monster'?700:300);this.speedMul=speed;
    return !!(this.path&&this.path.length);
  }
  stopNav(){this.path=null;this.pathGoal=null;this.moveX=this.moveZ=0;}
  followPath(){
    if(!this.path||!this.path.length){this.moveX=this.moveZ=0;return false;}
    const n=this.path[0],cx=n[0]+0.5,cz=n[2]+0.5,dx=cx-this.pos[0],dz=cz-this.pos[2],d=Math.hypot(dx,dz);
    if(d<0.35&&Math.abs(this.pos[1]-n[1])<1.2){this.path.shift();return this.followPath();}
    this.moveX=dx/d;this.moveZ=dz/d;
    if(this.def.flying){this.flyY=n[1]+0.5;}
    else if(n[1]>Math.floor(this.pos[1]+0.01)&&d<1.4)this.wantJump=true;
    return true;
  }
  canSee(e){const a=[this.pos[0],this.pos[1]+this.eyeH(),this.pos[2]],b=[e.pos[0],e.pos[1]+e.eyeH(),e.pos[2]];
    const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],l=Math.hypot(...d);if(l>96)return false;const h=raycastBlocks(a,[d[0]/l,d[1]/l,d[2]/l],l,false);return !h||h.t>=l-0.5;}
  distTo(e){return Math.hypot(e.pos[0]-this.pos[0],e.pos[1]-this.pos[1],e.pos[2]-this.pos[2]);}
  tick(){
    this.age++;this.prevYaw=this.yaw;
    if(!this.chunkLoaded())return;
    if(this.dead){this.deathTime++;if(this.deathTime>=20)this.remove();return;}
    // AI
    this.wantJump=false;
    for(const g of this.goals){if(g.canUse(this)){g.tick(this);if(g.exclusive)break;}}
    if(this.path)this.followPath();
    if(this.pathT>0)this.pathT--;
    // stuck detection
    if(this.age%40===0){const mv=Math.hypot(this.pos[0]-this.lastPos[0],this.pos[2]-this.lastPos[2]);if(this.path&&this.path.length&&mv<0.3){this.stopNav();}this.lastPos=this.pos.slice();}
    this.physics(TICK);
    if(this.def.onTick)this.def.onTick(this);
    this.tickLiving();
  }
  physics(dt){
    let sp=this.def.speed*this.speedMul*(this.baby?1.3:1);
    const spd=this.effectAmp('speed'),slo=this.effectAmp('slowness');if(spd>=0)sp*=1+0.2*(spd+1);if(slo>=0)sp*=Math.max(0,1-0.15*(slo+1));
    const under=this.blockUnder();if(under>0&&DEF[under&255].speed)sp*=DEF[under&255].speed;
    if(this.inWater)sp*=0.5;
    const tx=this.moveX*sp,tz=this.moveZ*sp;
    if(this.moveX||this.moveZ){const ty=Math.atan2(-this.moveX,-this.moveZ);let d=ty-this.yaw;while(d>Math.PI)d-=2*Math.PI;while(d<-Math.PI)d+=2*Math.PI;this.yaw+=d*0.35;}
    const k=this.onGround||this.def.flying?0.5:(this.inWater?0.2:0.08);
    if(this.hurtTime<6){this.vel[0]+=(tx-this.vel[0])*k;this.vel[2]+=(tz-this.vel[2])*k;}
    else{this.vel[0]*=0.9;this.vel[2]*=0.9;}
    if(this.def.flying){const ty=this.flyY!==undefined?(this.flyY-this.pos[1])*2:0;this.vel[1]+=(clamp(ty,-2,2)-this.vel[1])*0.2;}
    else if(this.inWater||this.inLava){this.vel[1]=this.vel[1]*0.8-4*dt;if(this.wantJump||this.def.floats!==false)this.vel[1]+=(this.def.floats===false?0:18)*dt;this.vel[1]=clamp(this.vel[1],-3,2.5);}
    else{this.vel[1]=Math.max(this.vel[1]-32*dt,-60);if(this.climbing||(this.def.climber&&this.hitH&&(this.moveX||this.moveZ)))this.vel[1]=Math.max(this.vel[1],2.5);}
    if(this.wantJump&&this.onGround)this.vel[1]=8.6*(under>0&&DEF[under&255].jump?DEF[under&255].jump:1);
    if(this.hitH&&this.onGround&&(this.moveX||this.moveZ)&&!this.def.flying)this.vel[1]=8.6;
    this.move(this.vel[0]*dt,this.vel[1]*dt,this.vel[2]*dt);
    this.walkPhase+=Math.hypot(this.vel[0],this.vel[2])*dt*3.2;
  }
  onHurt(src,amount,attacker){
    sfx.mob(this,'hurt');this.panic=100;
    if(attacker&&attacker.living&&attacker!==this&&this.def.category==='monster')this.target=attacker;
    if(this.def.onHurt)this.def.onHurt(this,src,attacker);
  }
  onDeath(src,attacker){
    sfx.mob(this,'death');
    const byPlayer=attacker===player||(src.attacker===player);
    if(!this.baby){const looting=byPlayer?enchLvl(player.held(),'looting'):0;
      for(const [key,a,b] of this.def.drops||[]){let id=I[key.toUpperCase()];if((this.fireTicks>0)&&ITEM[I['COOKED_'+key.toUpperCase()]])id=I['COOKED_'+key.toUpperCase()];
        if(key==='white_wool'&&this.sheared)continue;const n=randInt(a,b+looting);if(n>0&&id)dropItemAt(this.pos[0],this.pos[1]+0.5,this.pos[2],mkStack(id,n));}
      if(byPlayer)for(const [key,p] of this.def.rare||[])if(Math.random()<p+looting*0.01)dropItemAt(this.pos[0],this.pos[1]+0.5,this.pos[2],mkStack(I[key.toUpperCase()],1));
      for(const s of this.armor)if(s&&Math.random()<0.085)dropItemAt(this.pos[0],this.pos[1]+0.5,this.pos[2],s);
      if(this.hand&&Math.random()<0.085)dropItemAt(this.pos[0],this.pos[1]+0.5,this.pos[2],this.hand);
      if(byPlayer&&this.def.xp)spawnXP(this.pos[0],this.pos[1]+0.5,this.pos[2],typeof this.def.xp==='function'?this.def.xp(this):this.def.xp);}
    if(byPlayer)advance('kill_'+(this.def.category==='monster'?'monster':'animal'));
    if(this.def.onDeath)this.def.onDeath(this,src,attacker);
  }
  save(){const o=super.save();this.saveLiving(o);o.baby=this.baby;o.sheared=this.sheared;o.variant=this.variant;o.persistent=this.persistent;o.anger=this.anger>0?1:0;return o;}
  load(o){super.load(o);this.loadLiving(o);this.baby=!!o.baby;this.sheared=!!o.sheared;this.variant=o.variant|0;this.persistent=!!o.persistent||this.def.category!=='monster';if(this.baby){this.w*=0.5;this.h*=0.5;}}
  interact(stack){if(this.def.interact)return this.def.interact(this,stack);return false;}
}
/* ---------------- goals ---------------- */
const G={
  float:{canUse:m=>m.inWater||m.inLava,tick:m=>{m.wantJump=true;}},
  panic:{exclusive:true,canUse:m=>m.panic>0,tick:m=>{m.panic--;if(!m.path||!m.path.length){const a=Math.random()*6.28;m.navigateTo(m.pos[0]+Math.cos(a)*8,m.pos[1],m.pos[2]+Math.sin(a)*8,1.7);}}},
  breed:{exclusive:true,canUse:m=>m.inLove>0&&!m.baby,tick:m=>{m.inLove--;const mate=world.entities.find(e=>e!==m&&e.type===m.type&&e.inLove>0&&!e.baby&&m.distTo(e)<8);
    if(!mate)return;if(m.distTo(mate)>1.5)m.navigateTo(...mate.pos,1);else{m.inLove=mate.inLove=0;const b=spawnMob(m.type,m.pos[0],m.pos[1],m.pos[2]);if(b){b.baby=true;b.w*=0.5;b.h*=0.5;b.growUp=24000;}spawnXP(m.pos[0],m.pos[1]+0.5,m.pos[2],randInt(1,7));advance('breed');}}},
  tempt:{canUse:m=>{const h=player.held();return player.alive()&&h&&m.def.tempt&&m.def.tempt.includes(itemKey(h.id))&&m.distTo(player)<10;},tick:m=>{if(m.distTo(player)>2)m.navigateTo(...player.pos,1.2);else m.stopNav();m.lookAt=player;}},
  eatGrass:{canUse:m=>m.sheared&&Math.random()<0.002,tick:m=>{const x=Math.floor(m.pos[0]),y=Math.floor(m.pos[1]-0.5),z=Math.floor(m.pos[2]);
    if(getId(x,y+1,z)===B.SHORT_GRASS){setV(x,y+1,z,0);m.sheared=false;}else if(getId(x,y,z)===B.GRASS_BLOCK){setV(x,y,z,B.DIRT);m.sheared=false;}}},
  wander:{canUse:m=>!m.target&&(!m.path||!m.path.length)&&Math.random()<(m.def.flying?0.03:0.008),tick:m=>{
    for(let i=0;i<4;i++){const a=Math.random()*6.28,r=3+Math.random()*7,x=m.pos[0]+Math.cos(a)*r,z=m.pos[2]+Math.sin(a)*r;
      if(m.def.flying){m.navigateTo(x,m.pos[1]+randInt(-3,3),z,0.8);return;}
      const h=heightAt(Math.floor(x),Math.floor(z));if(h<0)continue;const ty=Math.abs(h+1-m.pos[1])<6?h+1:m.pos[1];if(m.navigateTo(x,ty,z,0.8))return;}}},
  lookPlayer:{canUse:m=>player.alive()&&m.distTo(player)<8&&Math.random()<0.02,tick:m=>{m.lookAt=player;}},
  targetPlayer:{canUse:m=>{if(m.target&&(!m.target.alive||m.target.alive())&&m.distTo(m.target)<(m.def.follow||35))return false;
    if(!player.alive()||player.creativeLike()||world.difficulty===0)return false;
    if(m.def.neutral&&!m.anger&&!(m.def.darkHostile&&brightnessAt(m.pos[0],m.pos[1]+1,m.pos[2],daylightNow())<0.5))return false;
    const r=(m.def.follow||16)*(player.hasEffect('invisibility')?0.25:1)*(player.sneaking?0.8:1);if(m.distTo(player)>r)return false;return m.canSee(player);},
    tick:m=>{m.target=player;}},
  melee:{canUse:m=>m.target&&!m.target.dead&&(!m.target.alive||m.target.alive()),tick:m=>{const t=m.target;const d=m.distTo(t);
    if(d>(m.def.follow||35)||(t===player&&player.creativeLike())){m.target=null;m.stopNav();return;}
    m.lookAt=t;const reach=(m.w+t.w)/2+0.9;
    if(d>reach*0.8)m.navigateTo(t.pos[0],t.pos[1],t.pos[2],m.def.chaseMul||1.2);else{m.moveX=m.moveZ=0;m.path=null;}
    if(m.attackCool>0)m.attackCool--;
    if(d<reach&&Math.abs(t.pos[1]-m.pos[1])<1.5&&m.attackCool<=0){m.attackCool=20;m.swing=6;
      if(t.hurt(mobDmg(m),m.def.attack,m)){if(m.def.onHit)m.def.onHit(m,t);if(m.fireTicks>0&&Math.random()<0.3*world.difficulty)t.setFire(2*world.difficulty);}}}},
  bow:{canUse:m=>m.target&&!m.target.dead,tick:m=>{const t=m.target,d=m.distTo(t);if(d>24||(t===player&&player.creativeLike())){m.target=null;m.stopNav();return;}
    m.lookAt=t;const see=m.canSee(t);
    if(d>12||!see)m.navigateTo(...t.pos,1);else if(d<5){m.stopNav();const a=Math.atan2(m.pos[2]-t.pos[2],m.pos[0]-t.pos[0]);m.moveX=Math.cos(a);m.moveZ=Math.sin(a);}else{m.stopNav();m.moveX=m.moveZ=0;}
    if(m.attackCool>0)m.attackCool--;else if(see&&d<16){m.attackCool=world.difficulty===3?20:40;shootArrow(m,t);}}},
  swell:{exclusive:true,canUse:m=>m.target&&!m.target.dead&&(m.fuse>=0||m.distTo(m.target)<3),tick:m=>{const t=m.target;
    if(m.distTo(t)>7||!m.canSee(t)){m.fuse=-1;return;}if(m.fuse<0){m.fuse=0;sfx.play('hiss',...m.pos);}m.fuse++;m.stopNav();m.lookAt=t;
    if(m.fuse>=30){m.remove();explode(m.pos[0],m.pos[1]+0.5,m.pos[2],m.charged?6:3,false,world.rules.mobGriefing,m);}}},
  fleeSun:{canUse:m=>daylightNow()>0.8&&!m.armor[0]&&m.fireTicks>0&&!m.path,tick:m=>{
    for(let i=0;i<10;i++){const x=Math.floor(m.pos[0]+randInt(-10,10)),z=Math.floor(m.pos[2]+randInt(-10,10));const h=heightAt(x,z);if(h<0)continue;
      for(let y=Math.floor(m.pos[1])+3;y>Math.floor(m.pos[1])-4;y--)if(y<h&&standable(x,y,z,m)){m.navigateTo(x,y,z,1.2);return;}}}},
  ghastShoot:{canUse:m=>player.alive()&&!player.creativeLike()&&m.distTo(player)<64&&world.difficulty>0,tick:m=>{m.lookAt=player;if(m.attackCool>0){m.attackCool--;return;}
    if(m.canSee(player)){m.attackCool=60;shootFireball(m,player,true);}}},
  blazeShoot:{canUse:m=>player.alive()&&!player.creativeLike()&&m.distTo(player)<48&&world.difficulty>0,tick:m=>{m.lookAt=player;m.flyY=player.pos[1]+2.5;
    if(m.distTo(player)>6)m.navigateTo(...player.pos,0.6);if(m.attackCool>0){m.attackCool--;return;}
    if(m.canSee(player)){m.burst=(m.burst||0)+1;if(m.burst<=3){m.attackCool=6;shootFireball(m,player,false);}else{m.burst=0;m.attackCool=100;}}}},
  endermanTele:{canUse:m=>(m.target&&m.distTo(m.target)>12&&Math.random()<0.03)||m.inWater||(daylightNow()>0.8&&skyVisible(Math.floor(m.pos[0]),Math.floor(m.pos[1]+2),Math.floor(m.pos[2]))&&Math.random()<0.01),
    tick:m=>{teleportRandom(m,m.target&&!m.inWater?m.target.pos:null);}},
  endermanStare:{canUse:m=>!m.anger&&player.alive()&&!player.creativeLike()&&m.distTo(player)<64&&!(player.armor[0]&&player.armor[0].id===B.PUMPKIN),tick:m=>{
    const e=eyePos(),f=forwardVec(),h=[m.pos[0]-e[0],m.pos[1]+m.h*0.9-e[1],m.pos[2]-e[2]],l=Math.hypot(...h);const dot=(h[0]*f[0]+h[1]*f[1]+h[2]*f[2])/l;
    if(dot>1-0.025/l*3&&m.canSee(player)){m.anger=600;m.target=player;sfx.play('enderman_scream',...m.pos);}}},
};
function teleportRandom(m,near){for(let i=0;i<16;i++){const bx=near?near[0]:m.pos[0],bz=near?near[2]:m.pos[2];const x=Math.floor(bx+randInt(-16,16)),z=Math.floor(bz+randInt(-16,16));
  for(let y=Math.floor(m.pos[1])+16;y>Math.floor(m.pos[1])-16;y--){if(standable(x,y,z,m)&&getId(x,y-1,z)!==B.WATER){particlesPortal(m.pos);m.setPos(x+0.5,y,z+0.5);particlesPortal(m.pos);sfx.play('teleport',x,y,z);m.stopNav();return true;}}}return false;}
/* ---------------- mob definitions ---------------- */
function mob(key,o){MOBS[key]=Object.assign({key,name:key.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),category:'monster',hp:20,w:0.6,h:1.95,speed:2.4,attack:3,follow:35,xp:5,goals:[]},o);}
const HOSTILE_GOALS=['float','targetPlayer','melee','wander','lookPlayer'];
mob('zombie',{drops:[['rotten_flesh',0,2]],rare:[['iron_ingot',0.025],['carrot',0.025],['potato',0.025]],burns:true,goals:['float','fleeSun',...HOSTILE_GOALS.slice(1)],model:'humanoid',colors:{skin:[0.36,0.6,0.32],shirt:[0.2,0.55,0.62],legs:[0.26,0.26,0.56]},armsOut:true,sound:'zombie'});
mob('husk',{drops:[['rotten_flesh',0,2]],goals:HOSTILE_GOALS,model:'humanoid',colors:{skin:[0.62,0.56,0.4],shirt:[0.5,0.44,0.32],legs:[0.4,0.35,0.26]},armsOut:true,sound:'zombie',
  onHit:(m,t)=>{if(t.addEffect)t.addEffect('hunger',140*world.difficulty,0);}});
mob('skeleton',{speed:2.5,drops:[['bone',0,2],['arrow',0,2]],burns:true,goals:['float','fleeSun','targetPlayer','bow','wander','lookPlayer'],model:'humanoid',thin:true,colors:{skin:[0.78,0.78,0.78],shirt:[0.7,0.7,0.7],legs:[0.66,0.66,0.66]},sound:'skeleton',init:m=>{m.hand=mkStack(I.BOW,1);}});
mob('stray',{speed:2.5,drops:[['bone',0,2],['arrow',0,2]],burns:true,goals:['float','fleeSun','targetPlayer','bow','wander','lookPlayer'],model:'humanoid',thin:true,colors:{skin:[0.7,0.76,0.78],shirt:[0.5,0.6,0.62],legs:[0.46,0.55,0.58]},sound:'skeleton',slowArrows:true,init:m=>{m.hand=mkStack(I.BOW,1);}});
mob('creeper',{speed:2.5,h:1.7,drops:[['gunpowder',0,2]],goals:['float','swell','targetPlayer','melee','wander','lookPlayer'],attack:0,model:'creeper',colors:{skin:[0.35,0.72,0.3]},sound:'creeper'});
mob('spider',{hp:16,w:1.4,h:0.9,speed:3,attack:2,drops:[['string',0,2]],rare:[['spider_eye',0.33]],climber:true,neutral:true,darkHostile:true,goals:['float','targetPlayer','melee','wander','lookPlayer'],model:'spider',colors:{skin:[0.2,0.17,0.15]},sound:'spider'});
mob('enderman',{hp:40,w:0.6,h:2.9,speed:3,attack:7,drops:[['ender_pearl',0,1]],neutral:true,follow:64,goals:['float','endermanStare','endermanTele','targetPlayer','melee','wander'],model:'enderman',colors:{skin:[0.08,0.05,0.1]},sound:'enderman',
  onHurt:(m,src)=>{m.anger=600;if(src.projectile){teleportRandom(m,null);}},onTick:m=>{if(m.anger>0)m.anger--;if(m.inWater&&m.age%10===0)m.hurt(DMG.drown,1);},xp:5});
mob('zombified_piglin',{attack:5,drops:[['rotten_flesh',0,1]],rare:[['gold_ingot',0.025]],neutral:true,fireImmune:true,goals:['float','targetPlayer','melee','wander'],model:'humanoid',colors:{skin:[0.85,0.55,0.55],shirt:[0.45,0.6,0.35],legs:[0.5,0.4,0.3]},sound:'zombie',
  onHurt:(m,src,att)=>{if(att===player){for(const e of world.entities)if(e.type==='zombified_piglin'&&e.distTo(m)<32){e.anger=600;e.target=player;}}},onTick:m=>{if(m.anger>0)m.anger--;else if(m.target===player&&m.def.neutral)m.target=null;},init:m=>{m.hand=mkStack(I.GOLDEN_SWORD,1);}});
mob('ghast',{hp:10,w:4,h:4,speed:1.5,flying:true,fireImmune:true,drops:[['gunpowder',0,2]],goals:['ghastShoot','wander'],model:'ghast',colors:{skin:[0.94,0.94,0.94]},sound:'ghast',follow:64});
mob('blaze',{hp:20,h:1.8,speed:1.8,flying:true,fireImmune:true,drops:[['blaze_rod',0,1]],xp:10,goals:['blazeShoot','wander'],model:'blaze',colors:{skin:[0.95,0.75,0.2]},sound:'blaze'});
mob('magma_cube',{hp:16,w:1.02,h:1.02,speed:2.4,attack:4,fireImmune:true,drops:[],goals:['float','targetPlayer','melee','wander'],model:'cube',colors:{skin:[0.5,0.15,0.06]},sound:'slime'});
mob('slime',{hp:16,w:1.02,h:1.02,speed:2.2,attack:3,drops:[['slime_ball',0,2]],goals:['float','targetPlayer','melee','wander'],model:'cube',colors:{skin:[0.45,0.8,0.4]},sound:'slime'});
const ANIMAL_GOALS=['float','panic','breed','tempt','eatGrass','wander','lookPlayer'];
mob('pig',{category:'creature',hp:10,w:0.9,h:0.9,speed:2.5,attack:0,xp:()=>randInt(1,3),drops:[['porkchop',1,3]],tempt:['carrot','potato'],goals:ANIMAL_GOALS,model:'quad',colors:{skin:[0.94,0.62,0.62]},sound:'pig',breedItems:['carrot','potato']});
mob('cow',{category:'creature',hp:10,w:0.9,h:1.4,speed:2.2,attack:0,xp:()=>randInt(1,3),drops:[['beef',1,3],['leather',0,2]],tempt:['wheat'],goals:ANIMAL_GOALS,model:'quad',colors:{skin:[0.3,0.22,0.16],spot:[0.9,0.9,0.9]},sound:'cow',breedItems:['wheat'],
  interact:(m,st)=>{if(st&&st.id===I.BUCKET){player.replaceHeld(mkStack(I.MILK_BUCKET,1));sfx.play('milk');return true;}return false;}});
mob('sheep',{category:'creature',hp:8,w:0.9,h:1.3,speed:2.3,attack:0,xp:()=>randInt(1,3),drops:[['mutton',1,2],['white_wool',1,1]],tempt:['wheat'],goals:ANIMAL_GOALS,model:'quad',colors:{skin:[0.92,0.92,0.9],face:[0.8,0.7,0.6]},sound:'sheep',breedItems:['wheat'],
  interact:(m,st)=>{if(st&&st.id===I.SHEARS&&!m.sheared&&!m.baby){m.sheared=true;dropItemAt(m.pos[0],m.pos[1]+1,m.pos[2],mkStack(B.WHITE_WOOL,randInt(1,3)));player.damageHeld(1);sfx.play('shear');return true;}return false;}});
mob('chicken',{category:'creature',hp:4,w:0.4,h:0.7,speed:2.3,attack:0,xp:()=>randInt(1,3),drops:[['feather',0,2],['chicken',1,1]],tempt:['wheat_seeds'],goals:ANIMAL_GOALS,model:'chicken',colors:{skin:[0.95,0.95,0.95]},sound:'chicken',breedItems:['wheat_seeds'],
  onTick:m=>{if(!m.onGround&&m.vel[1]<-2.5)m.vel[1]=-2.5;m.fallDist=0;}});
mob('villager',{category:'creature',hp:20,speed:2.4,attack:0,xp:0,drops:[],goals:['float','panic','wander','lookPlayer'],model:'humanoid',colors:{skin:[0.74,0.54,0.42],shirt:[0.48,0.36,0.24],legs:[0.4,0.3,0.2]},sound:'villager'});
for(const k in MOBS){const d=MOBS[k];d.goalObjs=d.goals.map(g=>G[g]).filter(Boolean);}
function spawnMob(type,x,y,z){const d=MOBS[type];if(!d)return null;const m=new Mob(type);m.goals=d.goalObjs;m.setPos(x,y,z);m.yaw=Math.random()*6.28;world.entities.push(m);return m;}
// burning undead + growing babies
function mobCommonTick(m){
  if(m.dead)return;
  if(m.def.burns&&!m.armor[0]&&daylightNow()>0.8&&!world.weather.rain&&skyVisible(Math.floor(m.pos[0]),Math.floor(m.pos[1]+m.h),Math.floor(m.pos[2]))&&!m.inWater&&world.dim===0)m.setFire(8);
  if(m.growUp>0&&--m.growUp<=0&&m.baby){m.baby=false;m.w=m.def.w;m.h=m.def.h;}
  if(m.def.category==='monster'&&!m.persistent){
    const d=Math.hypot(player.pos[0]-m.pos[0],player.pos[2]-m.pos[2]);
    if(d>128||(d>32&&Math.random()<1/800)||world.difficulty===0)m.remove();
  }
}
/* ---------------- natural spawning ---------------- */
function daylightNow(){return envCache.daylight;}
function skyDarken(){return Math.round((1-envCache.daylight)*11);}
function monsterDark(x,y,z){const l=getLight(x,y,z);if(l<0)return false;if((l&15)>0)return false;return ((l>>4)-skyDarken())<=Math.floor(Math.random()*8);}
function spawnCycle(){
  if(!world.rules.doMobSpawning||!player.alive())return;
  const pcx=Math.floor(player.pos[0]/16),pcz=Math.floor(player.pos[2]/16),R=Math.min(settings.simDist,6);
  let mon=0,cre=0;for(const e of world.entities){if(!e.def)continue;if(e.def.category==='monster')mon++;else cre++;}
  const cats=[];if(world.difficulty>0&&mon<(world.dim===1?30:25))cats.push('monster');if(cre<10&&world.gameTime%400===0)cats.push('creature');
  for(const cat of cats){
    for(let attempt=0;attempt<(cat==='monster'?16:3);attempt++){
      const cx=pcx+randInt(-R,R),cz=pcz+randInt(-R,R),c=chunks.get(ckey(cx,cz));if(!c||!c.data)continue;
      const x=cx*16+randInt(0,15),z=cz*16+randInt(0,15),top=heightAt(x,z);if(top<0)continue;
      let y=cat==='creature'?top+1:randInt(1,Math.min(250,top+1));
      // walk up to the nearest open space with a floor (keeps cave/surface spawns uniform without wasting attempts inside rock)
      if(cat==='monster'){let k=0;while(k<24&&y<=top+1&&!(getV(x,y,z)===0&&getV(x,y+1,z)===0&&(FLAGS[getV(x,y-1,z)]&F_SOLID)))(y++,k++);if(k>=24)continue;}
      const dx=x+0.5-player.pos[0],dz=z+0.5-player.pos[2],d2=dx*dx+dz*dz+(y-player.pos[1])**2;if(d2<24*24||d2>128*128)continue;
      const bi=BIOMES[biomeAt(x,z)]||BIOMES[3];const list=(cat==='monster'?bi.monsters:bi.creatures).filter(e=>e[1]>0&&MOBS[e[0]]);if(!list.length)continue;
      const type=S.pickWeighted(list,Math.random());const def=MOBS[type];
      const group=cat==='monster'?randInt(1,type==='enderman'?1:3):randInt(2,4);
      for(let g=0;g<group;g++){const gx=x+randInt(-3,3),gz=z+randInt(-3,3);let gy=y;
        if(cat==='creature'){gy=heightAt(gx,gz)+1;if(gy<=0)continue;}
        if(!canSpawnAt(def,gx,gy,gz))continue;spawnMob(type,gx+0.5,gy,gz+0.5);}
    }
  }
}
function canSpawnAt(def,x,y,z){
  const below=getV(x,y-1,z);if(below<=0)return false;
  if(def.flying){if(!passable(x,y,z)||!passable(x,y+2,z))return false;}
  else{if(!(FLAGS[below]&F_SOLID)||!(FLAGS[below]&F_OPAQUE)&&(below&255)!==B.SOUL_SAND)return false;if((below&255)===B.BEDROCK)return false;}
  const m={h:def.h,w:def.w,fireImmune:def.fireImmune};
  for(let i=0;i<Math.ceil(def.h);i++){const v=getV(x,y+i,z);if(v!==0&&!(v>0&&!(FLAGS[v]&F_SOLID)&&!(FLAGS[v]&F_LIQUID)))return false;}
  void m;
  if(def.category==='monster'){if(world.dim===0&&!monsterDark(x,y,z))return false;if(world.dim===1&&def.key!=='ghast'&&((getLight(x,y,z)&15)>11))return false;}
  else{const bid=below&255;if(bid!==B.GRASS_BLOCK&&bid!==B.MYCELIUM)return false;const l=getLight(x,y,z);if(l<0||Math.max(l>>4,l&15)<9)return false;}
  const a=[x+0.5-def.w/2,y,z+0.5-def.w/2,x+0.5+def.w/2,y+def.h,z+0.5+def.w/2];return aabbFree(a);
}
function populateChunk(c){ // passive mobs placed once when a chunk is first generated
  if(world.dim!==0||Math.random()>0.1)return;
  const x=c.cx*16+randInt(2,13),z=c.cz*16+randInt(2,13),bi=BIOMES[biomeAt(x,z)];if(!bi||!bi.creatures.length)return;
  const list=bi.creatures.filter(e=>e[1]>0&&MOBS[e[0]]);if(!list.length)return;const type=S.pickWeighted(list,Math.random());
  for(let i=0;i<randInt(2,4);i++){const gx=x+randInt(-3,3),gz=z+randInt(-3,3),gy=heightAt(gx,gz)+1;if(gy>0&&canSpawnAt(MOBS[type],gx,gy,gz))spawnMob(type,gx+0.5,gy,gz+0.5);}
}
