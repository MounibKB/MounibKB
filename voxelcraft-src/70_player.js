/* =====================================================================
   PLAYER: controller (fixed 60 Hz physics), survival (food/xp), combat,
   mining, item use, placing, death/respawn, sleeping, portals
   ===================================================================== */
const GAMEMODES=['survival','creative','adventure','spectator'];
class Player extends LivingEntity{
  constructor(){super('player',0.6,1.8,20);this.inv=new PlayerInventory();this.armor=this.inv.armor;this.mode='survival';this.flying=false;
    this.food=20;this.saturation=5;this.exhaustion=0;this.foodTimer=0;this.xpLevel=0;this.xpProgress=0;this.xpTotal=0;this.bed=null;this.ready=false;
    this.sprinting=false;this.persistent=true;this.unlocked=new Set();this.adv=new Set();this.stats={blocksMined:0,blocksPlaced:0,mobsKilled:0,deaths:0,distance:0};
    this.useT=0;this.using=null;this.attackT=100;this.swingT=0;this.breaking=null;this.breakProg=0;this.breakCool=0;this.placeCool=0;this.sleeping=0;this.deathMsg='';
    this.walkDist=0;this.stepAcc=0;this.lastSpace=0;this.lastW=0;this.portalCooldown=0;this.camY=0;this.renderPrev=[0,0,0];this.itemCooldowns={};}
  displayName(){return 'Player';}
  alive(){return this.ready&&!this.dead;}
  creativeLike(){return this.mode==='creative'||this.mode==='spectator';}
  spectatorLike(){return this.mode==='spectator';}
  eyeH(){return this.sneaking&&!this.flying?1.27:1.62;}
  isInvulnerableTo(src){return (this.creativeLike()&&!src.bypassCreative)||this.sleeping>0&&false;}
  held(){return this.inv.held();}
  replaceHeld(st){const cur=this.held();if(cur&&cur.count>1&&!this.creativeLike()){cur.count--;this.give(st);}else if(!this.creativeLike()||!cur)this.inv.main[this.inv.sel]=st;else this.give(st);onInventoryChanged();}
  damageHeld(n){if(this.creativeLike())return;const s=this.held();if(!s||!maxDamage(s.id))return;if(damageStack(s,n)){this.inv.main[this.inv.sel]=null;sfx.play('break_tool');particlesAt(eyePos(),8,[0.6,0.6,0.6]);}onInventoryChanged();}
  give(stack){const l=this.inv.insert(stack);if(l){const e=dropItemAt(this.pos[0],this.pos[1]+1.2,this.pos[2],l,false);if(e)e.pickupDelay=40;}}
  exhaust(n){if(this.creativeLike()||world.difficulty===0)return;this.exhaustion+=n;}
  addXP(n){if(n<=0)return;this.xpTotal+=n;this.xpProgress+=n/xpForLevel(this.xpLevel);
    while(this.xpProgress>=1){this.xpProgress=(this.xpProgress-1)*xpForLevel(this.xpLevel);this.xpLevel++;this.xpProgress/=xpForLevel(this.xpLevel);sfx.play('levelup');}updateHud();}
  spendLevels(n){this.xpLevel=Math.max(0,this.xpLevel-n);this.xpProgress=0;updateHud();}
  onDeath(src,attacker){
    this.deathMsg='Player '+(src&&src.msg||'died');this.stats.deaths++;
    if(!world.rules.keepInventory){for(const s of this.inv.all())if(s)dropItemAt(this.pos[0],this.pos[1]+1,this.pos[2],s);this.inv.clear();
      const xp=Math.min(100,this.xpLevel*7);if(xp)spawnXP(this.pos[0],this.pos[1]+0.5,this.pos[2],xp);this.xpLevel=0;this.xpProgress=0;this.xpTotal=0;}
    this.effects.clear();this.fireTicks=0;this.flying=false;this.using=null;
    if(cursorStack){dropItemAt(this.pos[0],this.pos[1]+1,this.pos[2],cursorStack);cursorStack=null;}
    closeScreen(true);showDeath(this.deathMsg);world.metaDirty=true;requestSave('death');
  }
}
const xpForLevel=l=>l<16?2*l+7:(l<31?5*l-38:9*l-158);
const player=new Player();
let camShake=0;
function eyePos(){const a=renderAlpha;const p=player;return [p.renderPrev[0]+(p.pos[0]-p.renderPrev[0])*a,p.renderPrev[1]+(p.pos[1]-p.renderPrev[1])*a+p.camY,p.renderPrev[2]+(p.pos[2]-p.renderPrev[2])*a];}
function forwardVec(){const cp=Math.cos(player.pitch);return [-Math.sin(player.yaw)*cp,Math.sin(player.pitch),-Math.cos(player.yaw)*cp];}
let renderAlpha=1;
/* ---------------- physics step (fixed 60 Hz) ---------------- */
const PHYS_DT=1/60;
function playerPhysics(dt){
  const p=player;
  if(!p.alive()||p.sleeping>0){p.renderPrev=p.pos.slice();return;}
  if(!p.chunkLoaded()){p.renderPrev=p.pos.slice();return;} // wait for terrain: never fall into unknown space
  p.renderPrev=p.pos.slice();
  const k=input;
  let f=(k.forward?1:0)-(k.back?1:0),s=(k.right?1:0)-(k.left?1:0);
  if(touchMove.active){f=-touchMove.y;s=touchMove.x;}
  const sneak=k.sneak&&!p.flying;p.sneaking=sneak;
  // sprint rules
  if(k.sprint&&f>0&&!sneak&&(p.food>6||p.creativeLike())&&!p.using)p.sprinting=true;
  if(f<=0||sneak||(p.food<=6&&!p.creativeLike())||p.hitH&&!p.flying||p.using)p.sprinting=false;
  const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
  let mx=-sin*f+cos*s,mz=-cos*f-sin*s;const ml=Math.hypot(mx,mz);if(ml>1){mx/=ml;mz/=ml;}
  const up=k.jump,down=k.sneak;
  const spec=p.spectatorLike();
  if(p.flying||spec){
    const sp=(p.sprinting?21.6:10.9)*(spec?1.2:1),kk=Math.min(1,dt*10);
    p.vel[0]+=(mx*sp-p.vel[0])*kk;p.vel[2]+=(mz*sp-p.vel[2])*kk;p.vel[1]+=(((up?1:0)-(down?1:0))*8-p.vel[1])*kk;
    if(spec){p.pos[0]+=p.vel[0]*dt;p.pos[1]+=p.vel[1]*dt;p.pos[2]+=p.vel[2]*dt;p.onGround=false;p.fallDist=0;p.updateContacts();return;}
  } else {
    let sp=p.sprinting?5.612:4.317;if(sneak)sp*=0.3;if(p.using)sp*=0.2;
    const spd=p.effectAmp('speed'),slo=p.effectAmp('slowness');if(spd>=0)sp*=1+0.2*(spd+1);if(slo>=0)sp*=Math.max(0,1-0.15*(slo+1));
    const under=p.blockUnder(),ud=under>0?DEF[under&255]:null;if(ud&&ud.speed&&p.onGround)sp*=ud.speed;
    if(p.inWater)sp*=p.sprinting?0.9:0.45;if(p.inLava)sp*=0.35;
    const slip=ud&&p.onGround?ud.slip:0.6;
    const kk=Math.min(1,dt*(p.onGround?(slip>0.9?1.2:16):(p.inWater||p.inLava?6:2.8)));
    p.vel[0]+=(mx*sp-p.vel[0])*kk;p.vel[2]+=(mz*sp-p.vel[2])*kk;
    if(p.inWater||p.inLava){
      p.vel[1]-=(p.inLava?6:8)*dt;p.vel[1]*=Math.pow(p.inLava?0.2:0.4,dt);
      if(up)p.vel[1]=Math.min(p.vel[1]+(p.hitH?40:24)*dt,p.hitH?5.5:3.2);
      else if(sneak)p.vel[1]=Math.max(p.vel[1]-12*dt,-3);
    } else if(p.climbing){
      p.vel[1]=Math.max(p.vel[1]-32*dt,-3);
      if(up||p.hitH)p.vel[1]=2.35;else if(sneak)p.vel[1]=Math.max(0,p.vel[1]);
    } else {
      const g=p.hasEffect('slow_falling')&&p.vel[1]<0?4:32;
      p.vel[1]=Math.max(p.vel[1]-g*dt,-78);
      if(up&&p.onGround&&p.jumpCool<=0){
        const jf=ud&&ud.jump?ud.jump:1;p.vel[1]=9.0*jf+(p.effectAmp('jump_boost')+1)*2;p.jumpCool=0.1;
        if(p.sprinting){p.vel[0]+=-sin*2.5;p.vel[2]+=-cos*2.5;p.exhaust(0.2);}else p.exhaust(0.05);
      }
    }
  }
  p.jumpCool=(p.jumpCool||0)-dt;
  const ox=p.pos[0],oz=p.pos[2];
  p.move(p.vel[0]*dt,p.vel[1]*dt,p.vel[2]*dt);
  if(p.flying&&p.onGround&&!up)p.flying=false;
  const moved=Math.hypot(p.pos[0]-ox,p.pos[2]-oz);p.stats.distance+=moved;
  if(p.sprinting)p.exhaust(0.1*moved);else if(p.inWater)p.exhaust(0.01*moved);
  if(p.onGround&&moved>0.001&&!p.sneaking){p.walkDist+=moved;p.stepAcc+=moved;if(p.stepAcc>(p.sprinting?2.4:1.9)){p.stepAcc=0;const b=p.blockUnder();if(b>0)sfx.block(DEF[b&255].sound,'step',...p.pos);}}
  if(p.inWater&&moved>0.02&&Math.random()<0.02)sfx.play('swim');
  // camera eye height smoothing (sneak)
  const target=p.eyeH();p.camY+=(target-p.camY)*Math.min(1,dt*14);
}
/* ---------------- survival tick (20 TPS) ---------------- */
function playerTick(){
  const p=player;if(!p.alive())return;
  p.age++;
  if(p.sleeping>0){p.sleeping++;if(p.sleeping>=100)wakeUp(true);return;}
  p.tickLiving();
  if(!p.creativeLike()){
    // hunger
    if(p.exhaustion>=4){p.exhaustion-=4;if(p.saturation>0)p.saturation=Math.max(0,p.saturation-1);else if(world.difficulty>0)p.food=Math.max(0,p.food-1);updateHud();}
    const regen=world.rules.naturalRegeneration;
    if(world.difficulty===0){if(p.age%20===0&&p.health<p.maxHealth)p.heal(1);if(p.age%10===0&&p.food<20){p.food++;updateHud();}}
    else if(regen&&p.saturation>0&&p.food>=20&&p.health<p.maxHealth){if(++p.foodTimer>=10){const k=Math.min(p.saturation,6);p.heal(k/6);p.exhaust(k);p.foodTimer=0;}}
    else if(regen&&p.food>=18&&p.health<p.maxHealth){if(++p.foodTimer>=80){p.heal(1);p.exhaust(6);p.foodTimer=0;}}
    else if(p.food<=0){if(++p.foodTimer>=80){const d=world.difficulty;if(p.health>10||d===3||(p.health>1&&d===2))p.hurt(DMG.starve,1);p.foodTimer=0;}}
    else p.foodTimer=0;
  }
  // portals
  if(p.portalCooldown>0)p.portalCooldown--;
  if(p.inPortal){p.portalTicks=(p.portalTicks||0)+1;const need=p.creativeLike()?1:(p.inPortal==='end'?1:80);
    if(p.portalTicks>=need&&p.portalCooldown<=0){const kind=p.inPortal;p.portalTicks=0;p.portalCooldown=100;usePortal(kind);}}
  else p.portalTicks=0;
  // using items (eating / bow)
  if(p.using&&!input.use)releaseUse();
  if(p.using)tickUse();
  p.attackT++;
  if(p.fireTicks>0&&p.age%20===0)camShake=0.2;
}
/* ---------------- raycasts ---------------- */
function raycastBlocks(o,d,maxD,fluids,ignoreUnknown){
  let x=Math.floor(o[0]),y=Math.floor(o[1]),z=Math.floor(o[2]);
  const sx=Math.sign(d[0]),sy=Math.sign(d[1]),sz=Math.sign(d[2]);
  const tdx=sx?Math.abs(1/d[0]):Infinity,tdy=sy?Math.abs(1/d[1]):Infinity,tdz=sz?Math.abs(1/d[2]):Infinity;
  let tmx=sx>0?(x+1-o[0])*tdx:(sx<0?(o[0]-x)*tdx:Infinity),tmy=sy>0?(y+1-o[1])*tdy:(sy<0?(o[1]-y)*tdy:Infinity),tmz=sz>0?(z+1-o[2])*tdz:(sz<0?(o[2]-z)*tdz:Infinity);
  let t=0,face=-1;
  for(let n=0;n<256&&t<=maxD;n++){
    const v=getV(x,y,z);
    if(v<0&&!ignoreUnknown)return null; // unknown space: no hit, stop
    if(v>0){
      if(FLAGS[v]&F_LIQUID){if(fluids&&fluidSource(v))return {x,y,z,v,t,face:face<0?3:face,fluid:true};}
      else{const bs=S.selectionBoxes(v,(dx,dy,dz)=>getV(x+dx,y+dy,z+dz));let best=null;
        for(const b of bs){const tt=rayAABB(o,d,[x+b[0]/16,y+b[1]/16,z+b[2]/16],[x+b[3]/16,y+b[4]/16,z+b[5]/16],true);if(tt&&(!best||tt.t<best.t))best=tt;}
        if(best&&best.t<=maxD)return {x,y,z,v,t:best.t,face:best.face,hit:[o[0]+d[0]*best.t,o[1]+d[1]*best.t,o[2]+d[2]*best.t],boxes:bs};}
    }
    if(tmx<tmy&&tmx<tmz){x+=sx;t=tmx;tmx+=tdx;face=sx>0?0:1;}else if(tmy<tmz){y+=sy;t=tmy;tmy+=tdy;face=sy>0?2:3;}else{z+=sz;t=tmz;tmz+=tdz;face=sz>0?4:5;}
  }
  return null;
}
function rayAABB(o,d,b0,b1,withFace){
  let tmin=-Infinity,tmax=Infinity,f=-1;
  for(let i=0;i<3;i++){
    if(Math.abs(d[i])<1e-12){if(o[i]<b0[i]||o[i]>b1[i])return withFace?null:-1;continue;}
    let t1=(b0[i]-o[i])/d[i],t2=(b1[i]-o[i])/d[i],f1=i*2,f2=i*2+1;if(t1>t2){[t1,t2]=[t2,t1];[f1,f2]=[f2,f1];}
    if(t1>tmin){tmin=t1;f=f1;}if(t2<tmax)tmax=t2;if(tmin>tmax)return withFace?null:-1;
  }
  if(tmax<0)return withFace?null:-1;const t=Math.max(0,tmin);
  return withFace?{t,face:f}:t;
}
/* ---------------- interaction ---------------- */
let target=null,targetEntity=null;
function reach(){return player.creativeLike()?REACH_CREATIVE:REACH;}
function updateTarget(){
  const o=eyePos(),d=forwardVec();
  const h=player.alive()&&!player.spectatorLike()?raycastBlocks(o,d,reach(),false):null;
  target=h;targetEntity=null;let bt=h?h.t:(player.creativeLike()?5:3);
  for(const e of world.entities){if(e.dead||!(e.living||e.type==='end_crystal'||e.type==='fireball'||e.type==='small_fireball'))continue;const a=e.aabb();
    const t=rayAABB(o,d,[a[0]-0.1,a[1]-0.1,a[2]-0.1],[a[3]+0.1,a[4]+0.1,a[5]+0.1]);if(t>=0&&t<bt){bt=t;targetEntity=e;}}
  if(targetEntity)target=null;
}
function attackStrength(){const s=player.held(),it=s&&ITEM[s.id];const spd=it&&it.attackSpeed?it.attackSpeed:4;return clamp(player.attackT/(20/spd),0,1);}
function attackEntity(e){
  const p=player;if(p.spectatorLike())return;
  if(e.type==='fireball'||e.type==='small_fireball'){e.deflect&&e.deflect(forwardVec());p.attackT=0;return;}
  if(e.type==='end_crystal'){e.hurt(null,1);p.attackT=0;return;}
  const s=p.held(),it=s&&ITEM[s.id];let dmg=it&&it.attack?it.attack:1;
  const str=attackStrength();
  const sa=p.effectAmp('strength'),wk=p.effectAmp('weakness');if(sa>=0)dmg+=3*(sa+1);if(wk>=0)dmg-=4*(wk+1);
  dmg*=0.2+str*str*0.8;
  const sharp=enchLvl(s,'sharpness');if(sharp)dmg+=0.5*sharp+0.5;
  const crit=str>0.9&&p.fallDist>0&&!p.onGround&&!p.climbing&&!p.inWater&&!p.sprinting;
  if(crit){dmg*=1.5;particlesAt([e.pos[0],e.pos[1]+e.h*0.7,e.pos[2]],8,[0.9,0.9,0.7]);sfx.play('crit');}
  p.kbBonus=(p.sprinting&&str>0.9?3:0)+enchLvl(s,'knockback')*3;
  if(dmg>0&&e.hurt(mobDmg(p),dmg,p)){
    if(enchLvl(s,'fire_aspect'))e.setFire(4*enchLvl(s,'fire_aspect'));
    if(it&&it.tool&&it.tool.type==='sword'&&str>0.9&&!p.sprinting&&p.onGround&&!crit){ // sweep
      for(const o of world.entities)if(o!==e&&o.living&&!o.dead&&Math.hypot(o.pos[0]-e.pos[0],o.pos[2]-e.pos[2])<1.2&&Math.abs(o.pos[1]-e.pos[1])<0.5)o.hurt(mobDmg(p),1,p);
      sfx.play('sweep');}
    if(p.sprinting)p.sprinting=false;
    if(it&&it.tool)p.damageHeld(it.tool.type==='sword'?1:2);
    p.exhaust(0.1);if(e.dead||e.health<=0)p.stats.mobsKilled++;
  }
  p.kbBonus=0;p.attackT=0;p.swingT=0.3;sfx.play('attack');
}
function toolSpeed(stack,v){
  const d=DEF[v&255],it=stack&&ITEM[stack.id];let sp=1;
  if(it&&it.tool){const t=it.tool;
    if(t.type===d.tool)sp=t.speed;
    else if(t.type==='sword')sp=(v&255)===B.COBWEB?15:(d.key.endsWith('leaves')||d.tool==='hoe'?1.5:1);
    else if(t.type==='shears')sp=(v&255)===B.COBWEB?15:(d.key.endsWith('leaves')?15:(d.key.endsWith('wool')?5:1));
    if(sp>1){const ef=enchLvl(stack,'efficiency');if(ef)sp+=ef*ef+1;}}
  const ha=player.effectAmp('haste');if(ha>=0)sp*=1+0.2*(ha+1);
  const mf=player.effectAmp('mining_fatigue');if(mf>=0)sp*=Math.pow(0.3,Math.min(4,mf+1));
  if(player.headInWater)sp/=5;if(!player.onGround&&!player.flying)sp/=5;
  return sp;
}
function updateMining(dt){
  const p=player;
  if(!input.attack||!target||screenOpen()||!p.alive()||p.spectatorLike()||p.mode==='adventure'){if(!input.attack||!target){p.breaking=null;p.breakProg=0;}return;}
  p.breakCool-=dt;if(p.breakCool>0)return;
  const t=target,same=p.breaking&&p.breaking.x===t.x&&p.breaking.y===t.y&&p.breaking.z===t.z&&p.breaking.v===t.v;
  if(!same){p.breaking={x:t.x,y:t.y,z:t.z,v:t.v};p.breakProg=0;}
  const d=DEF[t.v&255];
  if(p.creativeLike()){if(p.held()&&ITEM[p.held().id].tool&&ITEM[p.held().id].tool.type==='sword')return;breakByPlayer(t);p.breakCool=0.25;return;}
  if(d.hard<0)return;
  const held=p.held();const harvest=canHarvest(t.v&255,held);
  const per=d.hard===0?1:toolSpeed(held,t.v)/d.hard/(harvest?30:100);
  p.breakProg+=per*dt*20;p.swingT=0.3;
  if(Math.random()<dt*5){sfx.block(d.sound,'hit',t.x,t.y,t.z);particlesHit(t.x,t.y,t.z,t.v,t.face);}
  if(p.breakProg>=1){breakByPlayer(t);p.breaking=null;p.breakProg=0;p.breakCool=0.3;}
}
function breakByPlayer(t){
  const p=player,held=p.held(),v=getV(t.x,t.y,t.z);if(v!==t.v)return;
  const d=DEF[v&255];
  destroyBlock(t.x,t.y,t.z,!p.creativeLike(),held,p);
  p.stats.blocksMined++;
  if(!p.creativeLike()){p.exhaust(0.005);if(d.hard>0&&held&&ITEM[held.id].tool)p.damageHeld(1);}
  if(d.key.endsWith('_log'))advance('mine_wood');
}
function consumeHeld(n){if(player.creativeLike())return;const s=player.held();if(!s)return;s.count-=n;if(s.count<=0)player.inv.main[player.inv.sel]=null;onInventoryChanged();}
function useItem(){ // right mouse press
  const p=player;if(!p.alive()||p.spectatorLike())return;
  p.placeCool=0.22;
  const s=p.held(),it=s&&ITEM[s.id];
  if(targetEntity){if(targetEntity.interact&&targetEntity.interact(s)){p.swingT=0.3;return;}
    if(targetEntity.def&&s&&targetEntity.def.breedItems&&targetEntity.def.breedItems.includes(it.key)&&!targetEntity.baby&&!targetEntity.inLove){targetEntity.inLove=600;consumeHeld(1);particlesAt([targetEntity.pos[0],targetEntity.pos[1]+1,targetEntity.pos[2]],6,[1,0.3,0.4]);return;}}
  if(target&&!(input.sneak&&s)){const b=BEH[target.v&255];if(b&&b.onUse){const r=b.onUse(target.x,target.y,target.z,target.v,s);if(r){p.swingT=0.3;return;}}}
  if(it){
    if(it.food&&(p.food<20||it.food.always||p.creativeLike())){startUse('eat');return;}
    if(it.key==='milk_bucket'){startUse('drink');return;}
    if(it.key==='bow'){if(p.creativeLike()||p.inv.count(I.ARROW)>0||enchLvl(s,'infinity'))startUse('bow');return;}
    if(it.use==='throw_snowball'||it.use==='throw_pearl'){if(p.itemCooldowns[it.key]>world.gameTime)return;throwItem(it.use==='throw_pearl'?'ender_pearl':'snowball');consumeHeld(1);if(it.use==='throw_pearl')p.itemCooldowns[it.key]=world.gameTime+20;return;}
    if(it.use==='throw_eye'){if(world.dim===0){const sh=S.locateStructure(world.seed,0,'stronghold',p.pos[0],p.pos[2]);if(sh){const e=throwItem('eye_of_ender');e.target=[sh.x,sh.z];consumeHeld(1);}}return;}
    if(it.use==='bucket'){useBucket(s,it);return;}
    if(it.use==='ignite'&&target){if(tryIgnite(target.x,target.y,target.z,target.face)){sfx.play('flint',target.x,target.y,target.z);p.damageHeld(1);p.swingT=0.3;}return;}
    if(it.key==='bone_meal'&&target){if(boneMeal(target.x,target.y,target.z,target.v)){consumeHeld(1);particlesAt([target.x+0.5,target.y+0.8,target.z+0.5],8,[0.4,0.9,0.4]);}return;}
    if(it.tool&&it.tool.type==='hoe'&&target){const id=target.v&255;if((id===B.DIRT||id===B.GRASS_BLOCK)&&getV(target.x,target.y+1,target.z)===0&&target.face!==2){setV(target.x,target.y,target.z,B.FARMLAND);sfx.block('gravel','place',target.x,target.y,target.z);p.damageHeld(1);p.swingT=0.3;}return;}
    if(it.tool&&it.tool.type==='shovel'&&target){return;}
    if(it.armor){const slot=it.armor.slot;if(!p.armor[slot]){p.armor[slot]=cloneStack(s);p.armor[slot].count=1;consumeHeld(1);if(p.creativeLike())p.inv.main[p.inv.sel]=s;sfx.play('equip');onInventoryChanged();}return;}
    const place=it.block||it.places;if(place&&target){placeBlockItem(place,s,it);return;}
  }
}
function placeBlockItem(id,s,it){
  const p=player,t=target;
  let x=t.x,y=t.y,z=t.z;const hitV=getV(x,y,z);
  const sameSlab=(hitV&255)===id&&DEF[id].place==='slab'&&((hitV>>8)&3)!==2&&((t.face===3&&((hitV>>8)&3)===0)||(t.face===2&&((hitV>>8)&3)===1));
  const sameSnow=(hitV&255)===B.SNOW&&id===B.SNOW;
  if(!sameSlab&&!sameSnow&&!(replaceable(hitV)&&(hitV&255)!==id)){const d=FDIR[t.face];x+=d[0];y+=d[1];z+=d[2];}
  if(y<0||y>255)return;
  const cur=getV(x,y,z);if(cur<0)return;
  if(!(replaceable(cur)||sameSlab||((cur&255)===id&&DEF[id].place==='slab'&&((cur>>8)&3)!==2)||(cur&255)===B.SNOW&&id===B.SNOW))return;
  const hy=t.hit?t.hit[1]-Math.floor(t.hit[1]):0.5;
  let v=placementState(id,{x,y,z,face:t.face,hy,yaw:p.yaw,pitch:p.pitch});if(v<0)return;
  if(DEF[v&255].support&&!canSurvive(x,y,z,v))return;
  if(world.dim===1&&(v&255)===B.WATER)return;
  // don't place solid blocks inside entities
  if(FLAGS[v]&F_SOLID){const bs=S.collisionBoxes(v,(dx,dy,dz)=>getV(x+dx,y+dy,z+dz));
    for(const b of bs){const bb=[x+b[0]/16,y+b[1]/16,z+b[2]/16,x+b[3]/16,y+b[4]/16,z+b[5]/16];
      if(!p.spectatorLike()&&aabbOverlap(...p.aabb(),...bb))return;
      for(const e of world.entities)if(e.living&&!e.dead&&aabbOverlap(...e.aabb(),...bb))return;}}
  if(s.sap!==undefined&&(v&255)===B.SAPLING)v=V(B.SAPLING,s.sap&7);
  if(cur>0&&!(FLAGS[cur]&F_LIQUID)&&(cur&255)!==(v&255))destroyBlock(x,y,z,true,null,false);
  if(!setV(x,y,z,v))return;
  sfx.block(DEF[v&255].sound,'place',x,y,z);p.swingT=0.3;p.stats.blocksPlaced++;
  consumeHeld(1);
}
function boneMeal(x,y,z,v){const id=v&255;
  if([B.WHEAT,B.CARROTS,B.POTATOES].includes(id))return growCrop(x,y,z,v,randInt(2,5));
  if(id===B.SAPLING){if(Math.random()<0.45)growSapling(x,y,z,v);return true;}
  if(id===B.GRASS_BLOCK){for(let i=0;i<40;i++){const nx=x+randInt(-3,3),nz=z+randInt(-3,3),ny=y+randInt(-1,1);if(getId(nx,ny,nz)===B.GRASS_BLOCK&&getV(nx,ny+1,nz)===0)setV(nx,ny+1,nz,Math.random()<0.85?B.SHORT_GRASS:[B.DANDELION,B.POPPY][randInt(0,1)]);}return true;}
  return false;}
function useBucket(s,it){
  const p=player,o=eyePos(),d=forwardVec();
  if(!it.fluid){const h=raycastBlocks(o,d,reach(),true);if(!h||!h.fluid)return;const fid=h.v&255;setV(h.x,h.y,h.z,0);p.replaceHeld(mkStack(fid===B.WATER?I.WATER_BUCKET:I.LAVA_BUCKET,1));sfx.play('bucket_fill');return;}
  const h=raycastBlocks(o,d,reach(),false);if(!h)return;let x=h.x,y=h.y,z=h.z;const hv=h.v;
  if(!replaceable(hv)||(FLAGS[hv]&F_LIQUID)&&false){const dd=FDIR[h.face];x+=dd[0];y+=dd[1];z+=dd[2];}
  const cur=getV(x,y,z);if(cur<0||!replaceable(cur))return;
  if(world.dim===1&&it.fluid===B.WATER){sfx.play('fizz',x,y,z);particlesAt([x+0.5,y+0.5,z+0.5],8,[0.8,0.8,0.8]);}
  else{if(cur>0&&!(FLAGS[cur]&F_LIQUID))destroyBlock(x,y,z,true,null,false);setV(x,y,z,it.fluid);}
  if(!p.creativeLike())p.inv.main[p.inv.sel]=mkStack(I.BUCKET,1);onInventoryChanged();sfx.play('bucket_empty');
}
function throwItem(kind){const p=player,e=new Thrown(kind,p),o=eyePos(),d=forwardVec();e.setPos(o[0]+d[0]*0.3,o[1]-0.1+d[1]*0.3,o[2]+d[2]*0.3);
  const sp=kind==='eye_of_ender'?0:30;e.vel=[d[0]*sp+p.vel[0],d[1]*sp+p.vel[1]*0.3,d[2]*sp+p.vel[2]];world.entities.push(e);sfx.play('throw');p.swingT=0.3;return e;}
function startUse(kind){player.using=kind;player.useT=0;}
function tickUse(){
  const p=player;p.useT++;
  if(p.using==='eat'||p.using==='drink'){if(p.useT%4===0)sfx.play(p.using==='eat'?'eat':'drink');
    if(p.useT>=32){const s=p.held(),it=s&&ITEM[s.id];p.using=null;if(!it)return;
      if(it.food){p.food=Math.min(20,p.food+it.food.n);p.saturation=Math.min(p.food,p.saturation+it.food.s);
        for(const [k,dur,amp,prob] of it.food.effects||[])if(Math.random()<prob)p.addEffect(k,dur,amp);consumeHeld(1);advance('eat');}
      else if(it.key==='milk_bucket'){p.effects.clear();p.absorption=0;if(!p.creativeLike())p.inv.main[p.inv.sel]=mkStack(I.BUCKET,1);}
      sfx.play('burp');updateHud();onInventoryChanged();}}
}
function releaseUse(){
  const p=player;if(p.using==='bow'){const s=p.held();const t=p.useT/20;let f=(t*t+2*t)/3;if(f>1)f=1;
    if(f>=0.1&&s&&s.id===I.BOW){const inf=p.creativeLike()||enchLvl(s,'infinity');
      if(!inf&&p.inv.count(I.ARROW)<=0){p.using=null;return;}
      const a=new Arrow(p,2+enchLvl(s,'power')*0.5);const o=eyePos(),d=forwardVec();a.setPos(o[0],o[1]-0.1,o[2]);a.vel=[d[0]*f*60,d[1]*f*60,d[2]*f*60];a.crit=f>=1;a.pickup=!inf;a.persistent=a.pickup;
      if(enchLvl(s,'flame'))a.fire=true;world.entities.push(a);if(!inf)p.inv.remove(I.ARROW,1);p.damageHeld(1);sfx.play('bow');}}
  p.using=null;
}
/* ---------------- death / respawn / sleep ---------------- */
function respawn(){
  const p=player;hideDeath();
  const bedOk=p.bed&&p.bed.dim===world.dim;
  const sp=bedOk?[p.bed.x+0.5,p.bed.y+0.6,p.bed.z+0.5]:world.spawn.slice();
  p.dead=false;p.health=p.maxHealth;p.food=20;p.saturation=5;p.exhaustion=0;p.air=300;p.fireTicks=0;p.fallDist=0;p.vel=[0,0,0];p.absorption=0;p.deathTime=0;
  if(p.bed&&p.bed.dim!==world.dim||(!bedOk&&world.dim!==0)){changeDimension(0,sp,true);return;}
  p.setPos(sp[0],sp[1],sp[2]);p.renderPrev=p.pos.slice();
  // if the spawn area isn't loaded yet, wait and then place the player safely on the surface
  p.ready=false;awaitSpawn={x:sp[0],z:sp[2],y:sp[1],surface:!bedOk,validateBed:bedOk};
  showLoading('Respawning…');updateHud();world.metaDirty=true;
}
let awaitSpawn=null;
function checkAwaitSpawn(){
  if(!awaitSpawn)return;
  const c=chunkAt(Math.floor(awaitSpawn.x),Math.floor(awaitSpawn.z));
  const pcx=Math.floor(awaitSpawn.x/16),pcz=Math.floor(awaitSpawn.z/16);let ready=0;
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){const cc=chunks.get(ckey(pcx+dx,pcz+dz));if(cc&&cc.data&&cc.hasMesh)ready++;}
  setLoadingProgress(ready/9);if(!c||!c.data||ready<9)return;
  const p=player,x=Math.floor(awaitSpawn.x),z=Math.floor(awaitSpawn.z);
  if(awaitSpawn.validateBed){const b=p.bed;if(!b||getId(b.x,b.y,b.z)!==B.BED){p.bed=null;toast('You have no home bed, or it was obstructed');awaitSpawn.surface=true;awaitSpawn.x=world.spawn[0];awaitSpawn.z=world.spawn[2];p.setPos(world.spawn[0],world.spawn[1],world.spawn[2]);return;}
    const safe=findSafeNear(b.x,b.y,b.z);if(safe)p.setPos(safe[0],safe[1],safe[2]);}
  if(awaitSpawn.surface){const y=surfaceY(x,z);if(y>0)p.setPos(x+0.5,y,z+0.5);}
  if(awaitSpawn.portal){finishPortalArrival();}
  p.renderPrev=p.pos.slice();p.ready=true;awaitSpawn=null;hideLoading();requestSave('spawn');
}
function surfaceY(x,z){for(let y=Math.min(254,DIMS[world.dim].height-2);y>0;y--){const v=getV(x,y,z);if(v<0)return -1;if(v>0&&(FLAGS[v]&(F_SOLID|F_LIQUID))&&(FLAGS[v]&F_SOLID||true)){
  if(world.dim===1&&y>=120)continue;const a=getV(x,y+1,z),b=getV(x,y+2,z);if((a===0||a>0&&!(FLAGS[a]&F_SOLID))&&(b===0||b>0&&!(FLAGS[b]&F_SOLID)))return y+1;}}return -1;}
function findSafeNear(x,y,z){for(let r=0;r<=2;r++)for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++)for(const dy of [0,1,-1]){const px=x+dx,py=y+dy,pz=z+dz;
  const a=[px+0.2,py,pz+0.2,px+0.8,py+1.8,pz+0.8];if(solidTop(getV(px,py-1,pz))&&aabbFree(a))return [px+0.5,py,pz+0.5];}return [x+0.5,y+0.6,z+0.5];}
function trySleep(x,y,z,v){
  const p=player;
  if(!DIMS[world.dim].bedWorks){destroyBlock(x,y,z,false);explode(x+0.5,y+0.5,z+0.5,5,true,true,null);return;}
  if(Math.hypot(p.pos[0]-x-0.5,p.pos[2]-z-0.5)>3){toast('You may not rest now; the bed is too far away');return;}
  const s=v>>8;const hx=(s&4)?x:x+HVEC[s&3][0],hz=(s&4)?z:z+HVEC[s&3][1];
  p.bed={x:hx,y,z:hz,dim:world.dim};toast('Respawn point set');world.metaDirty=true;
  const t=world.dayTime%24000;if(!(t>=12542&&t<=23459)&&!world.weather.thunder){toast('You can only sleep at night or during thunderstorms');return;}
  if(!p.creativeLike()&&world.entities.some(e=>e.def&&e.def.category==='monster'&&!e.dead&&Math.abs(e.pos[0]-x)<8&&Math.abs(e.pos[1]-y)<5&&Math.abs(e.pos[2]-z)<8)){toast('You may not rest now; there are monsters nearby');return;}
  p.sleeping=1;p.sleepPos=[p.pos[0],p.pos[1],p.pos[2]];p.setPos(x+0.5,y+0.6,z+0.5);p.vel=[0,0,0];
}
function wakeUp(skip){const p=player;if(skip){world.dayTime=Math.ceil(world.dayTime/24000)*24000;world.weather.rain=false;world.weather.thunder=false;world.weather.rainTime=12000+randInt(0,168000);advance('sleep');}
  p.sleeping=0;const b=p.bed;const safe=b?findSafeNear(b.x,b.y,b.z):p.pos;p.setPos(safe[0],safe[1],safe[2]);world.metaDirty=true;requestSave('sleep');}
