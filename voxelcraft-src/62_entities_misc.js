/* =====================================================================
   OTHER ENTITIES: dropped items, XP orbs, falling blocks, primed TNT,
   projectiles, lightning, end crystals, ender dragon; explosions; particles;
   entity registry (save/load) and entity rendering.
   ===================================================================== */
class ItemEntity extends Entity{
  constructor(stack){super('item',0.25,0.25);this.stack=stack;this.pickupDelay=10;this.persistent=true;this.spin=Math.random()*6.28;this.fireImmune=!!(ITEM[stack.id]&&ITEM[stack.id].fireproof);}
  tick(){
    this.age++;if(!this.chunkLoaded())return;
    if(this.pickupDelay>0)this.pickupDelay--;
    const dt=TICK;
    if(this.inWater){this.vel[1]=this.vel[1]*0.8+6*dt;this.vel[0]*=0.9;this.vel[2]*=0.9;}
    else if(this.inLava&&!this.fireImmune){this.remove();sfx.play('fizz',...this.pos);return;}
    else this.vel[1]=Math.max(this.vel[1]-16*dt,-40);
    if(this.onGround){const u=this.blockUnder(),sl=u>0&&DEF[u&255].slip>0.9?0.98:0.6;this.vel[0]*=sl;this.vel[2]*=sl;}else{this.vel[0]*=0.98;this.vel[2]*=0.98;}
    this.move(this.vel[0]*dt,this.vel[1]*dt,this.vel[2]*dt);
    if(this.fireTicks>0&&!this.fireImmune){this.remove();return;}
    if(this.age%10===0)for(const e of world.entities){if(e===this||e.type!=='item'||e.dead||e.stack.id!==this.stack.id)continue;
      if(Math.abs(e.pos[0]-this.pos[0])<1&&Math.abs(e.pos[1]-this.pos[1])<0.6&&Math.abs(e.pos[2]-this.pos[2])<1&&canStack(e.stack,this.stack)){
        const ms=maxStack(this.stack.id);if(this.stack.count+e.stack.count<=ms){this.stack.count+=e.stack.count;e.remove();this.age=Math.min(this.age,e.age);}}}
    if(this.pickupDelay<=0&&player.alive()){const a=player.aabb();
      if(aabbOverlap(a[0]-1,a[1]-0.5,a[2]-1,a[3]+1,a[4]+0.5,a[5]+1,this.pos[0]-0.125,this.pos[1],this.pos[2]-0.125,this.pos[0]+0.125,this.pos[1]+0.25,this.pos[2]+0.125)){
        const before=this.stack.count,left=player.inv.insert(this.stack);
        if(!left||left.count<before){sfx.play('pickup');advanceItem(this.stack.id);}
        if(!left)this.remove();else this.stack=left;}}
    if(this.age>6000)this.remove();
  }
  save(){const o=super.save();o.stack=cloneStack(this.stack);o.pd=this.pickupDelay;return o;}
  load(o){super.load(o);this.pickupDelay=o.pd|0;}
}
function dropItemAt(x,y,z,stack,scatter=true){ // never lose items: everything that leaves an inventory becomes an entity
  if(!stack||stack.count<=0)return null;const e=new ItemEntity(cloneStack(stack));e.setPos(x,y,z);
  if(scatter){e.vel=[(Math.random()-0.5)*2,2+Math.random()*1.5,(Math.random()-0.5)*2];}
  world.entities.push(e);return e;
}
class XPOrb extends Entity{
  constructor(v){super('xp',0.25,0.25);this.value=v;this.persistent=true;}
  tick(){this.age++;if(!this.chunkLoaded())return;const dt=TICK;
    if(player.alive()){const dx=player.pos[0]-this.pos[0],dy=player.pos[1]+0.9-this.pos[1],dz=player.pos[2]-this.pos[2],d=Math.hypot(dx,dy,dz);
      if(d<8){const f=(1-d/8)**2*40*dt;this.vel[0]+=dx/d*f;this.vel[1]+=dy/d*f;this.vel[2]+=dz/d*f;}
      if(d<1.2){player.addXP(this.value);sfx.play('xp');this.remove();return;}}
    this.vel[1]-=10*dt;this.vel[0]*=0.95;this.vel[2]*=0.95;this.move(this.vel[0]*dt,this.vel[1]*dt,this.vel[2]*dt);
    if(this.age>6000)this.remove();}
  save(){const o=super.save();o.value=this.value;return o;}
}
function spawnXP(x,y,z,n){while(n>0){const v=n>=17?17:(n>=7?7:(n>=3?3:1));n-=v;const o=new XPOrb(v);o.setPos(x,y,z);o.vel=[(Math.random()-0.5)*3,2+Math.random()*2,(Math.random()-0.5)*3];world.entities.push(o);}}
class FallingBlock extends Entity{
  constructor(v){super('falling_block',0.98,0.98);this.v=v;}
  tick(){this.age++;if(!this.chunkLoaded())return;const dt=TICK;this.vel[1]=Math.max(this.vel[1]-32*dt,-40);this.move(0,this.vel[1]*dt,0);
    if(this.onGround||this.age>600){const x=Math.floor(this.pos[0]),y=Math.floor(this.pos[1]+0.3),z=Math.floor(this.pos[2]);const cur=getV(x,y,z);
      if(cur>=0&&replaceable(cur))setV(x,y,z,this.v);else dropItemAt(this.pos[0],this.pos[1]+0.5,this.pos[2],mkStack(this.v&255,1));this.remove();}}
  save(){const o=super.save();o.v=this.v;return o;}
}
function spawnFallingBlock(x,y,z,v){const e=new FallingBlock(v);e.setPos(x+0.5,y,z+0.5);e.persistent=true;world.entities.push(e);return e;}
class PrimedTnt extends Entity{
  constructor(fuse){super('tnt',0.98,0.98);this.fuse=fuse;this.persistent=true;}
  tick(){this.age++;if(!this.chunkLoaded())return;const dt=TICK;this.vel[1]=Math.max(this.vel[1]-32*dt,-40);this.vel[0]*=0.9;this.vel[2]*=0.9;
    this.move(this.vel[0]*dt,this.vel[1]*dt,this.vel[2]*dt);if(--this.fuse<=0){this.remove();explode(this.pos[0],this.pos[1]+0.49,this.pos[2],4,false,true,this,'tnt');}}
  save(){const o=super.save();o.fuse=this.fuse;return o;}
}
function spawnPrimedTnt(x,y,z,fuse){const e=new PrimedTnt(fuse);e.setPos(x+0.5,y,z+0.5);const a=Math.random()*6.28;e.vel=[Math.cos(a)*0.4,4,Math.sin(a)*0.4];world.entities.push(e);sfx.play('fuse',x,y,z);return e;}
/* ---------------- projectiles ---------------- */
class Projectile extends Entity{
  constructor(type,owner,w=0.25){super(type,w,w);this.owner=owner;this.gravity=20;this.drag=0.99;this.inGround=false;this.persistent=false;}
  tick(){this.age++;if(!this.chunkLoaded())return;const dt=TICK;
    if(this.inGround){if(this.age>1200)this.remove();this.groundTick&&this.groundTick();return;}
    const o=[this.pos[0],this.pos[1]+this.h/2,this.pos[2]],d=[this.vel[0]*dt,this.vel[1]*dt,this.vel[2]*dt],len=Math.hypot(...d);
    if(len>0){const dir=[d[0]/len,d[1]/len,d[2]/len];
      const bh=raycastBlocks(o,dir,len,false);
      // entity hit
      let best=null,bt=bh?bh.t:len;
      const cand=entitiesInBox(Math.min(o[0],o[0]+d[0])-1,Math.min(o[1],o[1]+d[1])-1,Math.min(o[2],o[2]+d[2])-1,Math.max(o[0],o[0]+d[0])+1,Math.max(o[1],o[1]+d[1])+1,Math.max(o[2],o[2]+d[2])+1);
      for(const e of cand){if(e===this||!e.living&&!(e.type==='end_crystal'||e.type==='fireball')||e===this.owner&&this.age<6)continue;const a=e.aabb();
        const t=rayAABB(o,dir,[a[0]-0.15,a[1]-0.15,a[2]-0.15],[a[3]+0.15,a[4]+0.15,a[5]+0.15]);if(t>=0&&t<bt){bt=t;best=e;}}
      if(best){this.onHitEntity(best);return;}
      if(bh){this.pos=[o[0]+dir[0]*(bh.t-0.05),o[1]+dir[1]*(bh.t-0.05)-this.h/2,o[2]+dir[2]*(bh.t-0.05)];this.onHitBlock(bh);return;}
    }
    this.pos[0]+=d[0];this.pos[1]+=d[1];this.pos[2]+=d[2];
    this.vel[1]-=this.gravity*dt;this.vel[0]*=this.drag;this.vel[1]*=this.drag;this.vel[2]*=this.drag;
    this.yaw=Math.atan2(-this.vel[0],-this.vel[2]);this.pitch=Math.atan2(this.vel[1],Math.hypot(this.vel[0],this.vel[2]));
    if(this.pos[1]<-64||this.age>1200)this.remove();
  }
  onHitEntity(e){this.remove();}
  onHitBlock(h){this.remove();}
}
class Arrow extends Projectile{
  constructor(owner,dmg){super('arrow',owner);this.dmg=dmg||2;this.pickup=owner===player;this.persistent=this.pickup;}
  onHitEntity(e){const sp=Math.hypot(...this.vel)/20;let dmg=Math.ceil(sp*this.dmg);if(this.crit)dmg+=randInt(0,Math.floor(dmg/2)+1);
    if(e.hurt(projDmg(this.owner,this),dmg,this.owner)){if(this.owner&&this.owner.def&&this.owner.def.slowArrows&&e.addEffect)e.addEffect('slowness',600,0);if(this.fire)e.setFire(5);sfx.play('arrow_hit',...this.pos);}
    this.remove();}
  onHitBlock(h){this.inGround=true;this.vel=[0,0,0];sfx.play('arrow_hit',...this.pos);const v=getV(h.x,h.y,h.z);if(v===B.TNT&&this.fire){setV(h.x,h.y,h.z,0);spawnPrimedTnt(h.x,h.y,h.z,80);}}
  groundTick(){if(this.pickup&&player.alive()&&Math.hypot(player.pos[0]-this.pos[0],player.pos[1]+0.9-this.pos[1],player.pos[2]-this.pos[2])<1.5){const l=player.inv.insert(mkStack(I.ARROW,1));if(!l){this.remove();sfx.play('pickup');}}}
  save(){const o=super.save();o.inGround=this.inGround;o.pickup=this.pickup;return o;}
  load(o){super.load(o);this.inGround=!!o.inGround;this.pickup=!!o.pickup;}
}
function shootArrow(m,t){const a=new Arrow(m,2);const o=[m.pos[0],m.pos[1]+m.eyeH()-0.1,m.pos[2]];a.setPos(o[0],o[1],o[2]);
  const dx=t.pos[0]-o[0],dz=t.pos[2]-o[2],dh=Math.hypot(dx,dz),dy=t.pos[1]+t.h*0.5-o[1]+dh*0.2;const l=Math.hypot(dx,dy,dz),sp=32,inacc=[0,0.14,0.1,0.06][world.difficulty]||0.1;
  a.vel=[dx/l*sp+(Math.random()-0.5)*sp*inacc,dy/l*sp+(Math.random()-0.5)*sp*inacc,dz/l*sp+(Math.random()-0.5)*sp*inacc];world.entities.push(a);sfx.play('bow',...m.pos);}
class Fireball extends Projectile{
  constructor(owner,big){super(big?'fireball':'small_fireball',owner,big?1:0.3125);this.big=big;this.gravity=0;this.drag=1;this.fireImmune=true;}
  onHitEntity(e){if(e.type==='fireball')return;if(this.big){this.boom();}else{e.setFire(5);e.hurt(projDmg(this.owner,this),5,this.owner);this.remove();}}
  onHitBlock(h){if(this.big)this.boom();else{const d=FDIR[h.face];const x=h.x+d[0],y=h.y+d[1],z=h.z+d[2];if(getV(x,y,z)===0&&world.rules.mobGriefing)setV(x,y,z,B.FIRE);this.remove();}}
  boom(){this.remove();explode(this.pos[0],this.pos[1],this.pos[2],1,true,world.rules.mobGriefing,this.owner);}
  deflect(dir){this.vel=[dir[0]*30,dir[1]*30,dir[2]*30];this.owner=player;}
}
function shootFireball(m,t,big){const f=new Fireball(m,big);const o=[m.pos[0],m.pos[1]+m.h*0.5,m.pos[2]];f.setPos(o[0],o[1],o[2]);
  const d=[t.pos[0]-o[0],t.pos[1]+1-o[1],t.pos[2]-o[2]],l=Math.hypot(...d),sp=big?18:22,sp2=big?0:0.08;
  f.vel=[d[0]/l*sp+(Math.random()-0.5)*sp*sp2,d[1]/l*sp,d[2]/l*sp+(Math.random()-0.5)*sp*sp2];world.entities.push(f);sfx.play(big?'ghast_shoot':'blaze_shoot',...o);}
class Thrown extends Projectile{
  constructor(kind,owner){super(kind,owner);this.gravity=kind==='eye_of_ender'?0:12;}
  onHitEntity(e){if(this.type==='snowball')e.hurt(projDmg(this.owner,this),e.type==='blaze'?3:0,this.owner);this.impact();}
  onHitBlock(h){this.impact();}
  impact(){this.remove();particlesAt(this.pos,8,this.type==='ender_pearl'?[0.1,0.5,0.4]:[0.95,0.95,1]);
    if(this.type==='ender_pearl'&&this.owner===player&&player.alive()){player.setPos(this.pos[0],this.pos[1]+0.1,this.pos[2]);player.vel=[0,0,0];player.fallDist=0;player.hurt(DMG.fall,5);sfx.play('teleport',...this.pos);}}
  tick(){if(this.type==='eye_of_ender'){this.age++;const dt=TICK;const t=this.target;
      if(t){const dx=t[0]-this.pos[0],dz=t[1]-this.pos[2],d=Math.hypot(dx,dz);const sp=Math.min(d,12)>0.5?10:0;this.vel=[dx/(d||1)*sp,this.age<20?4:(this.age<50?0:-2),dz/(d||1)*sp];}
      this.pos[0]+=this.vel[0]*dt;this.pos[1]+=this.vel[1]*dt;this.pos[2]+=this.vel[2]*dt;particlesAt(this.pos,1,[0.3,0.9,0.5]);
      if(this.age>=70){this.remove();if(Math.random()<0.8)dropItemAt(...this.pos,mkStack(I.EYE_OF_ENDER,1));else sfx.play('glass',...this.pos);}return;}
    super.tick();}
}
class Lightning extends Entity{
  constructor(){super('lightning',0.1,0.1);this.life=10;}
  tick(){this.age++;if(this.age===1){sfx.play('thunder',...this.pos);flashSky=1;
      const x=Math.floor(this.pos[0]),y=Math.floor(this.pos[1]),z=Math.floor(this.pos[2]);if(world.rules.doFireTick&&getV(x,y,z)===0&&solidTop(getV(x,y-1,z)))setV(x,y,z,B.FIRE);
      for(const e of entitiesInBox(this.pos[0]-3,this.pos[1]-3,this.pos[2]-3,this.pos[0]+3,this.pos[1]+6,this.pos[2]+3))if(e.living){e.hurt(DMG.lightning,5);e.setFire(8);}}
    if(this.age>this.life)this.remove();}
}
class EndCrystal extends Entity{
  constructor(){super('end_crystal',2,2);this.persistent=true;}
  tick(){this.age++;}
  hurt(src,amt){if(this.dead)return false;this.remove();explode(this.pos[0],this.pos[1]+1,this.pos[2],6,false,true,null);return true;}
}
class EnderDragon extends LivingEntity{
  constructor(){super('ender_dragon',8,4,200);this.noGravity=true;this.noFall=true;this.fireImmune=true;this.phase='circle';this.phaseT=0;this.ang=0;this.persistent=true;this.stepHeight=0;}
  displayName(){return 'Ender Dragon';}
  tick(){this.age++;this.prevYaw=this.yaw;if(this.dead){this.deathTime++;if(this.deathTime%4===0)particlesAt([this.pos[0]+randInt(-4,4),this.pos[1]+randInt(0,4),this.pos[2]+randInt(-4,4)],12,[1,0.8,1],true);
      if(this.deathTime>=120){this.remove();dragonDefeated();}return;}
    if(this.invul>0)this.invul--;if(this.hurtTime>0)this.hurtTime--;
    this.phaseT++;let tx,ty,tz,sp=18;
    const crystals=world.entities.filter(e=>e.type==='end_crystal'&&!e.dead);
    const nearC=crystals.find(c=>Math.hypot(c.pos[0]-this.pos[0],c.pos[2]-this.pos[2])<40);if(nearC&&this.age%10===0)this.heal(1);this.beam=nearC||null;
    if(this.phase==='circle'){this.ang+=0.012;const r=55;tx=Math.cos(this.ang)*r;tz=Math.sin(this.ang)*r;ty=82+Math.sin(this.ang*3)*6;
      if(this.phaseT>400&&player.alive()&&!player.creativeLike()&&world.dim===2){this.phase=Math.random()<0.3?'perch':'charge';this.phaseT=0;}}
    else if(this.phase==='charge'){tx=player.pos[0];ty=player.pos[1]+1;tz=player.pos[2];sp=24;
      if(Math.hypot(tx-this.pos[0],ty-this.pos[1],tz-this.pos[2])<4){player.hurt(mobDmg(this),10,this);player.knockback(10,player.pos[0]-this.pos[0],player.pos[2]-this.pos[2]);this.phase='circle';this.phaseT=0;}
      if(this.phaseT>200){this.phase='circle';this.phaseT=0;}}
    else if(this.phase==='perch'){tx=0;ty=70;tz=0;sp=12;if(this.phaseT>80&&this.phaseT%30===0&&player.alive())for(let i=0;i<6;i++)particlesAt([randInt(-4,4),67,randInt(-4,4)],6,[0.8,0.2,0.9],true);
      if(this.phaseT>80&&player.alive()&&Math.hypot(player.pos[0],player.pos[2])<6&&this.phaseT%20===0)player.hurt(DMG.dragonBreath,3);
      if(this.phaseT>300){this.phase='circle';this.phaseT=0;}}
    const dx=tx-this.pos[0],dy=ty-this.pos[1],dz=tz-this.pos[2],d=Math.hypot(dx,dy,dz)||1;
    this.vel[0]+=(dx/d*sp-this.vel[0])*0.05;this.vel[1]+=(dy/d*sp*0.5-this.vel[1])*0.05;this.vel[2]+=(dz/d*sp-this.vel[2])*0.05;
    this.pos[0]+=this.vel[0]*TICK;this.pos[1]+=this.vel[1]*TICK;this.pos[2]+=this.vel[2]*TICK;this.yaw=Math.atan2(-this.vel[0],-this.vel[2]);
    if(this.age%100===0)sfx.play('dragon_growl',...this.pos);
  }
  onHurt(){sfx.play('dragon_hurt',...this.pos);bossBar.hp=this.health/this.maxHealth;}
  onDeath(){bossBar.hp=0;sfx.play('dragon_death',...this.pos);}
  save(){const o=super.save();this.saveLiving(o);return o;}
  load(o){super.load(o);this.loadLiving(o);this.health=clamp(finite(o.health,200),1,200);}
}
const bossBar={hp:0,name:''};
function dragonDefeated(){
  if(!world.dragon.killed){spawnXP(0,70,0,12000);advance('free_the_end');}
  world.dragon.killed=true;world.metaDirty=true;
  for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)if(Math.abs(x)+Math.abs(z)<2||true)setV(x,64,z,B.END_PORTAL,0);
  setV(0,65,0,B.BEDROCK);setV(0,69,0,B.DRAGON_EGG);toast('The Ender Dragon has been defeated');
}
/* ---------------- explosions (Minecraft-style rays) ---------------- */
let shake=0;
function explode(x,y,z,power,fire,breakBlocks,source,kind){
  const destroyed=new Map();
  if(breakBlocks){
    for(let i=0;i<16;i++)for(let j=0;j<16;j++)for(let k=0;k<16;k++){
      if(i!==0&&i!==15&&j!==0&&j!==15&&k!==0&&k!==15)continue;
      let dx=i/15*2-1,dy=j/15*2-1,dz=k/15*2-1;const l=Math.hypot(dx,dy,dz);dx/=l;dy/=l;dz/=l;
      let inten=power*(0.7+Math.random()*0.6),px=x,py=y,pz=z;
      while(inten>0){const bx=Math.floor(px),by=Math.floor(py),bz=Math.floor(pz);const v=getV(bx,by,bz);if(v<0)break;
        if(v>0){inten-=(DEF[v&255].resist+0.3)*0.3;}
        if(inten>0&&v>0&&DEF[v&255].resist<3600000&&!(FLAGS[v]&F_LIQUID&&true))destroyed.set(posKey(bx,by,bz),[bx,by,bz,v]);
        px+=dx*0.3;py+=dy*0.3;pz+=dz*0.3;inten-=0.225;}
    }
  }
  // entities
  const R=power*2;
  for(const e of entitiesInBox(x-R,y-R,z-R,x+R,y+R,z+R,()=>true).concat(player.alive()?[player]:[])){
    if(e===source&&e.type!=='tnt')continue;const ex=e.pos[0]-x,ey=e.pos[1]+(e.h||0)/2-y,ez=e.pos[2]-z,d=Math.hypot(ex,ey,ez);if(d>R)continue;
    let seen=0,tot=0;const a=e.aabb?e.aabb():null;if(a)for(const fx of [0.2,0.8])for(const fy of [0.2,0.8])for(const fz of [0.2,0.8]){tot++;const tx=a[0]+(a[3]-a[0])*fx,ty=a[1]+(a[4]-a[1])*fy,tz=a[2]+(a[5]-a[2])*fz;
      const dd=[tx-x,ty-y,tz-z],l=Math.hypot(...dd);const h=l>0?raycastBlocks([x,y,z],[dd[0]/l,dd[1]/l,dd[2]/l],l,false):null;if(!h||h.t>=l-0.1)seen++;}
    const expo=tot?seen/tot:1,imp=(1-d/R)*expo;if(imp<=0)continue;
    const dmg=Math.floor((imp*imp+imp)/2*7*R+1);
    if(e.living)e.hurt(blastDmg(source&&source.living?source:null),dmg);else if(e.type==='item'&&dmg>3)e.remove();else if(e.type==='end_crystal'&&e!==source)e.hurt(null,1);
    if(e.type==='tnt'&&e!==source)e.fuse=Math.min(e.fuse,randInt(10,30));
    const kb=imp*(1-(e.kbResist?e.kbResist():0))*14;if(d>0){e.vel[0]+=ex/d*kb;e.vel[1]+=ey/d*kb*0.9+2*imp;e.vel[2]+=ez/d*kb;}
  }
  for(const [,[bx,by,bz,v]] of destroyed){const id=v&255;
    if(DEF[id].tnt){setV(bx,by,bz,0);const t=spawnPrimedTnt(bx,by,bz,randInt(10,30));t.vel=[0,3,0];continue;}
    const drops=kind==='tnt'||Math.random()<1/power;if(drops)for(const st of blockDrops(v,null))dropItemAt(bx+0.5,by+0.5,bz+0.5,st);
    const b=BEH[id];setV(bx,by,bz,0);void b;}
  if(fire)for(const [,[bx,by,bz]] of destroyed)if(Math.random()<1/3&&getV(bx,by,bz)===0&&solidTop(getV(bx,by-1,bz)))setV(bx,by,bz,B.FIRE);
  particlesExplosion(x,y,z,power);sfx.play('explode',x,y,z);
  const pd=Math.hypot(player.pos[0]-x,player.pos[1]-y,player.pos[2]-z);shake=Math.max(shake,Math.max(0,1-pd/(power*6)));
}
/* ---------------- particles ---------------- */
const particles=[];
function pushParticle(p){if(particles.length<1200)particles.push(p);}
function particlesForBlock(x,y,z,v){const layer=TEXV[v*6+1];
  for(let i=0;i<14;i++)pushParticle({x:x+0.2+Math.random()*0.6,y:y+0.2+Math.random()*0.6,z:z+0.2+Math.random()*0.6,vx:(Math.random()-0.5)*4,vy:Math.random()*4+1,vz:(Math.random()-0.5)*4,
    life:0.5+Math.random()*0.6,layer,u:Math.random()*0.75,v:Math.random()*0.75,s:0.07+Math.random()*0.06,col:null,g:18,tint:tintOfVoxel(v,x,z)});}
function particlesHit(x,y,z,v,face){const layer=TEXV[v*6+1],d=FDIR[face];
  pushParticle({x:x+0.5+d[0]*0.52+(Math.random()-0.5)*0.8*(d[0]?0:1),y:y+0.5+d[1]*0.52+(Math.random()-0.5)*0.8*(d[1]?0:1),z:z+0.5+d[2]*0.52+(Math.random()-0.5)*0.8*(d[2]?0:1),
    vx:d[0]*1.5,vy:1,vz:d[2]*1.5,life:0.4,layer,u:Math.random()*0.75,v:Math.random()*0.75,s:0.06,col:null,g:14,tint:tintOfVoxel(v,x,z)});}
function tintOfVoxel(v,x,z){const t=S.TINT[v];if(t===1||t===2||(DEF[v&255].tintTop)){const b=BIOMES[biomeAt(x,z)]||BIOMES[3];const c=t===2?b.foliage:b.grass;return [c[0]/255,c[1]/255,c[2]/255];}
  if(t===3)return [0.38,0.6,0.38];if(t===4)return [0.5,0.65,0.33];return null;}
function particlesAt(p,n,col,glow){for(let i=0;i<n;i++)pushParticle({x:p[0]+(Math.random()-0.5)*0.6,y:p[1]+(Math.random()-0.5)*0.8,z:p[2]+(Math.random()-0.5)*0.6,vx:(Math.random()-0.5)*2,vy:Math.random()*2+0.5,vz:(Math.random()-0.5)*2,
  life:0.5+Math.random()*0.5,layer:-1,u:0,v:0,s:0.1,col,g:glow?-1:6,glow});}
function particlesPortal(p){particlesAt([p[0],p[1]+1,p[2]],16,[0.6,0.2,0.9],true);}
function particlesExplosion(x,y,z,power){for(let i=0;i<Math.min(60,power*14);i++){const a=Math.random()*6.28,b=Math.random()*3.14,r=Math.random()*power;
  pushParticle({x:x+Math.cos(a)*Math.sin(b)*r,y:y+Math.cos(b)*r,z:z+Math.sin(a)*Math.sin(b)*r,vx:(Math.random()-0.5)*3,vy:Math.random()*2,vz:(Math.random()-0.5)*3,life:0.6+Math.random()*0.8,layer:-1,s:0.3+Math.random()*0.5,col:[0.8,0.8,0.8],g:-0.5});}}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){const q=particles[i];q.life-=dt;if(q.life<=0){particles[i]=particles[particles.length-1];particles.pop();continue;}
    q.vy-=q.g*dt;const ny=q.y+q.vy*dt;const v=getV(Math.floor(q.x),Math.floor(ny),Math.floor(q.z));
    if(v!==0&&(v<0||(FLAGS[v]&F_SOLID))){q.vy=0;q.vx*=0.6;q.vz*=0.6;}else q.y=ny;q.x+=q.vx*dt;q.z+=q.vz*dt;}
}
/* ---------------- entity registry ---------------- */
const ENTITY_TYPES={item:o=>{const s=sanitizeStack(o.stack);return s?new ItemEntity(s):null;},xp:o=>new XPOrb(clamp(o.value|0,1,2477)),falling_block:o=>DEF[(o.v|0)&255]?new FallingBlock(o.v|0):null,
  tnt:o=>new PrimedTnt(clamp(o.fuse|0,1,200)),arrow:o=>o.inGround?new Arrow(null,2):null,end_crystal:()=>new EndCrystal(),ender_dragon:()=>new EnderDragon()};
function entityFromSave(o){
  if(!o||typeof o!=='object'||!Array.isArray(o.pos))return null;let e=null;
  try{if(MOBS[o.type]){e=new Mob(o.type);e.goals=MOBS[o.type].goalObjs;}else if(ENTITY_TYPES[o.type])e=ENTITY_TYPES[o.type](o);if(!e)return null;e.load(o);
    if(!o.pos.every(n=>isFinite(n)))return null;}catch(err){reportError('entity load',err);return null;}
  return e;
}
function stashChunkEntities(c){
  const m=metaOf(c.key);let n=0;
  for(const e of world.entities){if(e.dead||!e.persistent)continue;if(Math.floor(e.pos[0]/16)!==c.cx||Math.floor(e.pos[2]/16)!==c.cz)continue;
    try{m.ents.push(e.save());}catch(err){reportError('entity save',err);}e.dead=true;e.removed=true;e.stashed=true;n++;}
  if(n)touchChunk(c.key);
  world.entities=world.entities.filter(e=>!e.removed);
}
function onChunkData(c){
  const m=world.meta.get(c.key);
  if(m){
    if(m.ents.length){for(const o of m.ents){const e=entityFromSave(o);if(e)world.entities.push(e);}m.ents=[];}
    if(m.ticks.length){for(const t of m.ticks){const [x,y,z,dl,id]=t;if(isFinite(x)&&isFinite(y)&&isFinite(z))scheduleTick(x,y,z,Math.max(1,dl|0),id);}m.ticks=[];}
  }
  const mm=metaOf(c.key);
  if(!mm.pop){mm.pop=true;touchChunk(c.key);try{populateChunk(c);}catch(err){reportError('populate',err);}}
  if(world.dim===2&&!world.dragon.killed)ensureEndEntities(c);
}
function ensureEndEntities(c){
  if(!world.endGen)world.endGen=S.endPillars(world.seed);
  for(const p of world.endGen){if(Math.floor(p.x/16)!==c.cx||Math.floor(p.z/16)!==c.cz)continue;
    if(!world.entities.some(e=>e.type==='end_crystal'&&Math.abs(e.pos[0]-p.x-0.5)<1&&Math.abs(e.pos[2]-p.z-0.5)<1)&&!world.meta.get(c.key).crystalDone){
      const e=new EndCrystal();e.setPos(p.x+0.5,p.h+2,p.z+0.5);world.entities.push(e);world.meta.get(c.key).crystalDone=true;touchChunk(c.key);}}
  if(c.cx===0&&c.cz===0&&!world.dragon.spawned){world.dragon.spawned=true;world.metaDirty=true;const d=new EnderDragon();d.setPos(0,90,-40);world.entities.push(d);bossBar.name='Ender Dragon';bossBar.hp=1;}
}
/* ---------------- entity rendering ---------------- */
function renderEntities(eye,alpha,env,planes){
  const lim=(settings.renderDist*16)**2;
  for(const e of world.entities){
    if(e.dead&&!(e.living&&e.deathTime<20))continue;
    const ix=e.prev[0]+(e.pos[0]-e.prev[0])*alpha,iy=e.prev[1]+(e.pos[1]-e.prev[1])*alpha,iz=e.prev[2]+(e.pos[2]-e.prev[2])*alpha;
    const bx=ix-eye[0],by=iy-eye[1],bz=iz-eye[2];if(bx*bx+bz*bz>lim)continue;
    const hw=e.w/2+0.5;if(!boxVisible(planes,bx-hw,by-0.5,bz-hw,bx+hw,by+e.h+0.5,bz+hw))continue;
    const br=brightnessAt(ix,iy+Math.min(1,e.h*0.5),iz,env.daylight);
    if(e.type==='item'){drawItemEntity(e,bx,by,bz,br);continue;}
    if(e.type==='xp'){const s=0.12+Math.min(0.1,e.value*0.01);addBox(bx,by+0.15+Math.sin(e.age*0.2)*0.05,bz,s,s,s,e.age*0.1,0,-1,-1,-1,0.5,1,0.3,1.5);continue;}
    if(e.type==='falling_block'){const v=e.v;addBox(bx,by+0.49,bz,0.98,0.98,0.98,0,0,TEXV[v*6+3],TEXV[v*6+1],TEXV[v*6+2],1,1,1,br);continue;}
    if(e.type==='tnt'){const fl=(e.fuse>>2)%2?1.8:1;addBox(bx,by+0.49,bz,0.98,0.98,0.98,0,0,S.T.tnt_top,S.T.tnt_side,S.T.tnt_bottom,fl,fl,fl,br);continue;}
    if(e.type==='arrow'){addBox(bx,by+0.12,bz,0.08,0.08,0.6,e.yaw,e.pitch,-1,-1,-1,0.55,0.4,0.25,br);continue;}
    if(e.type==='fireball'||e.type==='small_fireball'){const s=e.type==='fireball'?0.9:0.3;addBox(bx,by+s/2,bz,s,s,s,e.age*0.3,e.age*0.2,-1,-1,-1,1,0.55,0.1,2);continue;}
    if(e.type==='snowball'||e.type==='ender_pearl'||e.type==='eye_of_ender'){const c=e.type==='snowball'?[1,1,1]:(e.type==='ender_pearl'?[0.1,0.5,0.45]:[0.2,0.6,0.35]);addBox(bx,by+0.12,bz,0.2,0.2,0.2,e.age*0.3,0,-1,-1,-1,...c,br);continue;}
    if(e.type==='lightning'){for(let k=0;k<12;k++)addBox(bx+(Math.random()-0.5)*0.6,by+k*4+2,bz+(Math.random()-0.5)*0.6,0.25,4.2,0.25,0,0,-1,-1,-1,0.85,0.9,1,3);continue;}
    if(e.type==='end_crystal'){const b=Math.sin(e.age*0.1)*0.3;addBox(bx,by+0.5,bz,1.6,0.6,1.6,0,0,S.T.bedrock,S.T.bedrock,S.T.bedrock,1,1,1,br);
      addBox(bx,by+1.6+b,bz,0.9,0.9,0.9,e.age*0.05,e.age*0.07,-1,-1,-1,0.9,0.5,0.9,2,0,0,1,0.8);addBox(bx,by+1.6+b,bz,0.5,0.5,0.5,-e.age*0.08,0,-1,-1,-1,1,0.3,1,2);continue;}
    if(e.type==='ender_dragon'){drawDragon(e,bx,by,bz,alpha);continue;}
    if(e.def)drawMob(e,bx,by,bz,br,alpha);
    // shadow
    const gy=heightAt(Math.floor(ix),Math.floor(iz));if(gy>=0&&iy-gy<6&&e.living)addBox(bx,gy+1.01-eye[1],bz,e.w*1.1,0.01,e.w*1.1,0,0,-1,-1,-1,0,0,0,1,0,0,1,0.35*(1-(iy-gy-1)/6));
  }
}
function drawItemEntity(e,bx,by,bz,br){
  const s=e.stack,it=ITEM[s.id];if(!it)return;const bob=Math.sin((e.age+e.spin*10)*0.1)*0.06+0.12,yaw=e.age*0.05+e.spin;const n=s.count>32?3:(s.count>1?2:1);
  for(let k=0;k<n;k++){const o=k*0.06;
    if(it.block&&(FLAGS[it.block]&F_CUBE||MODEL[it.block]===4&&!(FLAGS[it.block]&F_CUBE)&&![B.TORCH,B.REDSTONE_TORCH,B.LADDER,B.RAIL,B.LEVER].includes(it.block))){const v=it.block;
      const tn=tintOfVoxel(v,Math.floor(e.pos[0]),Math.floor(e.pos[2]));const c=tn||[1,1,1];
      addBox(bx+o,by+bob+0.125+o,bz+o,0.25,0.25,0.25,yaw,0,TEXV[v*6+3],TEXV[v*6+1],TEXV[v*6+2],c[0],c[1],c[2],br);}
    else{const layer=it.block?TEXV[it.block*6+1]:512+ITEM_TEX[it.tex];const tn=it.block?tintOfVoxel(it.block,Math.floor(e.pos[0]),Math.floor(e.pos[2])):null;const c=tn||[1,1,1];
      addBox(bx+o,by+bob+0.2+o,bz+o,0.4,0.4,0.03,yaw,0,layer,layer,layer,c[0],c[1],c[2],br);}}
}
function drawMob(m,bx,by,bz,br,alpha){
  const d=m.def,sc=m.baby?0.5:1,c=d.colors,hurt=m.hurtTime>0||(m.dead&&m.deathTime<20);
  const yaw=m.prevYaw+(((m.yaw-m.prevYaw+Math.PI*3)%(Math.PI*2))-Math.PI)*alpha;
  const cy=Math.cos(yaw),sy=Math.sin(yaw);
  const tilt=m.dead?Math.min(1,m.deathTime/12)*1.4:0;
  const P=(ox,oy,oz,sx,sY,sz,col,pitch=0,layer=-1,extraYaw=0)=>{ox*=sc;oy*=sc;oz*=sc;sx*=sc;sY*=sc;sz*=sc;
    let ry=oy,rx=ox;if(tilt){const cc=Math.cos(tilt),ss=Math.sin(tilt);const nx=ox*cc-oy*ss;ry=ox*ss+oy*cc;rx=nx;}
    const wx=rx*cy+oz*sy,wz=-rx*sy+oz*cy;const k=hurt?[1,0.45,0.45]:[1,1,1];const fl=m.fuse>0&&(m.fuse>>1)%2?1.8:1;
    addBox(bx+wx,by+ry,bz+wz,sx,sY,sz,yaw+extraYaw,pitch,layer,layer,layer,col[0]*k[0]*fl,col[1]*k[1]*fl,col[2]*k[2]*fl,br);};
  const sw=Math.sin(m.walkPhase)*0.6*Math.min(1,Math.hypot(m.vel[0],m.vel[2])/2);
  const lookP=m.lookAt?clamp(Math.atan2((m.lookAt.pos[1]+(m.lookAt.eyeH?m.lookAt.eyeH():1))-(m.pos[1]+m.eyeH()),Math.hypot(m.lookAt.pos[0]-m.pos[0],m.lookAt.pos[2]-m.pos[2])),-0.8,0.8):0;
  const W=S.T.white;
  switch(d.model){
    case 'humanoid':{const th=d.thin?0.6:1;
      // legs pivot at hip (y=0.75): offset box centre by rotated half-length
      for(const [side,ph] of [[-1,sw],[1,-sw]]){const cx=side*0.125,hy=0.75;const oyy=hy-0.375*Math.cos(ph),oz=0.375*Math.sin(ph);P(cx,oyy,oz,0.25*th,0.75,0.25*th,c.legs,-ph,W);}
      P(0,1.125,0,0.5,0.75,0.25*th+0.03,c.shirt,0,W);
      for(const [side,ph] of [[-1,-sw],[1,sw]]){const ax=side*0.375,sy2=1.375;
        if(d.armsOut){P(ax,sy2+0.0,-0.3,0.24*th,0.24*th,0.7,c.skin,0,W);}
        else{const a=m.swing>0?-1.2:ph;P(ax,sy2+0.25-0.375*Math.cos(a),0.375*Math.sin(a)*-1,0.25*th,0.75,0.25*th,c.skin,a,W);}}
      P(0,1.76,0,0.5,0.5,0.5,c.skin,lookP,W);P(-0.11,1.8,-0.252,0.1,0.06,0.02,[0.05,0.05,0.05]);P(0.11,1.8,-0.252,0.1,0.06,0.02,[0.05,0.05,0.05]);
      if(m.hand&&m.hand.id===I.BOW)P(0.375,1.1,-0.4,0.06,0.5,0.06,[0.5,0.35,0.2]);
      if(m.hand&&m.hand.id===I.GOLDEN_SWORD)P(0.375,1.2,-0.5,0.06,0.06,0.6,[0.95,0.85,0.3]);
      if(m.armor[0])P(0,1.8,0,0.54,0.3,0.54,[0.8,0.8,0.8]);
      break;}
    case 'creeper':{for(const [x,z,ph] of [[-0.125,-0.2,sw],[0.125,-0.2,-sw],[-0.125,0.2,-sw],[0.125,0.2,sw]])P(x,0.18,z+Math.sin(ph)*0.08,0.25,0.36,0.25,c.skin,0,W);
      P(0,0.93,0,0.5,0.75,0.25,c.skin,0,W);P(0,1.55,0,0.5,0.5,0.5,c.skin,lookP,W);
      P(-0.12,1.62,-0.252,0.12,0.12,0.02,[0.05,0.1,0.05]);P(0.12,1.62,-0.252,0.12,0.12,0.02,[0.05,0.1,0.05]);P(0,1.45,-0.252,0.1,0.16,0.02,[0.05,0.1,0.05]);break;}
    case 'spider':{P(0,0.45,0.25,0.62,0.5,0.75,c.skin,0,W);P(0,0.5,-0.3,0.5,0.45,0.45,c.skin,lookP,W);P(-0.1,0.58,-0.53,0.08,0.08,0.02,[0.9,0.1,0.1]);P(0.1,0.58,-0.53,0.08,0.08,0.02,[0.9,0.1,0.1]);
      for(let i=0;i<4;i++)for(const s2 of [-1,1]){const ph=Math.sin(m.walkPhase+i*1.3)*0.25;P(s2*0.6,0.45,-0.15+i*0.18+ph*0.2,0.8,0.08,0.08,c.skin,0,W);}break;}
    case 'enderman':{for(const [s2,ph] of [[-1,sw],[1,-sw]])P(s2*0.1,0.95-0.95*Math.cos(ph)+0.95,Math.sin(ph)*0.95*-0.5,0.13,1.9,0.13,c.skin,-ph*0.5,W);
      P(0,2.2,0,0.5,0.7,0.25,c.skin,0,W);for(const s2 of [-1,1])P(s2*0.33,1.65,0,0.13,1.7,0.13,c.skin,0,W);P(0,2.8,0,0.5,0.45,0.5,c.skin,lookP,W);
      P(-0.12,2.8,-0.252,0.14,0.05,0.02,m.anger?[1,0.2,0.2]:[0.8,0.3,0.9]);P(0.12,2.8,-0.252,0.14,0.05,0.02,m.anger?[1,0.2,0.2]:[0.8,0.3,0.9]);break;}
    case 'ghast':{P(0,2,0,4,4,4,c.skin,0,W);P(-0.8,2.5,-2.01,0.5,0.3,0.02,[0.2,0.2,0.2]);P(0.8,2.5,-2.01,0.5,0.3,0.02,[0.2,0.2,0.2]);P(0,1.4,-2.01,0.8,0.4,0.02,[0.2,0.2,0.2]);
      for(let i=0;i<9;i++){const tx=((i%3)-1)*1.2,tz=(Math.floor(i/3)-1)*1.2;P(tx,-0.6+Math.sin(m.age*0.1+i)*0.1,tz,0.25,2.2,0.25,c.skin,0,W);}break;}
    case 'blaze':{P(0,1.4,0,0.5,0.5,0.5,c.skin,lookP,W);for(let i=0;i<12;i++){const a=m.age*0.08+i*Math.PI*2/(i<4?4:(i<8?4:4));const r=i<4?0.7:(i<8?0.55:0.35),y=i<4?1.2:(i<8?0.75:0.25);
      P(Math.cos(a)*r,y,Math.sin(a)*r,0.12,0.6,0.12,[0.9,0.7,0.2],0,W);}break;}
    case 'cube':{P(0,0.51,0,1.02,1.02,1.02,c.skin,0,W,0);P(0,0.51,0,0.6,0.6,0.6,c.skin.map(v=>v*0.7),0,W);break;}
    case 'quad':{const hh=d.h;const legH=hh*0.4;
      for(const [x,z,ph] of [[-0.25,-0.3,sw],[0.25,-0.3,-sw],[-0.25,0.3,-sw],[0.25,0.3,sw]])P(x,legH/2,z+Math.sin(ph)*0.08,0.22,legH,0.22,c.skin,0,W);
      const bw=m.type==='sheep'&&!m.sheared?0.8:0.62;P(0,legH+hh*0.2,0,bw,hh*0.42+(m.type==='sheep'&&!m.sheared?0.12:0),0.95,c.skin,0,W);
      if(c.spot){P(0.2,legH+hh*0.25,0.1,bw*0.4,hh*0.2,0.3,c.spot,0,W);P(-0.25,legH+hh*0.28,-0.2,bw*0.35,hh*0.18,0.25,c.spot,0,W);}
      const hc=c.face||c.skin;P(0,legH+hh*0.42,-0.6,0.46,0.42,0.4,hc,lookP,W);
      if(m.type==='pig')P(0,legH+hh*0.36,-0.81,0.22,0.14,0.04,[0.95,0.55,0.55]);
      P(-0.12,legH+hh*0.5,-0.805,0.08,0.06,0.02,[0.05,0.05,0.05]);P(0.12,legH+hh*0.5,-0.805,0.08,0.06,0.02,[0.05,0.05,0.05]);break;}
    case 'chicken':{for(const [x,ph] of [[-0.08,sw],[0.08,-sw]])P(x,0.15,Math.sin(ph)*0.05,0.06,0.3,0.06,[0.9,0.7,0.2],0,W);
      P(0,0.45,0,0.38,0.34,0.5,c.skin,0,W);P(0,0.72,-0.25,0.24,0.3,0.2,c.skin,lookP,W);P(0,0.7,-0.38,0.12,0.08,0.1,[0.95,0.7,0.2]);P(0,0.62,-0.36,0.08,0.1,0.04,[0.9,0.1,0.1]);
      for(const s2 of [-1,1])P(s2*0.2,0.48,0,0.04,0.25,0.35,c.skin,0,W);break;}
  }
  if(m.swing>0)m.swing-=0.5;
}
function drawDragon(e,bx,by,bz,alpha){
  const yaw=e.yaw,cy=Math.cos(yaw),sy=Math.sin(yaw),hurt=e.hurtTime>0;
  const P=(ox,oy,oz,sx,sY,sz,col,pitch=0)=>{const wx=ox*cy+oz*sy,wz=-ox*sy+oz*cy;addBox(bx+wx,by+oy,bz+wz,sx,sY,sz,yaw,pitch,S.T.white,S.T.white,S.T.white,hurt?1:col[0],hurt?0.3:col[1],hurt?0.3:col[2],1);};
  const k=[0.12,0.1,0.14],flap=Math.sin(e.age*0.25)*0.6;
  P(0,1.5,0,2.4,1.6,4.2,k);P(0,2.1,-3.2,1.2,1,1.6,k);P(0,2.2,-4.6,1.6,1.2,1.6,k);P(-0.4,2.4,-5.45,0.3,0.2,0.05,[0.8,0.3,0.9]);P(0.4,2.4,-5.45,0.3,0.2,0.05,[0.8,0.3,0.9]);
  for(let i=0;i<6;i++)P(0,1.4-i*0.05,2.8+i*1.1,1-i*0.12,0.8-i*0.08,1.1,k);
  for(const s2 of [-1,1]){P(s2*3.4,2.2+s2*0+flap*1.5,0,5,0.2,3.2,[0.18,0.14,0.2]);P(s2*7.2,2.2+flap*3,0.4,3,0.15,2.6,[0.2,0.16,0.22]);}
  if(e.beam){const c=e.beam;const dx=c.pos[0]-e.pos[0],dy=c.pos[1]+1.6-(e.pos[1]+1.5),dz=c.pos[2]-e.pos[2],l=Math.hypot(dx,dy,dz);
    for(let i=0;i<l;i+=1.2)addBox(bx+dx*i/l,by+1.5+dy*i/l,bz+dz*i/l,0.15,0.15,0.15,0,0,-1,-1,-1,1,0.6,1,2);}
}
