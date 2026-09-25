/* =====================================================================
   MAIN: world lifecycle, environment (time/weather), game tick, render, loop
   ===================================================================== */
const envCache={daylight:1,sky:[0.5,0.7,1],horizon:[0.7,0.8,1]};
let flashSky=0,entityAlpha=1,lastT=performance.now(),frames=0,fpsT=0,drawnChunks=0,drawnTris=0,debugT=0,musicT=6000+Math.random()*6000,autosaveT=0;
const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
function computeEnv(){
  const D=DIMS[world.dim];
  if(!D.sky){const f=D.fog;envCache.daylight=1;envCache.sky=f;envCache.horizon=f;envCache.sunH=0;envCache.ang=0;envCache.stars=world.dim===2?0.6:0;return envCache;}
  const ang=((world.dayTime%24000)/24000)*Math.PI*2,sunH=Math.sin(ang);
  const day=S.smoothstep(-0.18,0.25,sunH);
  const rain=world.weather.rainLevel,th=world.weather.thunderLevel;
  let daylight=0.18+0.82*day;daylight*=1-rain*0.28-th*0.3;
  let top=lerp3([0.01,0.01,0.04],[0.45,0.63,1.0],day),hor=lerp3([0.03,0.04,0.09],[0.72,0.83,1.0],day);
  const dusk=Math.max(0,1-Math.abs(sunH)/0.3)*(day>0.02?0.6:0.25);hor=lerp3(hor,[0.95,0.55,0.35],dusk);
  const grey=lerp3(hor,[0.45*day+0.05,0.48*day+0.05,0.52*day+0.06],rain*0.85);hor=grey;top=lerp3(top,[0.35*day+0.03,0.38*day+0.03,0.42*day+0.05],rain*0.85);
  if(flashSky>0){hor=lerp3(hor,[1,1,1],flashSky*0.6);top=lerp3(top,[1,1,1],flashSky*0.6);daylight=Math.min(1,daylight+flashSky*0.8);}
  Object.assign(envCache,{daylight,sky:top,horizon:hor,sunH,ang,stars:(1-day)*(1-rain)});
  return envCache;
}
function weatherTick(){
  const w=world.weather;
  if(DIMS[world.dim].sky&&world.rules.doWeatherCycle){
    if(--w.rainTime<=0){w.rain=!w.rain;w.rainTime=w.rain?12000+randInt(0,12000):12000+randInt(0,168000);world.metaDirty=true;}
    if(--w.thunderTime<=0){w.thunder=!w.thunder;w.thunderTime=w.thunder?3600+randInt(0,12000):12000+randInt(0,168000);}
  }
  const tr=w.rain&&DIMS[world.dim].sky?1:0,tt=w.rain&&w.thunder&&DIMS[world.dim].sky?1:0;
  w.rainLevel+=clamp(tr-w.rainLevel,-0.01,0.01);w.thunderLevel+=clamp(tt-w.thunderLevel,-0.01,0.01);
  if(w.thunderLevel>0.9&&player.alive()&&Math.random()<1/(20*25)){ // lightning
    const x=Math.floor(player.pos[0]+randInt(-48,48)),z=Math.floor(player.pos[2]+randInt(-48,48)),h=heightAt(x,z);
    if(h>0&&BIOMES[biomeAt(x,z)].precip==='rain'){const l=new Lightning();l.setPos(x+0.5,h+1,z+0.5);world.entities.push(l);}}
}
function gameTick(){
  world.gameTime++;world.playTicks++;
  if(world.rules.doDaylightCycle&&!DIMS[world.dim].fixedTime)world.dayTime++;
  weatherTick();
  const pcx=Math.floor(player.pos[0]/16),pcz=Math.floor(player.pos[2]/16);
  runScheduledTicks();processUpdates();processWires();processUpdates();
  randomTicks(pcx,pcz);
  tickBlockEntities();
  const ents=world.entities;
  for(let i=0;i<ents.length;i++){const e=ents[i];if(e.removed)continue;e.prev[0]=e.pos[0];e.prev[1]=e.pos[1];e.prev[2]=e.pos[2];e.prevYaw=e.yaw;
    try{e.tick();if(e.def)mobCommonTick(e);}catch(err){reportError('entity '+e.type,err);e.remove();}}
  if(ents.some(e=>e.removed||(!e.living&&e.dead)))world.entities=ents.filter(e=>!e.removed&&!(!e.living&&e.dead));
  if(world.gameTime%20===0)spawnCycle();
  playerTick();
  while(pendingDrops.length)player.give(pendingDrops.shift());
  if(flashSky>0)flashSky=Math.max(0,flashSky-0.1);
  if(--musicT<=0){musicT=6000+randInt(0,12000);sfx.music();}
  if(++autosaveT>=600){autosaveT=0;requestSave('auto');}
}
/* ---------------- render ---------------- */
const pvBuf=new Float32Array(16),planesBuf=new Array(6);
const cloudNoise=S.makeNoise(4321);
function render(env,dt){
  const p=player;let eye=eyePos();
  const D=DIMS[world.dim];
  let fogC=env.horizon,fogNear=settings.renderDist*16*(D.sky?0.55:0.25),fogFar=settings.renderDist*16*(D.sky?0.95:0.8);
  if(world.weather.rainLevel>0){fogNear*=1-world.weather.rainLevel*0.4;}
  if(p.headInWater){const dl=Math.max(0.15,env.daylight);fogC=[0.05*dl,0.18*dl,0.42*dl];fogNear=1;fogFar=p.hasEffect('water_breathing')||p.hasEffect('night_vision')?64:26;}
  if(p.headInLava){fogC=[0.8,0.25,0.02];fogNear=0;fogFar=p.fireImmune||p.hasEffect('fire_resistance')?6:2.5;}
  gl.viewport(0,0,W,H);gl.clearColor(fogC[0],fogC[1],fogC[2],1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  let fov=settings.fov*(p.sprinting&&!p.flying?1.1:1)*(p.flying&&p.sprinting?1.15:1);if(p.using==='bow')fov*=1-Math.min(1,p.useT/20)*0.15;
  camFov+=(fov-camFov)*Math.min(1,dt*10);
  const proj=perspective(camFov*Math.PI/180,W/H,0.05,1400);
  let f=forwardVec();
  // third person camera
  if(thirdPerson&&p.alive()){const back=thirdPerson===1?-1:1;const d=[f[0]*back,f[1]*back,f[2]*back];const h=raycastBlocks(eye,d,4,false,true);const dist=h?Math.max(0.3,h.t-0.2):4;
    eye=[eye[0]+d[0]*dist,eye[1]+d[1]*dist,eye[2]+d[2]*dist];if(thirdPerson===2)f=[-f[0],-f[1],-f[2]];}
  let r=[-f[2],0,f[0]];const rl=Math.hypot(r[0],r[2])||1;r=[r[0]/rl,0,r[2]/rl];
  const u=[r[1]*f[2]-r[2]*f[1],r[2]*f[0]-r[0]*f[2],r[0]*f[1]-r[1]*f[0]];
  const moveAmt=Math.min(1,Math.hypot(p.vel[0],p.vel[2])/4.3);
  const bob=settings.bobbing&&p.onGround&&!p.flying&&!thirdPerson?Math.sin(p.walkDist*1.9)*0.045*moveAmt:0;
  const bobX=settings.bobbing&&!thirdPerson?Math.cos(p.walkDist*0.95)*0.03*moveAmt:0;
  const sh=(shake+camShake)*0.3;shake=Math.max(0,shake-dt*1.5);camShake=Math.max(0,camShake-dt*2);
  const hurtRoll=p.hurtTime>0?Math.sin(p.hurtTime/10*Math.PI)*0.12:0;
  const view=new Float32Array([r[0],u[0],-f[0],0, r[1],u[1],-f[1],0, r[2],u[2],-f[2],0, -bobX+(Math.random()-0.5)*sh,-bob+(Math.random()-0.5)*sh,0,1]);
  if(hurtRoll){const c=Math.cos(hurtRoll),s=Math.sin(hurtRoll);for(let i=0;i<4;i++){const a=view[i*4],b=view[i*4+1];view[i*4]=a*c-b*s;view[i*4+1]=a*s+b*c;}}
  const pv=mul4(proj,view,pvBuf);const planes=frustumPlanes(pv,planesBuf);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D_ARRAY,blockTex);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D_ARRAY,itemTex);gl.activeTexture(gl.TEXTURE0);
  // sky dome
  if(!p.headInWater&&!p.headInLava){
    gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.useProgram(skyProg.p);gl.uniformMatrix4fv(skyProg.u.uInvPV,false,invert4(pv));
    gl.uniform3fv(skyProg.u.uTop,env.sky);gl.uniform3fv(skyProg.u.uHorizon,env.horizon);gl.uniform1f(skyProg.u.uStars,env.stars||0);
    const sd=[Math.cos(env.ang||0),Math.sin(env.ang||0),0.25],sl=Math.hypot(...sd);gl.uniform3f(skyProg.u.uSunDir,sd[0]/sl,sd[1]/sl,sd[2]/sl);
    gl.bindVertexArray(skyVAO);gl.drawArrays(gl.TRIANGLES,0,3);gl.enable(gl.DEPTH_TEST);
  }
  gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.depthMask(true);gl.disable(gl.BLEND);
  const bu=boxProg.u;gl.useProgram(boxProg.p);gl.uniformMatrix4fv(bu.uPV,false,pv);gl.uniform1i(bu.uTex,0);gl.uniform1i(bu.uItems,1);
  gl.uniform3fv(bu.uFogColor,fogC);gl.uniform1f(bu.uFogNear,fogNear);gl.uniform1f(bu.uFogFar,fogFar);
  if(D.sky&&!p.headInWater){ // sun & moon
    gl.depthMask(false);gl.uniform1f(bu.uEmissive,1);gl.uniform1f(bu.uFog,0);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    const sd=[Math.cos(env.ang),Math.sin(env.ang),0.25],sl=Math.hypot(...sd),n=[sd[0]/sl,sd[1]/sl,sd[2]/sl],yw=Math.atan2(-n[0],-n[2]),pt=Math.asin(n[1]),vis=1-world.weather.rainLevel;
    addBox(n[0]*600,n[1]*600,n[2]*600,70,70,1,yw,pt,-1,-1,-1,1*vis,0.9*vis,0.55*vis,1);addBox(-n[0]*600,-n[1]*600,-n[2]*600,44,44,1,yw,-pt,-1,-1,-1,0.8*vis,0.84*vis,0.95*vis,1);
    flushBoxes();gl.disable(gl.BLEND);gl.depthMask(true);
  }
  // opaque chunks (frustum culled, front-to-back)
  const cu=chunkProg.u;gl.useProgram(chunkProg.p);
  gl.uniformMatrix4fv(cu.uPV,false,pv);gl.uniform1i(cu.uTex,0);gl.uniform1f(cu.uDaylight,env.daylight);gl.uniform1f(cu.uTime,performance.now()/1000);
  gl.uniform1f(cu.uAmbient,D.ambient||0.0);gl.uniform1f(cu.uNightVision,p.hasEffect('night_vision')?1:0);
  gl.uniform3fv(cu.uFogColor,fogC);gl.uniform1f(cu.uFogNear,fogNear);gl.uniform1f(cu.uFogFar,fogFar);gl.uniform1f(cu.uAlphaTest,0.5);
  const vis=[];
  for(const c of chunks.values()){if(!c.hasMesh||(!c.opq&&!c.trn))continue;const x0=c.cx*16-eye[0],z0=c.cz*16-eye[2];
    if(!boxVisible(planes,x0,c.minY-1-eye[1],z0,x0+16,c.maxY+0.5-eye[1],z0+16))continue;c.vd=(x0+8)*(x0+8)+(z0+8)*(z0+8);vis.push(c);}
  vis.sort((a,b)=>a.vd-b.vd);drawnChunks=vis.length;drawnTris=0;
  for(const c of vis){if(!c.opq||!c.opq.count)continue;gl.uniform3f(cu.uOffset,c.cx*16-eye[0],-eye[1],c.cz*16-eye[2]);gl.uniform1f(cu.uUVScale,c.lod?0.5:1);
    gl.bindVertexArray(c.opq.vao);gl.drawElements(gl.TRIANGLES,c.opq.count,gl.UNSIGNED_INT,0);drawnTris+=c.opq.count/3;}
  // entities + particles
  gl.useProgram(boxProg.p);gl.uniform1f(bu.uEmissive,0);gl.uniform1f(bu.uFog,1);
  gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  renderEntities(eye,entityAlpha,env,planes);
  if(thirdPerson&&p.alive())drawPlayerModel(eye,env);
  for(const q of particles){const c=q.col,t=q.tint;const br=q.glow?2:brightnessAt(q.x,q.y,q.z,env.daylight);
    addBox(q.x-eye[0],q.y-eye[1],q.z-eye[2],q.s,q.s,q.s,0,0,q.layer,q.layer,q.layer,c?c[0]:(t?t[0]:1),c?c[1]:(t?t[1]:1),c?c[2]:(t?t[2]:1),br,q.u||0,q.v||0,q.layer>=0?0.25:1,Math.min(1,q.life*3));}
  drawWeather(eye,env,dt);
  flushBoxes();
  // selection + cracks
  if(target&&!screen&&p.alive()&&!p.spectatorLike()){
    const bs=target.boxes||[[0,0,0,16,16,16]];let x0=16,y0=16,z0=16,x1=0,y1=0,z1=0;for(const b of bs){x0=Math.min(x0,b[0]);y0=Math.min(y0,b[1]);z0=Math.min(z0,b[2]);x1=Math.max(x1,b[3]);y1=Math.max(y1,b[4]);z1=Math.max(z1,b[5]);}
    const ox=target.x+x0/16,oy=target.y+y0/16,oz=target.z+z0/16,sx=(x1-x0)/16,sy=(y1-y0)/16,sz=(z1-z0)/16;
    if(p.breaking&&p.breakProg>0){gl.useProgram(boxProg.p);gl.uniform1f(bu.uEmissive,1);gl.depthFunc(gl.LEQUAL);const st=S.T.destroy_0+Math.min(9,Math.floor(p.breakProg*10));
      addBox(ox+sx/2-eye[0],oy+sy/2-eye[1],oz+sz/2-eye[2],sx+0.004,sy+0.004,sz+0.004,0,0,st,st,st,1,1,1,1);flushBoxes();gl.depthFunc(gl.LESS);gl.uniform1f(bu.uEmissive,0);}
    gl.useProgram(lineProg.p);gl.uniformMatrix4fv(lineProg.u.uPV,false,pv);gl.uniform3f(lineProg.u.uOffset,ox-0.002-eye[0],oy-0.002-eye[1],oz-0.002-eye[2]);
    gl.uniform3f(lineProg.u.uScale,sx+0.004,sy+0.004,sz+0.004);gl.uniform4f(lineProg.u.uColor,0,0,0,0.7);gl.bindVertexArray(lineVAO);gl.drawArrays(gl.LINES,0,24);
  }
  // translucent chunk pass (back to front, both faces)
  gl.useProgram(chunkProg.p);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.uniform1f(cu.uAlphaTest,0.02);
  for(let i=vis.length-1;i>=0;i--){const c=vis[i];if(!c.trn||!c.trn.count)continue;gl.uniform3f(cu.uOffset,c.cx*16-eye[0],-eye[1],c.cz*16-eye[2]);gl.uniform1f(cu.uUVScale,c.lod?0.5:1);
    gl.bindVertexArray(c.trn.vao);gl.drawElements(gl.TRIANGLES,c.trn.count,gl.UNSIGNED_INT,0);drawnTris+=c.trn.count/3;}
  // clouds
  if(D.sky){gl.useProgram(boxProg.p);gl.uniform1f(bu.uFog,1);gl.uniform3fv(bu.uFogColor,fogC);gl.uniform1f(bu.uFogNear,fogFar*0.8);gl.uniform1f(bu.uFogFar,fogFar*2.2);drawClouds(eye,env);flushBoxes();gl.uniform1f(bu.uFogNear,fogNear);gl.uniform1f(bu.uFogFar,fogFar);}
  gl.depthMask(true);gl.enable(gl.CULL_FACE);
  // first-person hand / held item
  if(p.alive()&&!thirdPerson&&!p.spectatorLike()&&!hideHud){gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(boxProg.p);gl.uniform1f(bu.uEmissive,0);gl.uniform1f(bu.uFog,0);drawHand(r,u,f,env);flushBoxes();}
  gl.disable(gl.BLEND);gl.bindVertexArray(null);
}
let camFov=70;
function drawHand(r,u,f,env){
  const p=player,s=p.held();const sw=Math.sin(Math.min(1,Math.max(0,p.swingT)/0.3)*Math.PI);
  const hb=settings.bobbing?Math.sin(p.walkDist*1.9)*0.02:0;
  let off=[0.42,-0.36+hb-sw*0.12,-0.62+sw*0.1];
  if(p.using==='eat'||p.using==='drink')off=[0.15,-0.3+Math.sin(p.useT*0.9)*0.03,-0.5];
  if(p.using==='bow')off=[0.2,-0.25,-0.55];
  const hp=[r[0]*off[0]+u[0]*off[1]-f[0]*off[2],r[1]*off[0]+u[1]*off[1]-f[1]*off[2],r[2]*off[0]+u[2]*off[1]-f[2]*off[2]];
  const e=eyePos();const br=brightnessAt(e[0],e[1],e[2],env.daylight);
  const it=s&&ITEM[s.id];
  if(it){
    if(it.block&&(FLAGS[it.block]&F_CUBE||MODEL[it.block]===4&&![B.TORCH,B.REDSTONE_TORCH,B.LADDER,B.RAIL,B.LEVER].includes(it.block))){const v=it.block;const tn=tintOfVoxel(v,Math.floor(e[0]),Math.floor(e[2]))||[1,1,1];
      addBox(hp[0],hp[1],hp[2],0.3,0.3,0.3,p.yaw+0.75,p.pitch-sw*0.5,TEXV[v*6+3],TEXV[v*6+1],TEXV[v*6+2],tn[0],tn[1],tn[2],br);}
    else if(it.block===B.TORCH||it.block===B.REDSTONE_TORCH)addBox(hp[0],hp[1]+0.04,hp[2],0.06,0.4,0.06,p.yaw+0.3,p.pitch+0.25-sw*0.5,TEXV[it.block*6+3],TEXV[it.block*6+1],TEXV[it.block*6+1],1,1,1,1);
    else{const layer=it.block?TEXV[it.block*6+1]:512+ITEM_TEX[it.tex];const tn=it.block?(tintOfVoxel(it.block,Math.floor(e[0]),Math.floor(e[2]))||[1,1,1]):[1,1,1];
      const tool=it.tool||it.key==='bow';addBox(hp[0],hp[1]+0.05,hp[2],tool?0.42:0.3,tool?0.42:0.3,0.02,p.yaw+(tool?-0.3:0.35),p.pitch-sw*0.6+(tool?0.3:0),layer,layer,layer,tn[0],tn[1],tn[2],br,0,0,1,1);}
  } else addBox(hp[0],hp[1]-0.05,hp[2],0.16,0.16,0.5,p.yaw+0.15,p.pitch+0.3-sw*0.6,-1,-1,-1,0.93,0.72,0.58,br);
}
function drawPlayerModel(eye,env){
  const p=player;const pos=[p.renderPrev[0]+(p.pos[0]-p.renderPrev[0])*renderAlpha,p.renderPrev[1]+(p.pos[1]-p.renderPrev[1])*renderAlpha,p.renderPrev[2]+(p.pos[2]-p.renderPrev[2])*renderAlpha];
  const fake={def:{model:'humanoid',colors:{skin:[0.85,0.65,0.5],shirt:[0.1,0.6,0.7],legs:[0.25,0.25,0.6]}},yaw:p.yaw,prevYaw:p.yaw,walkPhase:p.walkDist*1.9,vel:p.vel,hurtTime:p.hurtTime,armor:p.armor,hand:null,
    lookAt:null,baby:false,dead:false,fuse:0,swing:p.swingT>0?3:0,pos:p.pos,eyeH:()=>1.62};
  drawMob(fake,pos[0]-eye[0],pos[1]-eye[1],pos[2]-eye[2],brightnessAt(pos[0],pos[1]+1,pos[2],env.daylight),1);
}
const rainDrops=[];
function drawWeather(eye,env,dt){
  const lvl=world.weather.rainLevel;if(lvl<=0.01||!DIMS[world.dim].sky)return;
  const want=Math.floor(420*lvl);while(rainDrops.length<want)rainDrops.push({x:0,y:-999,z:0,v:0});rainDrops.length=Math.min(rainDrops.length,want);
  const px=player.pos[0],py=player.pos[1],pz=player.pos[2];
  for(const d of rainDrops){
    if(d.y<d.floor||d.y<py-12){d.x=px+(Math.random()-0.5)*26;d.z=pz+(Math.random()-0.5)*26;d.y=py+8+Math.random()*10;const h=heightAt(Math.floor(d.x),Math.floor(d.z));d.floor=h<0?-999:h+1;
      const bi=BIOMES[biomeAt(Math.floor(d.x),Math.floor(d.z))]||BIOMES[3];d.snow=bi.precip==='snow'||(bi.temp<0.15)||d.y>140;d.none=bi.precip==='none';d.v=d.snow?2+Math.random():14+Math.random()*4;d.p=Math.random()*6.28;}
    d.y-=d.v*dt;if(d.snow){d.x+=Math.sin(d.p+d.y)*dt*0.5;}
    if(d.none||d.y<d.floor)continue;
    if(d.snow)addBox(d.x-eye[0],d.y-eye[1],d.z-eye[2],0.07,0.07,0.07,0,0,-1,-1,-1,1,1,1,Math.max(0.4,env.daylight),0,0,1,0.9);
    else addBox(d.x-eye[0],d.y-eye[1],d.z-eye[2],0.015,0.55,0.015,0,0,-1,-1,-1,0.55,0.65,0.95,Math.max(0.35,env.daylight),0,0,1,0.55);
  }
  if(Math.random()<lvl*dt*30){const x=px+(Math.random()-0.5)*16,z=pz+(Math.random()-0.5)*16,h=heightAt(Math.floor(x),Math.floor(z));
    if(h>0&&BIOMES[biomeAt(Math.floor(x),Math.floor(z))].precip==='rain')pushParticle({x,y:h+1.05,z,vx:0,vy:1,vz:0,life:0.2,layer:-1,s:0.05,col:[0.6,0.7,1],g:10});}
}
function drawClouds(eye,env){
  const CELL=12,Y=192,t=world.gameTime*0.03,R=Math.min(16,settings.renderDist+4);
  const cx=Math.floor((eye[0]+t)/CELL),cz=Math.floor(eye[2]/CELL);const bright=Math.max(0.25,env.daylight)*(1-world.weather.rainLevel*0.4);
  for(let dx=-R;dx<=R;dx++)for(let dz=-R;dz<=R;dz++){const gx=cx+dx,gz=cz+dz;if(cloudNoise.n2(gx*0.23,gz*0.23)+cloudNoise.n2(gx*0.07,gz*0.07)*0.6<0.28-world.weather.rainLevel*0.2)continue;
    addBox(gx*CELL-t+CELL/2-eye[0],Y-eye[1],gz*CELL+CELL/2-eye[2],CELL,4,CELL,0,0,-1,-1,-1,1,1,1,bright*1.3,0,0,1,0.78);}
}
function fxOverlay(){
  const p=player,fx=$('fx');let bg='';
  if(p.headInWater)bg='rgba(20,60,160,0.25)';if(p.headInLava)bg='rgba(255,90,0,0.55)';
  if(p.fireTicks>0&&!p.fireImmune&&!thirdPerson)bg='linear-gradient(to top,rgba(255,120,0,.45),transparent 45%)';
  if(p.inPortal==='nether'&&p.portalTicks>0)bg='rgba(140,40,220,'+Math.min(0.7,p.portalTicks/80*0.7)+')';
  if(p.sleeping>0)bg='rgba(0,0,0,'+Math.min(0.95,p.sleeping/60)+')';
  if(p.hurtTime>6)bg='radial-gradient(circle,transparent 55%,rgba(200,0,0,.35))';
  if(p.health<=4&&!p.creativeLike()&&p.alive()&&!bg)bg='radial-gradient(circle,transparent 60%,rgba(120,0,0,'+(0.2+0.1*Math.sin(performance.now()/250))+'))';
  if(fx._bg!==bg){fx.style.background=bg;fx._bg=bg;}
  $('atk').style.display=attackStrength()<1&&!p.creativeLike()&&p.alive()?'block':'none';$('atk').firstChild.style.width=(attackStrength()*100)+'%';
}
function debugText(){
  const p=player,x=Math.floor(p.pos[0]),y=Math.floor(p.pos[1]),z=Math.floor(p.pos[2]);let meshed=0,loaded=0;for(const c of chunks.values()){if(c.data)loaded++;if(c.hasMesh)meshed++;}
  const l=getLight(x,y,z);const t=world.dayTime%24000,hh=Math.floor(((t/1000)+6)%24),mm=Math.floor((t%1000)*0.06);
  const qn=loadQueue.length+hiQueue.length;let wq=0;for(const w of workers)wq+=w.inflight;
  const bi=BIOMES[biomeAt(x,z)];const facing=['north','west','south','east'][((Math.round(p.yaw/(Math.PI/2))%4)+4)%4];
  let tt='';if(target){const d=DEF[target.v&255];tt=`\nTarget: ${d.key} state ${target.v>>8} @ ${target.x},${target.y},${target.z}`;}else if(targetEntity)tt='\nTarget: '+targetEntity.type;
  return `VoxelCraft  ${stats.fps} FPS  (${stats.frameMs.toFixed(1)} ms)\nXYZ ${p.pos[0].toFixed(2)} / ${p.pos[1].toFixed(2)} / ${p.pos[2].toFixed(2)}\nBlock ${x} ${y} ${z}  Chunk ${Math.floor(x/16)} ${Math.floor(z/16)}  Facing ${facing}\n`+
    `Dimension ${DIMS[world.dim].name}  Biome ${bi?bi.name:'?'}\nLight sky ${l<0?'?':l>>4} block ${l<0?'?':l&15}  Day ${Math.floor(world.dayTime/24000)+1} ${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}  ${world.weather.thunder&&world.weather.rain?'thunder':(world.weather.rain?'rain':'clear')}\n`+
    `Chunks ${meshed}/${chunks.size} meshed (${loaded} data), ${drawnChunks} drawn, ${(drawnTris/1000).toFixed(0)}k tris\nWorkers ${NW}  queued ${qn}  in-flight ${wq}  GPU ${(gpuBytes/1048576).toFixed(1)} MB\n`+
    `Entities ${world.entities.length}  Particles ${particles.length}  Ticks ${tickHeap.length}  Mode ${p.mode}${p.flying?' (flying)':''}\nSeed ${world.seed}${tt}`;
}
/* ---------------- loop ---------------- */
let physAcc=0,tickAcc=0;
function simActive(){return gameRunning&&!dimSwitching&&!$('pause').classList.contains('show')&&!$('settings').classList.contains('show');}
function frame(now){
  requestAnimationFrame(frame);
  const t0=performance.now();
  const dt=Math.min(0.1,(now-lastT)/1000);lastT=now;
  frames++;fpsT+=dt;if(fpsT>=0.5){stats.fps=Math.round(frames/fpsT);frames=0;fpsT=0;}
  if(!gameRunning||glLost){gl.clearColor(0.08,0.07,0.06,1);gl.clear(gl.COLOR_BUFFER_BIT);$('hud').style.display='none';return;}
  try{
    const pcx=Math.floor(player.pos[0]/16),pcz=Math.floor(player.pos[2]/16);
    updateChunks(dt,false,pcx,pcz);
    checkAwaitSpawn();
    if(simActive()){
      refreshMoveInput();
      physAcc+=dt;let n=0;while(physAcc>=PHYS_DT&&n<8){playerPhysics(PHYS_DT);physAcc-=PHYS_DT;n++;}if(n>=8)physAcc=0;
      renderAlpha=physAcc/PHYS_DT;
      tickAcc+=dt;let k=0;while(tickAcc>=TICK&&k<4){const ts=performance.now();gameTick();stats.tickMs=performance.now()-ts;tickAcc-=TICK;k++;}if(k>=4)tickAcc=0;
      entityAlpha=tickAcc/TICK;
      if(!screen&&!chatOpen){updateTarget();updateMining(dt);
        player.placeCool-=dt;if(input.use&&player.placeCool<=0&&!player.using&&player.alive()&&(target||targetEntity)){useItem();}}
      player.swingT=Math.max(0,player.swingT-dt);
      updateParticles(dt);
      if(screen&&screen.tick)screen.tick();if(screenDirty)renderScreen();
    }
    const env=computeEnv();
    render(env,dt);
    sfx.ambient(world.weather.rainLevel*(DIMS[world.dim].sky&&!skyVisible(Math.floor(player.pos[0]),Math.floor(player.pos[1]+2),Math.floor(player.pos[2]))?0.35:1),player.headInWater,dt);
    fxOverlay();
    if(nameTimer>0){nameTimer-=dt;if(nameTimer<=0)$('itemName').style.opacity=0;}
    debugT-=dt;if(debugT<=0){debugT=0.25;hudDirty=true;const d=$('debug');d.style.display=showDebug?'':'none';if(showDebug)d.textContent=debugText();}
    if(hudDirty)renderHud();
    $('hud').classList.toggle('hidden',hideHud);$('hud').style.display='';
  }catch(err){reportError('frame',err);}
  stats.frameMs=stats.frameMs*0.9+(performance.now()-t0)*0.1;
}
/* ---------------- world lifecycle ---------------- */
function onSpawnFound(x,z){
  if(!world.needsSpawn)return;
  player.setPos(x+0.5,100,z+0.5);player.renderPrev=player.pos.slice();awaitSpawn={x:x+0.5,z:z+0.5,y:100,surface:true};lastCenter='';
}
async function startGame(id){
  showLoading('Loading world…');$('title').classList.remove('show');
  try{
    const raw=await loadMeta(id);world.needsSpawn=!!raw&&!raw.spawn;
    if(!(await openWorld(id))){hideLoading();$('title').classList.add('show');return;}
    gameRunning=true;paused=false;
    if(world.needsSpawn){workers[0].w.postMessage({t:'spawn'});awaitSpawn.surface=true;}
    if(player.dead)setTimeout(()=>showDeath(player.deathMsg||'You died'),300);
    updateHud();onInventoryChanged();
    if(!IS_TOUCH)lockPointer();
  }catch(err){reportError('open world',err);hideLoading();$('title').classList.add('show');alert('Could not open the world: '+err.message);}
}
const _checkAwait=checkAwaitSpawn;
checkAwaitSpawn=function(){const had=!!awaitSpawn;_checkAwait();if(had&&!awaitSpawn&&world.needsSpawn){world.spawn=player.pos.slice();world.needsSpawn=false;world.metaDirty=true;requestSave('spawn');}};
async function quitToTitle(){
  if(!gameRunning)return;
  showLoading('Saving…');closeScreen(true);
  for(const c of [...chunks.values()])stashChunkEntities(c);
  await doSave('quit');for(let i=0;i<100&&(saving||saveQueued);i++)await new Promise(r=>setTimeout(r,50));
  gameRunning=false;worldReady=false;resetWorldState();for(const w of workers)w.w.terminate();workers.length=0;releaseLock();world.id=null;
  $('pause').classList.remove('show');hideDeath();hideLoading();document.exitPointerLock&&document.exitPointerLock();
  await refreshWorldList();$('title').classList.add('show');
}
let selWorld=null,worldList=[];
async function refreshWorldList(){
  try{worldList=await listWorlds();}catch(e){worldList=[];$('worlds').innerHTML='<div class="world">Storage unavailable: '+escapeHtml(e.message)+'</div>';return;}
  const L=$('worlds');L.innerHTML='';
  if(!worldList.length)L.innerHTML='<div class="world small">No worlds yet — create one.</div>';
  for(const w of worldList){const d=document.createElement('div');d.className='world'+(w.id===selWorld?' sel':'');
    d.innerHTML=`<b>${escapeHtml(w.name)}</b><br><small>${new Date(w.lastPlayed).toLocaleString()} · ${w.mode} · seed ${w.seed} · ${DIMS[w.dim].name}</small>`;
    d.onclick=()=>{selWorld=w.id;refreshWorldList();};d.ondblclick=()=>startGame(w.id);L.appendChild(d);}
  const has=!!worldList.find(w=>w.id===selWorld);$('bPlay').disabled=!has;$('bDelete').disabled=!has;$('bExport').disabled=!has;
  try{if(navigator.storage&&navigator.storage.estimate){const e=await navigator.storage.estimate();$('storageInfo').textContent=`storage ${(e.usage/1048576).toFixed(1)} MB used`;}}catch(e){}
}
$('bPlay').onclick=()=>{sfx.init();if(selWorld)startGame(selWorld);};
$('bNew').onclick=()=>{$('newWorld').style.display='block';};
$('bCancelNew').onclick=()=>{$('newWorld').style.display='none';};
$('bCreate').onclick=async()=>{sfx.init();const id=await createWorld($('nwName').value.trim()||'New World',$('nwSeed').value.trim(),$('nwMode').value,+$('nwDiff').value);selWorld=id;$('newWorld').style.display='none';startGame(id);};
$('bDelete').onclick=async()=>{const w=worldList.find(x=>x.id===selWorld);if(!w)return;if(!confirm('Delete "'+w.name+'" permanently? This cannot be undone.'))return;await deleteWorld(w.id);selWorld=null;refreshWorldList();};
$('bExport').onclick=()=>{if(selWorld)exportWorld(selWorld).catch(e=>alert('Export failed: '+e.message));};
$('bImport').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{selWorld=await importWorld(f);await refreshWorldList();}catch(err){alert('Import failed: '+err.message);}e.target.value='';};
$('bSettings').onclick=()=>{$('title').classList.remove('show');openSettings(()=>$('title').classList.add('show'));};
$('bHelp').onclick=()=>{const h=$('helpBox');h.style.display=h.style.display==='none'?'block':'none';h.innerHTML=helpHTML();};
canvas.addEventListener('click',()=>{if(gameRunning&&!screen&&!chatOpen&&!locked()&&!$('pause').classList.contains('show')&&!player.dead)lockPointer();});
(async function boot(){
  setupTouch();
  try{const mig=await migrateV1();if(mig){selWorld=mig;toast('Your previous VoxelCraft world was imported');}}catch(e){reportError('v1 migration',e);}
  await refreshWorldList();if(!selWorld&&worldList.length){selWorld=worldList[0].id;refreshWorldList();}
})();
requestAnimationFrame(frame);
window.__game={player,world,chunks,getV,setV,S,runCommand,input,get target(){return target;},get targetEntity(){return targetEntity;},useItem,attackEntity,openInventory,
  startGame,createWorld,quitToTitle,doSave,listWorlds,deleteWorld,setGamemode,explode,spawnMob,dropItemAt,screen:()=>screen,clickSlot,getSlot,closeScreen,
  setPaused(v){if(!v){$('pause').classList.remove('show');paused=false;}},get chunkStats(){let m=0;for(const c of chunks.values())if(c.hasMesh)m++;return {n:chunks.size,meshed:m,queued:loadQueue.length+hiQueue.length};}};
