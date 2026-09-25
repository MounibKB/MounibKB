/* =====================================================================
   INPUT: rebindable keyboard, mouse (pointer lock), wheel, touch
   ===================================================================== */
const input={forward:false,back:false,left:false,right:false,jump:false,sneak:false,sprint:false,attack:false,use:false};
const heldKeys=new Set();
const IS_TOUCH=('ontouchstart' in window)&&window.matchMedia&&matchMedia('(pointer: coarse)').matches;
const touchMove={x:0,y:0,active:false};
let paused=true,rebinding=null,lastSpaceT=0,lastWT=0,sprintLatch=false,sneakLatch=false;
function actionForCode(code){for(const k in settings.keys)if(settings.keys[k]===code)return k;
  if(code==='ShiftRight'&&settings.keys.sneak==='ShiftLeft')return 'sneak';if(code==='ControlRight'&&settings.keys.sprint==='ControlLeft')return 'sprint';return null;}
function clearInput(){for(const k in input)input[k]=false;heldKeys.clear();sprintLatch=false;}
function refreshMoveInput(){
  const K=settings.keys,h=c=>heldKeys.has(c);
  input.forward=h(K.forward);input.back=h(K.back);input.left=h(K.left);input.right=h(K.right);input.jump=h(K.jump)||touchBtn.jump;
  input.sneak=(settings.crouchToggle?sneakLatch:(h(K.sneak)||h('ShiftRight')))||touchBtn.sneak;
  input.sprint=(settings.sprintToggle?sprintLatch:(h(K.sprint)||h('ControlRight')))||sprintLatch;
}
function lockPointer(){if(IS_TOUCH){paused=false;hidePanels();return;}try{const r=canvas.requestPointerLock&&canvas.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}}
const locked=()=>document.pointerLockElement===canvas;
document.addEventListener('pointerlockchange',()=>{
  if(locked()){paused=false;hidePanels();}
  else{clearInput();if(!screen&&!chatOpen&&player.alive()&&gameRunning)showPause();}
});
document.addEventListener('pointerlockerror',()=>{if(!gameRunning||IS_TOUCH)return;toast('Click the game to capture the mouse');
  // a refused lock after "Back to game" would otherwise leave the game paused with no visible menu
  if(paused&&!screen&&!chatOpen&&player.alive())showPause();});
document.addEventListener('mousemove',e=>{
  if(!locked()||!player.alive()||player.sleeping)return;
  const s=settings.sens*0.000275;player.yaw-=e.movementX*s;player.pitch-=e.movementY*s*(settings.invertY?-1:1);
  player.pitch=clamp(player.pitch,-1.5705,1.5705);
});
canvas.addEventListener('mousedown',e=>{
  sfx.init();
  if(!gameRunning)return;
  if(!locked()&&!IS_TOUCH){if(!screen&&!chatOpen)lockPointer();return;}
  if(e.button===0){input.attack=true;if(targetEntity)attackEntity(targetEntity);else if(!target)player.swingT=0.3;}
  else if(e.button===2){input.use=true;useItem();}
  else if(e.button===1){pickBlock();e.preventDefault();}
});
document.addEventListener('mouseup',e=>{if(e.button===0){input.attack=false;player.breaking=null;player.breakProg=0;}if(e.button===2)input.use=false;});
document.addEventListener('contextmenu',e=>{if(e.target===canvas||locked()||screen)e.preventDefault();});
document.addEventListener('wheel',e=>{if(!gameRunning||paused||screen||chatOpen||!player.alive())return;player.inv.sel=(player.inv.sel+(e.deltaY>0?1:8))%9;player.using=null;onInventoryChanged(true);},{passive:true});
window.addEventListener('blur',()=>{clearInput();input.attack=input.use=false;});
document.addEventListener('keydown',e=>{
  if(rebinding){e.preventDefault();if(e.code!=='Escape')settings.keys[rebinding]=e.code;rebinding=null;saveSettings();renderSettings();return;}
  if(e.target&&(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')){if(e.code==='Escape'&&chatOpen)closeChat();return;}
  const act=actionForCode(e.code);
  if(e.code==='F3'||e.code==='F1'||e.code==='F5'||e.code==='Tab'||(e.code==='Space'&&gameRunning))e.preventDefault();
  if(!gameRunning)return;
  if(screen){
    if(e.code==='Escape'||act==='inventory'){e.preventDefault();closeScreen();return;}
    if(act==='drop'&&hoverSlot){dropFromSlot(hoverSlot,e.ctrlKey);return;}
    if(/^Digit[1-9]$/.test(e.code)&&hoverSlot){swapWithHotbar(hoverSlot,+e.code.slice(5)-1);return;}
    return;
  }
  if(chatOpen)return;
  if(e.code==='Escape'){if(!locked())showPause();return;}
  if(paused&&!IS_TOUCH)return;
  if(!heldKeys.has(e.code)){
    const now=performance.now();
    if(act==='jump'){if(now-lastSpaceT<280&&player.creativeLike()&&!player.spectatorLike()){player.flying=!player.flying;player.vel[1]=0;}lastSpaceT=now;}
    if(act==='forward'){if(now-lastWT<280)sprintLatch=true;lastWT=now;}
    if(act==='sprint'&&settings.sprintToggle)sprintLatch=!sprintLatch;
    if(act==='sneak'&&settings.crouchToggle)sneakLatch=!sneakLatch;
    if(act==='inventory'&&player.alive()){openInventory();return;}
    if(act==='drop'&&player.alive())dropHeld(e.ctrlKey);
    if(act==='swap'&&player.alive()){const a=player.inv.main[player.inv.sel];player.inv.main[player.inv.sel]=player.inv.offhand[0];player.inv.offhand[0]=a;onInventoryChanged();}
    if(act==='chat'||act==='command'){e.preventDefault();openChat(act==='command'?'/':'');return;}
    if(act==='debug')showDebug=!showDebug;
    if(act==='hud')hideHud=!hideHud;
    if(act==='perspective')thirdPerson=(thirdPerson+1)%3;
    if(e.code==='F4'){cycleGamemode();}
    const dm=/^Digit([1-9])$/.exec(e.code);if(dm){player.inv.sel=+dm[1]-1;player.using=null;onInventoryChanged(true);}
  }
  heldKeys.add(e.code);refreshMoveInput();
});
document.addEventListener('keyup',e=>{heldKeys.delete(e.code);if(actionForCode(e.code)==='forward')sprintLatch=settings.sprintToggle?sprintLatch:false;refreshMoveInput();});
function pickBlock(){
  if(!target)return;const v=target.v,id=v&255;let item=ITEM[id]?id:null;
  if(id===B.OAK_DOOR)item=I.OAK_DOOR_ITEM;if(id===B.IRON_DOOR)item=I.IRON_DOOR_ITEM;if(id===B.BED)item=I.BED_ITEM;if(id===B.REDSTONE_WIRE)item=I.REDSTONE;
  if(id===B.WHEAT)item=I.WHEAT_SEEDS;if(id===B.CARROTS)item=I.CARROT;if(id===B.POTATOES)item=I.POTATO;if(!item)return;
  const inv=player.inv;const i=inv.main.findIndex((s,i)=>i<9&&s&&s.id===item);
  if(i>=0){inv.sel=i;}
  else if(player.mode==='creative'){const e=inv.main.findIndex((s,i)=>i<9&&!s);if(e>=0)inv.sel=e;const old=inv.main[inv.sel];inv.main[inv.sel]=mkStack(item,maxStack(item));if(old){const l=inv.insert(old);if(l)player.give(l);}}
  else{const j=inv.main.findIndex((s,i)=>i>=9&&s&&s.id===item);if(j>=0){const t=inv.main[inv.sel];inv.main[inv.sel]=inv.main[j];inv.main[j]=t;}}
  onInventoryChanged(true);
}
function dropHeld(all){const p=player,s=p.held();if(!s)return;const n=all?s.count:1;const d=forwardVec(),o=eyePos();
  const st=cloneStack(s);st.count=n;s.count-=n;if(s.count<=0)p.inv.main[p.inv.sel]=null;
  const e=dropItemAt(o[0],o[1]-0.3,o[2],st,false);if(e){e.vel=[d[0]*6+p.vel[0],d[1]*6+2,d[2]*6+p.vel[2]];e.pickupDelay=40;}onInventoryChanged();sfx.play('throw');}
function cycleGamemode(){const i=(GAMEMODES.indexOf(player.mode)+1)%2;setGamemode(GAMEMODES[i]);}
function setGamemode(m){player.mode=m;if(m==='survival'||m==='adventure')player.flying=false;if(m==='spectator')player.flying=true;toast('Game mode: '+m[0].toUpperCase()+m.slice(1));updateHud();world.metaDirty=true;}
/* ---------------- touch controls ---------------- */
const touchBtn={jump:false,sneak:false};
function setupTouch(){
  if(!IS_TOUCH)return;$('touch').style.display='block';
  let stickId=null,lookId=null,lx=0,ly=0,sx0=0,sy0=0,lookMoved=0,lookStart=0;
  const stick=$('stick'),knob=$('knob');
  stick.addEventListener('touchstart',e=>{const t=e.changedTouches[0];stickId=t.identifier;const r=stick.getBoundingClientRect();sx0=r.left+r.width/2;sy0=r.top+r.height/2;touchMove.active=true;e.preventDefault();},{passive:false});
  canvas.addEventListener('touchstart',e=>{sfx.init();for(const t of e.changedTouches)if(lookId===null){lookId=t.identifier;lx=t.clientX;ly=t.clientY;lookMoved=0;lookStart=performance.now();}e.preventDefault();},{passive:false});
  document.addEventListener('touchmove',e=>{for(const t of e.changedTouches){
    if(t.identifier===stickId){let dx=(t.clientX-sx0)/55,dy=(t.clientY-sy0)/55;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l;}touchMove.x=dx;touchMove.y=dy;knob.style.left=(40+dx*40)+'px';knob.style.top=(40+dy*40)+'px';}
    else if(t.identifier===lookId){const mx=t.clientX-lx,my=t.clientY-ly;lookMoved+=Math.abs(mx)+Math.abs(my);player.yaw-=mx*0.006;player.pitch=clamp(player.pitch-my*0.006*(settings.invertY?-1:1),-1.57,1.57);lx=t.clientX;ly=t.clientY;}
  }if(stickId!==null||lookId!==null)e.preventDefault();},{passive:false});
  const end=e=>{for(const t of e.changedTouches){if(t.identifier===stickId){stickId=null;touchMove.x=touchMove.y=0;touchMove.active=false;knob.style.left=knob.style.top='40px';}
    if(t.identifier===lookId){if(lookMoved<10&&performance.now()-lookStart<250&&gameRunning&&!screen){updateTarget();input.use=true;useItem();input.use=false;}lookId=null;}}};
  document.addEventListener('touchend',end);document.addEventListener('touchcancel',end);
  const btn=(id,down,up)=>{const el=$(id);el.addEventListener('touchstart',e=>{down();e.preventDefault();e.stopPropagation();},{passive:false});
    el.addEventListener('touchend',e=>{up&&up();e.preventDefault();},{passive:false});el.addEventListener('touchcancel',()=>{up&&up();});};
  btn('tJump',()=>{touchBtn.jump=true;refreshMoveInput();const now=performance.now();if(now-lastSpaceT<300&&player.creativeLike())player.flying=!player.flying;lastSpaceT=now;},()=>{touchBtn.jump=false;refreshMoveInput();});
  btn('tDown',()=>{touchBtn.sneak=true;refreshMoveInput();},()=>{touchBtn.sneak=false;refreshMoveInput();});
  btn('tBreak',()=>{input.attack=true;updateTarget();if(targetEntity)attackEntity(targetEntity);},()=>{input.attack=false;player.breaking=null;player.breakProg=0;});
  btn('tPlace',()=>{input.use=true;updateTarget();useItem();},()=>{input.use=false;});
  btn('tInv',()=>{if(screen)closeScreen();else openInventory();});
  btn('tPause',()=>showPause());
  btn('tDrop',()=>dropHeld(false));
}
