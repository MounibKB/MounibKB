/* =====================================================================
   ENTITIES: base class, box-collision physics, damage sources, effects,
   LivingEntity (health, armour, invulnerability, fire, air, effects)
   ===================================================================== */
let nextEntityId=1;
const DMG={};
function dmgType(key,o){DMG[key]=Object.assign({key,msg:'died'},o||{});return DMG[key];}
dmgType('generic');dmgType('fall',{bypassArmor:true,msg:'hit the ground too hard'});dmgType('lava',{fire:true,msg:'tried to swim in lava'});
dmgType('inFire',{fire:true,msg:'went up in flames'});dmgType('onFire',{fire:true,bypassArmor:true,msg:'burned to death'});
dmgType('drown',{bypassArmor:true,msg:'drowned'});dmgType('starve',{bypassArmor:true,msg:'starved to death'});
dmgType('suffocate',{bypassArmor:true,msg:'suffocated in a wall'});dmgType('cactus',{msg:'was pricked to death'});
dmgType('void',{bypassArmor:true,bypassInvul:true,msg:'fell out of the world'});dmgType('explosion',{explosion:true,scales:true,msg:'blew up'});
dmgType('magic',{bypassArmor:true,msg:'was killed by magic'});dmgType('wither',{bypassArmor:true,msg:'withered away'});
dmgType('hotFloor',{fire:true,msg:'discovered the floor was lava'});dmgType('lightning',{fire:true,msg:'was struck by lightning'});
dmgType('kill',{bypassArmor:true,bypassInvul:true,bypassCreative:true,msg:'died'});dmgType('flyIntoWall',{bypassArmor:true,msg:'experienced kinetic energy'});
dmgType('dragonBreath',{bypassArmor:true,msg:'was roasted in dragon breath'});
const mobDmg=(attacker)=>({key:'mob',attacker,scales:attacker&&attacker!==player,msg:'was slain by '+(attacker?attacker.displayName():'?')});
const projDmg=(attacker,proj)=>({key:'projectile',projectile:true,attacker,scales:attacker&&attacker!==player,msg:'was shot by '+(attacker?attacker.displayName():'?')});
const blastDmg=(attacker)=>({key:'explosion',explosion:true,scales:true,attacker,msg:attacker?'was blown up by '+attacker.displayName():'blew up'});
const EFFECTS={speed:{good:true,color:'#7cafc6',name:'Speed'},slowness:{good:false,color:'#5a6c81',name:'Slowness'},haste:{good:true,color:'#d9c043',name:'Haste'},
  mining_fatigue:{good:false,color:'#4a4217',name:'Mining Fatigue'},strength:{good:true,color:'#932423',name:'Strength'},jump_boost:{good:true,color:'#22ff4c',name:'Jump Boost'},
  regeneration:{good:true,color:'#cd5cab',name:'Regeneration'},resistance:{good:true,color:'#99453a',name:'Resistance'},fire_resistance:{good:true,color:'#e49a3a',name:'Fire Resistance'},
  water_breathing:{good:true,color:'#2e5299',name:'Water Breathing'},night_vision:{good:true,color:'#1f1fa1',name:'Night Vision'},invisibility:{good:true,color:'#7f8392',name:'Invisibility'},
  hunger:{good:false,color:'#587653',name:'Hunger'},weakness:{good:false,color:'#484d48',name:'Weakness'},poison:{good:false,color:'#4e9331',name:'Poison'},
  wither:{good:false,color:'#352a27',name:'Wither'},absorption:{good:true,color:'#2552a5',name:'Absorption'},saturation:{good:true,color:'#f82423',name:'Saturation'},
  slow_falling:{good:true,color:'#f3cfb9',name:'Slow Falling'},instant_health:{good:true,color:'#f82423',name:'Instant Health',instant:true},instant_damage:{good:false,color:'#430a09',name:'Instant Damage',instant:true}};
/* ---------------- collision ---------------- */
const _boxes=[];
function collectBoxes(x0,y0,z0,x1,y1,z1){
  _boxes.length=0;
  const bx0=Math.floor(x0),bx1=Math.floor(x1),by0=Math.floor(y0)-1,by1=Math.floor(y1),bz0=Math.floor(z0),bz1=Math.floor(z1);
  for(let x=bx0;x<=bx1;x++)for(let z=bz0;z<=bz1;z++)for(let y=by0;y<=by1;y++){
    const v=getV(x,y,z);if(v===0)continue;
    if(v<0){_boxes.push([x,y,z,x+1,y+1,z+1]);continue;} // unknown space is a wall
    if(!(FLAGS[v]&F_SOLID))continue;
    const bs=S.collisionBoxes(v,(dx,dy,dz)=>getV(x+dx,y+dy,z+dz));
    for(const b of bs)_boxes.push([x+b[0]/16,y+b[1]/16,z+b[2]/16,x+b[3]/16,y+b[4]/16,z+b[5]/16]);
  }
  return _boxes;
}
const EPS=1e-7;
function clipY(bs,a,dy){for(const b of bs){if(b[0]>=a[3]-EPS||b[3]<=a[0]+EPS||b[2]>=a[5]-EPS||b[5]<=a[2]+EPS)continue;
  if(dy>0&&b[1]>=a[4]-EPS)dy=Math.min(dy,b[1]-a[4]);else if(dy<0&&b[4]<=a[1]+EPS)dy=Math.max(dy,b[4]-a[1]);}return dy;}
function clipX(bs,a,dx){for(const b of bs){if(b[1]>=a[4]-EPS||b[4]<=a[1]+EPS||b[2]>=a[5]-EPS||b[5]<=a[2]+EPS)continue;
  if(dx>0&&b[0]>=a[3]-EPS)dx=Math.min(dx,b[0]-a[3]);else if(dx<0&&b[3]<=a[0]+EPS)dx=Math.max(dx,b[3]-a[0]);}return dx;}
function clipZ(bs,a,dz){for(const b of bs){if(b[1]>=a[4]-EPS||b[4]<=a[1]+EPS||b[0]>=a[3]-EPS||b[3]<=a[0]+EPS)continue;
  if(dz>0&&b[2]>=a[5]-EPS)dz=Math.min(dz,b[2]-a[5]);else if(dz<0&&b[5]<=a[2]+EPS)dz=Math.max(dz,b[5]-a[2]);}return dz;}
const moveAABB=(a,dx,dy,dz)=>{a[0]+=dx;a[3]+=dx;a[1]+=dy;a[4]+=dy;a[2]+=dz;a[5]+=dz;};
function collideMove(a,dx,dy,dz){ // returns [dx,dy,dz] actually moved, mutates a
  const bs=collectBoxes(Math.min(a[0],a[0]+dx),Math.min(a[1],a[1]+dy),Math.min(a[2],a[2]+dz),Math.max(a[3],a[3]+dx),Math.max(a[4],a[4]+dy),Math.max(a[5],a[5]+dz));
  const ry=clipY(bs,a,dy);moveAABB(a,0,ry,0);
  const rx=clipX(bs,a,dx);moveAABB(a,rx,0,0);
  const rz=clipZ(bs,a,dz);moveAABB(a,0,0,rz);
  return [rx,ry,rz];
}
function aabbFree(a){const bs=collectBoxes(a[0],a[1],a[2],a[3],a[4],a[5]);for(const b of bs)if(b[0]<a[3]-EPS&&b[3]>a[0]+EPS&&b[1]<a[4]-EPS&&b[4]>a[1]+EPS&&b[2]<a[5]-EPS&&b[5]>a[2]+EPS)return false;return true;}
function aabbOverlap(ax0,ay0,az0,ax1,ay1,az1,bx0,by0,bz0,bx1,by1,bz1){return ax0<bx1&&ax1>bx0&&ay0<by1&&ay1>by0&&az0<bz1&&az1>bz0;}
/* ---------------- Entity ---------------- */
class Entity{
  constructor(type,w,h){this.id=nextEntityId++;this.type=type;this.pos=[0,0,0];this.prev=[0,0,0];this.vel=[0,0,0];this.w=w;this.h=h;
    this.yaw=0;this.pitch=0;this.prevYaw=0;this.onGround=false;this.hitH=false;this.hitV=false;this.inWater=false;this.inLava=false;this.headInWater=false;
    this.climbing=false;this.inWeb=false;this.fallDist=0;this.dead=false;this.age=0;this.fireTicks=0;this.noGravity=false;this.persistent=false;
    this.stepHeight=0;this.sneaking=false;this.living=false;this.fireImmune=false;this.portalTicks=0;this.portalCooldown=0;this.inPortal=null;}
  displayName(){return this.type;}
  aabb(){const p=this.pos,hw=this.w/2;return [p[0]-hw,p[1],p[2]-hw,p[0]+hw,p[1]+this.h,p[2]+hw];}
  setPos(x,y,z){this.pos[0]=x;this.pos[1]=y;this.pos[2]=z;this.prev[0]=x;this.prev[1]=y;this.prev[2]=z;}
  chunkLoaded(){const c=chunkAt(Math.floor(this.pos[0]),Math.floor(this.pos[2]));return !!(c&&c.data);}
  // move with collision, step-up, sneak edge guard; updates onGround/hitH/fallDist and applies landing
  move(dx,dy,dz){
    if(this.inWeb){dx*=0.25;dy*=0.05;dz*=0.25;}
    const a=this.aabb();const odx=dx,ody=dy,odz=dz;
    if(this.sneaking&&this.onGround){
      const probe=(ddx,ddz)=>{const b=[a[0]+ddx,a[1]-0.6,a[2]+ddz,a[3]+ddx,a[1],a[5]+ddz];return !aabbFree(b);};
      const st=0.05;
      while(dx!==0&&!probe(dx,0)){dx=Math.abs(dx)<st?0:dx-Math.sign(dx)*st;}
      while(dz!==0&&!probe(0,dz)){dz=Math.abs(dz)<st?0:dz-Math.sign(dz)*st;}
      while(dx!==0&&dz!==0&&!probe(dx,dz)){dx=Math.abs(dx)<st?0:dx-Math.sign(dx)*st;dz=Math.abs(dz)<st?0:dz-Math.sign(dz)*st;}
    }
    const a0=a.slice();
    let [rx,ry,rz]=collideMove(a,dx,dy,dz);
    const blockedH=rx!==dx||rz!==dz;
    if(this.stepHeight>0&&blockedH&&(this.onGround||(ody<0&&ry!==ody))){
      const b=a0.slice();const up=collideMove(b,0,this.stepHeight,0)[1];const h=collideMove(b,dx,0,dz);const down=collideMove(b,0,-up+Math.min(0,dy),0)[1];
      if(h[0]*h[0]+h[2]*h[2]>rx*rx+rz*rz+1e-9){for(let i=0;i<6;i++)a[i]=b[i];rx=h[0];rz=h[2];ry=up+down;}
    }
    this.pos[0]=(a[0]+a[3])/2;this.pos[1]=a[1];this.pos[2]=(a[2]+a[5])/2;
    this.hitH=rx!==dx||rz!==dz;this.hitV=ry!==dy;
    const wasGround=this.onGround;
    this.onGround=dy<0&&ry!==dy;
    if(rx!==dx)this.vel[0]=0;if(rz!==dz)this.vel[2]=0;
    const impactVel=this.vel[1];
    if(ry!==dy)this.vel[1]=0;
    this.updateContacts();
    // fall distance uses the real displacement; entering fluid/climbable in the same step cancels it
    if(this.inWater||this.inLava||this.climbing||this.noFall)this.fallDist=0;
    else if(ry<0)this.fallDist-=ry;
    if(this.onGround&&!wasGround||this.onGround&&this.fallDist>0){this.onLand(this.fallDist,impactVel);this.fallDist=0;}
    void odx;void odz;
  }
  updateContacts(){
    const a=this.aabb();this.inWater=false;this.inLava=false;this.headInWater=false;this.headInLava=false;this.climbing=false;this.inWeb=false;this.inPortal=null;
    const eyeY=this.pos[1]+this.eyeH();
    for(let x=Math.floor(a[0]);x<=Math.floor(a[3]-1e-6);x++)for(let z=Math.floor(a[2]);z<=Math.floor(a[5]-1e-6);z++)for(let y=Math.floor(a[1]);y<=Math.floor(a[4]-1e-6);y++){
      const v=getV(x,y,z);if(v<=0)continue;const id=v&255;
      if(FLAGS[v]&F_LIQUID){const s=v>>8,top=(getId(x,y+1,z)===id)?1:((s&8)?0.9:[0.89,0.78,0.67,0.56,0.44,0.33,0.22,0.11][s&7]);
        if(a[1]<y+top){if(id===B.WATER)this.inWater=true;else this.inLava=true;}
        if(eyeY>=y&&eyeY<y+top){if(id===B.WATER)this.headInWater=true;else this.headInLava=true;}}
      if(FLAGS[v]&F_CLIMB)this.climbing=true;
      if(id===B.OAK_TRAPDOOR&&((v>>8)&4)&&getId(x,y-1,z)===B.LADDER)this.climbing=true;
      const b=BEH[id];if(b&&b.onEntityInside&&this.age>0)safeCall(b.onEntityInside,this,x,y,z,v);
    }
    // cactus/berry-like touch damage (inflated box)
    if(this.living)for(let x=Math.floor(a[0]-0.01);x<=Math.floor(a[3]+0.01);x++)for(let z=Math.floor(a[2]-0.01);z<=Math.floor(a[5]+0.01);z++)for(let y=Math.floor(a[1]);y<=Math.floor(a[4]);y++)
      if(getId(x,y,z)===B.CACTUS){const px=x+1/16,pz=z+1/16;if(aabbOverlap(a[0]-0.01,a[1],a[2]-0.01,a[3]+0.01,a[4],a[5]+0.01,px,y,pz,px+14/16,y+1,pz+14/16))this.hurt&&this.hurt(DMG.cactus,1);}
  }
  eyeH(){return this.h*0.85;}
  blockUnder(){const v=getV(Math.floor(this.pos[0]),Math.floor(this.pos[1]-0.2),Math.floor(this.pos[2]));return v;}
  onLand(fall,impactVel){}
  applyGravity(g){if(!this.noGravity)this.vel[1]-=g;}
  tick(){this.age++;}
  save(){return {type:this.type,pos:this.pos.slice(),vel:this.vel.slice(),yaw:this.yaw,age:this.age,fire:this.fireTicks};}
  load(o){this.setPos(finite(o.pos[0],0),clamp(finite(o.pos[1],80),-64,400),finite(o.pos[2],0));this.vel=[finite(o.vel&&o.vel[0],0),finite(o.vel&&o.vel[1],0),finite(o.vel&&o.vel[2],0)];
    this.yaw=finite(o.yaw,0);this.age=finite(o.age,0)|0;this.fireTicks=finite(o.fire,0)|0;}
  remove(){this.dead=true;this.removed=true;}
  setFire(sec){if(!this.fireImmune&&!(this.hasEffect&&this.hasEffect('fire_resistance')))this.fireTicks=Math.max(this.fireTicks,sec*20);}
  knockback(str,dx,dz){const l=Math.hypot(dx,dz)||1;const kr=this.kbResist?this.kbResist():0;str*=1-kr;if(str<=0)return;
    this.vel[0]=this.vel[0]/2+dx/l*str;this.vel[2]=this.vel[2]/2+dz/l*str;if(this.onGround)this.vel[1]=Math.min(8,this.vel[1]/2+str*0.8);}
}
/* ---------------- LivingEntity ---------------- */
class LivingEntity extends Entity{
  constructor(type,w,h,maxHealth){super(type,w,h);this.living=true;this.maxHealth=maxHealth;this.health=maxHealth;this.absorption=0;this.hurtTime=0;this.invul=0;this.lastHurt=0;
    this.effects=new Map();this.armor=[null,null,null,null];this.hand=null;this.air=300;this.deathTime=0;this.stepHeight=0.6;this.lastAttacker=null;this.attackCool=0;}
  hasEffect(k){return this.effects.has(k);}
  effectAmp(k){const e=this.effects.get(k);return e?e.amp:-1;}
  addEffect(k,dur,amp=0){if(!EFFECTS[k])return;const E=EFFECTS[k];
    if(E.instant){const lv=amp+1;if(k==='instant_health')this.heal(4*(1<<(lv-1)));else this.hurt(DMG.magic,6*(1<<(lv-1)));return;}
    const cur=this.effects.get(k);if(cur&&cur.amp>amp&&cur.dur>dur)return;this.effects.set(k,{amp,dur});
    if(k==='absorption')this.absorption=Math.max(this.absorption,4*(amp+1));
    if(this===player)updateHud();}
  removeEffect(k){if(this.effects.delete(k)&&k==='absorption')this.absorption=0;if(this===player)updateHud();}
  armorValue(){let d=0,t=0;for(const s of this.armor)if(s&&ITEM[s.id]&&ITEM[s.id].armor){d+=ITEM[s.id].armor.def;t+=ITEM[s.id].armor.tough;}return [d,t];}
  kbResist(){let k=0;for(const s of this.armor)if(s&&ITEM[s.id]&&ITEM[s.id].armor)k+=ITEM[s.id].armor.kb||0;return k;}
  heal(n){if(this.dead)return;this.health=Math.min(this.maxHealth,this.health+n);if(this===player)updateHud();}
  // central damage pipeline: returns true if damage was applied
  hurt(src,amount,attacker){
    if(this.dead||amount<=0)return false;
    if(this.isInvulnerableTo&&this.isInvulnerableTo(src))return false;
    if(src.fire&&(this.fireImmune||this.hasEffect('fire_resistance')))return false;
    attacker=attacker||src.attacker||null;
    if(src.scales&&this===player){const d=world.difficulty;if(d===0)return false;if(d===1)amount=Math.min(amount/2+1,amount);else if(d===3)amount*=1.5;}
    let applied=amount;
    if(this.invul>0&&!src.bypassInvul){if(amount<=this.lastHurt)return false;applied=amount-this.lastHurt;this.lastHurt=amount;}
    else{this.lastHurt=amount;this.invul=10;this.hurtTime=10;}
    if(!src.bypassArmor){const [def,tough]=this.armorValue();if(def>0){applied=applied*(1-Math.min(20,Math.max(def/5,def-applied/(2+tough/4)))/25);this.damageArmor(amount);}}
    const res=this.effectAmp('resistance');if(res>=0&&src.key!=='kill')applied*=Math.max(0,1-0.2*(res+1));
    let epf=0;for(const s of this.armor){if(!s)continue;epf+=enchLvl(s,'protection');if(src.key==='fall')epf+=3*enchLvl(s,'feather_falling');}
    if(epf>0&&!src.bypassInvul)applied*=1-Math.min(20,epf)*0.04;
    if(this.absorption>0){const k=Math.min(this.absorption,applied);this.absorption-=k;applied-=k;}
    this.health-=applied;this.lastAttacker=attacker;
    if(this.onHurt)this.onHurt(src,applied,attacker);
    if(attacker&&attacker.pos&&!src.explosion){const dx=this.pos[0]-attacker.pos[0],dz=this.pos[2]-attacker.pos[2];this.knockback(src.projectile?3:4.2+(attacker.kbBonus||0),dx,dz);}
    if(this.health<=0){this.health=0;this.die(src,attacker);}
    if(this===player){updateHud();player.exhaust(0.1);}
    return true;
  }
  damageArmor(amount){const n=Math.max(1,Math.floor(amount/4));for(let i=0;i<4;i++){const s=this.armor[i];if(!s)continue;if(damageStack(s,n)){this.armor[i]=null;sfx.play('break_tool');}}}
  die(src,attacker){this.dead=true;this.deathTime=0;if(this.onDeath)this.onDeath(src,attacker);}
  tickLiving(){
    if(this.invul>0)this.invul--;if(this.hurtTime>0)this.hurtTime--;
    for(const [k,e] of this.effects){
      if(k==='regeneration'&&this.age%Math.max(1,50>>e.amp)===0&&this.health<this.maxHealth)this.heal(1);
      if(k==='poison'&&this.age%Math.max(1,25>>e.amp)===0&&this.health>1)this.hurt(DMG.magic,1);
      if(k==='wither'&&this.age%Math.max(1,40>>e.amp)===0)this.hurt(DMG.wither,1);
      if(k==='hunger'&&this===player)player.exhaust(0.005*(e.amp+1));
      if(k==='saturation'&&this===player){player.food=Math.min(20,player.food+e.amp+1);player.saturation=Math.min(player.food,player.saturation+2*(e.amp+1));}
      if(--e.dur<=0)this.removeEffect(k);
    }
    if(this.fireTicks>0){if(this.inWater||(world.weather.rain&&skyVisible(Math.floor(this.pos[0]),Math.floor(this.pos[1]+this.h),Math.floor(this.pos[2]))))this.fireTicks=0;
      else{if(this.fireTicks%20===0)this.hurt(DMG.onFire,1);this.fireTicks--;}}
    if(this.inLava){this.setFire(15);this.hurt(DMG.lava,4);}
    // breathing
    if(this.headInWater&&!this.canBreatheWater){if(!this.hasEffect('water_breathing')){const resp=enchLvl(this.armor[0],'respiration');if(!resp||Math.random()<1/(resp+1))this.air--;}
      if(this.air<=-20){this.air=0;this.hurt(DMG.drown,2);}}
    else this.air=Math.min(300,this.air+4);
    // suffocation
    const ex=Math.floor(this.pos[0]),ey=Math.floor(this.pos[1]+this.eyeH()),ez=Math.floor(this.pos[2]);const hv=getV(ex,ey,ez);
    if(hv>0&&(FLAGS[hv]&F_OPAQUE)&&(FLAGS[hv]&F_SOLID)&&(FLAGS[hv]&F_FULLCOL)&&this.age%10===0&&!(this===player&&player.spectatorLike()))this.hurt(DMG.suffocate,1);
    if(this.pos[1]<-64&&this.age%10===0)this.hurt(DMG.void,4);
    const under=this.blockUnder();if(under>0&&this.onGround){const b=BEH[under&255];if(b&&b.onStep)safeCall(b.onStep,this);}
  }
  onLand(fall,impactVel){
    const under=this.blockUnder(),uid=under>0?under&255:0;
    const d=DEF[uid];
    if(uid===B.SLIME_BLOCK&&!this.sneaking){this.vel[1]=-impactVel*0.95;if(this.vel[1]>2)this.onGround=false;return;}
    if(uid===B.FARMLAND)trampleFarmland(Math.floor(this.pos[0]),Math.floor(this.pos[1]-0.2),Math.floor(this.pos[2]),fall);
    let dmg=Math.ceil(fall-3-(this.effectAmp('jump_boost')+1));
    if(d&&d.fallMul!==undefined)dmg=Math.floor(dmg*d.fallMul);
    if(this.hasEffect('slow_falling'))dmg=0;
    if(dmg>0){this.hurt(DMG.fall,dmg);sfx.play(dmg>4?'fall_big':'fall_small',...this.pos);}
    if(fall>1.5&&this===player)sfx.block(d?d.sound:'stone','step',...this.pos);
  }
  saveLiving(o){o.health=this.health;o.effects=[...this.effects].map(([k,e])=>[k,e.dur,e.amp]);o.air=this.air;if(this.armor.some(Boolean))o.armor=this.armor.map(cloneStack);if(this.hand)o.hand=cloneStack(this.hand);return o;}
  loadLiving(o){this.health=clamp(finite(o.health,this.maxHealth),0.5,this.maxHealth);this.air=clamp(finite(o.air,300)|0,-20,300);
    if(Array.isArray(o.effects))for(const e of o.effects)if(Array.isArray(e)&&EFFECTS[e[0]])this.effects.set(e[0],{dur:clamp(e[1]|0,1,1e6),amp:clamp(e[2]|0,0,5)});
    if(Array.isArray(o.armor))this.armor=[0,1,2,3].map(i=>sanitizeStack(o.armor[i]));if(o.hand)this.hand=sanitizeStack(o.hand);}
}
function damageStack(s,n){ // apply durability damage to a stack; returns true if it broke
  const md=maxDamage(s.id);if(!md)return false;const ub=enchLvl(s,'unbreaking');
  for(let i=0;i<n;i++){if(ub&&Math.random()>1/(ub+1))continue;s.dmg=(s.dmg|0)+1;}
  return s.dmg>=md;
}
function entitiesInBox(x0,y0,z0,x1,y1,z1,filter){const out=[];for(const e of world.entities){if(e.dead)continue;const a=e.aabb();if(aabbOverlap(a[0],a[1],a[2],a[3],a[4],a[5],x0,y0,z0,x1,y1,z1)&&(!filter||filter(e)))out.push(e);}
  if(player.alive()&&!filter){const a=player.aabb();if(aabbOverlap(a[0],a[1],a[2],a[3],a[4],a[5],x0,y0,z0,x1,y1,z1))out.push(player);}return out;}
function pushEntities(x,y,z,d,n){for(const e of entitiesInBox(x,y,z,x+1,y+1,z+1,()=>true).concat(player.alive()&&aabbOverlap(...player.aabb(),x,y,z,x+1,y+1,z+1)?[player]:[])){
  e.move(d[0],d[1]>0?d[1]+0.01:d[1],d[2]);}}
function skyVisible(x,y,z){if(!DIMS[world.dim].sky)return false;const h=heightAt(x,z);return h<0||y>h;}
