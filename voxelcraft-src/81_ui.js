/* =====================================================================
   UI: HUD, container screens, creative palette, recipe book, menus,
   settings & key bindings, chat/commands, advancements
   ===================================================================== */
let gameRunning=false,showDebug=false,hideHud=false,thirdPerson=0,hudDirty=true;
function applyGuiScale(){document.documentElement.style.setProperty('--ui',settings.guiScale);}
applyGuiScale();
/* ---------------- pixel icons ---------------- */
const HUDI=(()=>{const mk=(rows,pal)=>{const c=document.createElement('canvas');c.width=c.height=9;const x=c.getContext('2d');
  rows.forEach((r,y)=>[...r].forEach((ch,i)=>{if(pal[ch]){x.fillStyle=pal[ch];x.fillRect(i,y,1,1);}}));return c.toDataURL();};
  const heart=['.##...##.','#oo#.#oo#','#ooo#ooo#','#ooooooo#','.#ooooo#.','..#ooo#..','...#o#...','....#....'];
  const half=['.##...##.','#oo#.#..#','#ooo#...#','#oooo...#','.#ooo..#.','..#oo.#..','...#o#...','....#....'];
  const food=['.....###.','....#ooo#','...#oooo#','..#ooooo#','.#ooooo#.','#ooo##...','#oo#.....','.##......'];
  const foodh=['.....###.','....#...#','...#....#','..#.....#','.#ooo..#.','#ooo##...','#oo#.....','.##......'];
  const arm=['.##...##.','#oo###oo#','#ooooooo#','#ooooooo#','.#ooooo#.','.#ooooo#.','.#ooooo#.','..#####..'];
  const armh=['.##...##.','#oo###..#','#oooo...#','#oooo...#','.#ooo..#.','.#ooo..#.','.#ooo..#.','..#####..'];
  const bub=['..###....','.#o..#...','#o....#..','#.....#..','#.....#..','.#...#...','..###....','.........'];
  return {heart:mk(heart,{'#':'#200','o':'#e22'}),half:mk(half,{'#':'#200','o':'#e22','.':null}),empty:mk(heart,{'#':'#200','o':'#333'}),
    gold:mk(heart,{'#':'#420','o':'#fc3'}),poison:mk(heart,{'#':'#120','o':'#8a3'}),wither:mk(heart,{'#':'#000','o':'#333'}),
    food:mk(food,{'#':'#321','o':'#c83'}),foodh:mk(foodh,{'#':'#321','o':'#c83'}),foode:mk(food,{'#':'#321','o':'#333'}),foodg:mk(food,{'#':'#130','o':'#8a4'}),
    armor:mk(arm,{'#':'#222','o':'#ccc'}),armorh:mk(armh,{'#':'#222','o':'#ccc'}),armore:mk(arm,{'#':'#222','o':'#333'}),bubble:mk(bub,{'#':'#8cf','o':'#fff'})};})();
function updateHud(){hudDirty=true;}
function onInventoryChanged(showName){hudDirty=true;if(screen)screenDirty=true;if(showName){const s=player.held();const n=$('itemName');n.textContent=s?itemName(s):'';n.style.opacity=1;nameTimer=1.6;}}
let nameTimer=0,toastT=null;
function toast(msg){const t=$('toast');if(!t)return;t.textContent=msg;t.style.opacity=1;clearTimeout(toastT);toastT=setTimeout(()=>t.style.opacity=0,2200);}
function chatMsg(msg,col){const L=$('chatlog');const d=document.createElement('div');d.textContent=msg;if(col)d.style.color=col;L.appendChild(d);
  while(L.children.length>10)L.removeChild(L.firstChild);setTimeout(()=>{d.style.opacity=0;setTimeout(()=>d.remove(),1000);},10000);}
function slotHTML(s,cls){if(!s)return '';const it=ITEM[s.id];let h=`<img src="${iconFor(s.id)}" alt="">`;
  if(s.count>1)h+=`<span class="cnt">${s.count}</span>`;
  const md=maxDamage(s.id);if(md&&s.dmg){const f=1-s.dmg/md;h+=`<span class="dur"><i style="width:${f*100}%;background:hsl(${f*120},90%,45%)"></i></span>`;}
  void it;void cls;return h;}
function renderHud(){
  hudDirty=false;const p=player;
  const hb=$('hotbar');if(!hb.children.length)for(let i=0;i<9;i++){const d=document.createElement('div');d.className='slot';hb.appendChild(d);}
  for(let i=0;i<9;i++){const el=hb.children[i],s=p.inv.main[i];el.className='slot'+(i===p.inv.sel?' sel':'')+(s&&s.ench?' ench':'');el.innerHTML=slotHTML(s);}
  const oh=$('offhand');oh.style.display=p.inv.offhand[0]?'flex':'none';oh.innerHTML='<div class="slot">'+slotHTML(p.inv.offhand[0])+'</div>';
  const surv=!p.creativeLike();
  for(const id of ['hearts','food','armorbar','xp','air'])$(id).style.visibility=surv?'visible':'hidden';
  if(surv){
    let h='';const hp=Math.ceil(p.health),pois=p.hasEffect('poison'),wit=p.hasEffect('wither');
    const full=pois?HUDI.poison:(wit?HUDI.wither:HUDI.heart);
    for(let i=0;i<10;i++){const v=hp-i*2;h+=`<img class="ic" src="${v>=2?full:(v===1?HUDI.half:HUDI.empty)}">`;}
    for(let i=0;i<Math.ceil(p.absorption/2);i++)h+=`<img class="ic" src="${HUDI.gold}">`;$('hearts').innerHTML=h;
    let f='';const hung=p.hasEffect('hunger');for(let i=0;i<10;i++){const v=p.food-i*2;f+=`<img class="ic" src="${v>=2?(hung?HUDI.foodg:HUDI.food):(v===1?HUDI.foodh:HUDI.foode)}">`;}$('food').innerHTML=f;
    const [def]=p.armorValue();let a='';if(def>0)for(let i=0;i<10;i++){const v=def-i*2;a+=`<img class="ic" src="${v>=2?HUDI.armor:(v===1?HUDI.armorh:HUDI.armore)}">`;}$('armorbar').innerHTML=a;
    let b='';if(p.air<300&&(p.headInWater||p.air<300)){const n=Math.ceil(Math.max(0,p.air)/30);for(let i=0;i<n;i++)b+=`<img class="ic" src="${HUDI.bubble}">`;}$('air').innerHTML=b;
    $('xp').firstChild.style.width=(p.xpProgress*100)+'%';$('xplvl').textContent=p.xpLevel>0?p.xpLevel:'';
  }
  $('mode').textContent=p.mode==='survival'?'':p.mode.toUpperCase();
  let e='';for(const [k,v] of p.effects){const E=EFFECTS[k];const s=Math.ceil(v.dur/20);e+=`<div class="eff" style="border-color:${E.color}">${E.name}${v.amp?' '+ROMAN[v.amp+1]:''} ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}</div>`;}
  $('effects').innerHTML=e;
  const boss=$('boss');const showBoss=world.dim===2&&!world.dragon.killed&&world.entities.some(x=>x.type==='ender_dragon'&&!x.dead);
  boss.style.display=showBoss?'block':'none';if(showBoss){$('bossName').textContent='Ender Dragon';const d=world.entities.find(x=>x.type==='ender_dragon');$('bossHp').style.width=(d?d.health/d.maxHealth*100:0)+'%';}
}
/* ---------------- container screens ---------------- */
let screen=null,screenDirty=false,cursorStack=null,hoverSlot=null,drag=null,lastClick={t:0,g:null,i:-1};
const screenOpen=()=>!!screen;
// group: {arr, from, n, cols, kind, filter(stack)->bool, output:bool, take(button,shift)}
function slotRef(g,i){return {g,i};}
function getSlot(r){return r.g.arr[r.g.from+r.i];}
function setSlot(r,s){r.g.arr[r.g.from+r.i]=s&&s.count>0?s:null;}
function accepts(r,s){return !r.g.output&&(!r.g.filter||!s||r.g.filter(s,r.i));}
function slotMax(r,s){return Math.min(maxStack(s.id),r.g.max||64);}
function openScreen(def){
  if(screen)closeScreen(true);
  screen=def;$('scr').classList.add('show');document.exitPointerLock&&document.exitPointerLock();paused=true;clearInput();input.attack=input.use=false;
  renderScreen();
}
function closeScreen(silent){
  if(!screen)return;const sc=screen;screen=null;
  if(sc.onClose)try{sc.onClose();}catch(e){reportError('screen close',e);}
  if(cursorStack){player.give(cursorStack);cursorStack=null;}
  $('scr').classList.remove('show');$('cursor').style.display='none';$('tip').style.display='none';hoverSlot=null;drag=null;
  onInventoryChanged();if(!silent&&player.alive())lockPointer();
}
function closeScreenFor(be){if(screen&&screen.be===be)closeScreen(true);}
function playerGroups(){const inv=player.inv;return [{id:'main',arr:inv.main,from:9,n:27,cols:9,kind:'main'},{id:'hot',arr:inv.main,from:0,n:9,cols:9,kind:'hotbar'}];}
function armorGroup(){return {id:'armor',arr:player.inv.armor,from:0,n:4,cols:1,kind:'armor',max:1,filter:(s,i)=>{const it=ITEM[s.id];return (it.armor&&it.armor.slot===i)||(i===0&&s.id===B.PUMPKIN);}};}
function renderScreen(){
  if(!screen)return;screenDirty=false;const box=$('scrBox');box.innerHTML='';
  const sc=screen;
  const title=document.createElement('h2');title.textContent=sc.title;box.appendChild(title);
  const top=document.createElement('div');top.className='sect';box.appendChild(top);
  if(sc.renderTop)sc.renderTop(top);
  const bottom=document.createElement('div');box.appendChild(bottom);
  if(sc.creativePalette)renderPalette(box,top);
  const h=document.createElement('h2');h.textContent='Inventory';bottom.appendChild(h);
  for(const g of sc.playerGroups){bottom.appendChild(makeGrid(g));if(g.kind==='main'){const sp=document.createElement('div');sp.style.height='6px';bottom.appendChild(sp);}}
  if(sc.recipeBook)renderRecipeBook(box,top);
  const note=document.createElement('div');note.className='small';note.textContent='Click: take/place · Right-click: split/place one · Shift-click: quick move · Drag: spread · Double-click: collect · Q: drop · 1-9: swap with hotbar';
  box.appendChild(note);
  drawCursor();
}
function makeGrid(g){
  const el=document.createElement('div');el.className='grid';el.style.gridTemplateColumns=`repeat(${g.cols},var(--slot))`;
  for(let i=0;i<g.n;i++){const d=document.createElement('div');d.className='slot';const s=g.arr[g.from+i];d.innerHTML=slotHTML(s);if(s&&s.ench)d.classList.add('ench');
    if(g.bg&&!s)d.style.opacity=0.75;
    const r=slotRef(g,i);
    d.onmousedown=e=>{e.preventDefault();slotMouseDown(r,e,d);};
    d.onmouseenter=()=>{hoverSlot=r;d.classList.add('hover');if(drag&&drag.btn>=0&&cursorStack&&accepts(r,cursorStack)&&!drag.set.some(x=>x.g===r.g&&x.i===r.i)){drag.set.push(r);d.classList.add('hover');}showTip(getSlot(r));};
    d.onmouseleave=()=>{if(hoverSlot&&hoverSlot.g===r.g&&hoverSlot.i===r.i)hoverSlot=null;if(!drag)d.classList.remove('hover');$('tip').style.display='none';};
    d.oncontextmenu=e=>e.preventDefault();
    el.appendChild(d);}
  return el;
}
function slotMouseDown(r,e,el){
  const btn=e.button,shift=e.shiftKey;
  if(r.g.output){takeOutput(r,btn,shift);return;}
  const now=performance.now();
  if(btn===0&&!shift&&cursorStack&&lastClick.g===r.g&&lastClick.i===r.i&&now-lastClick.t<300){collectAll(cursorStack);lastClick.t=0;renderScreen();return;}
  lastClick={t:now,g:r.g,i:r.i};
  if(shift&&btn===0){quickMove(r);screenChanged(r);return;}
  if(cursorStack&&(btn===0||btn===2)){drag={btn,set:[r],start:r};return;} // resolved on mouseup (click or spread)
  clickSlot(r,btn);screenChanged(r);
}
document.addEventListener('mouseup',e=>{
  if(!drag||!screen)return;const d=drag;drag=null;
  if(d.set.length<=1){clickSlot(d.start,d.btn);screenChanged(d.start);return;}
  // spread: left = evenly, right = one each
  const st=cursorStack;if(!st)return;const targets=d.set.filter(r=>{const s=getSlot(r);return accepts(r,st)&&(!s||canStack(s,st));});
  if(!targets.length){renderScreen();return;}
  const per=d.btn===0?Math.floor(st.count/targets.length):1;if(per<=0){renderScreen();return;}
  for(const r of targets){if(!cursorStack)break;const s=getSlot(r);const room=slotMax(r,st)-(s?s.count:0);const k=Math.min(per,room,cursorStack.count);if(k<=0)continue;
    if(s)s.count+=k;else{const n=cloneStack(st);n.count=k;setSlot(r,n);}cursorStack.count-=k;if(cursorStack.count<=0)cursorStack=null;}
  screenChanged(d.start);
});
function clickSlot(r,btn){
  const s=getSlot(r);
  if(btn===0){
    if(!cursorStack){if(s){cursorStack=s;setSlot(r,null);}}
    else if(!s){if(accepts(r,cursorStack)){const m=slotMax(r,cursorStack);if(cursorStack.count<=m){setSlot(r,cursorStack);cursorStack=null;}else{const n=cloneStack(cursorStack);n.count=m;setSlot(r,n);cursorStack.count-=m;}}}
    else if(canStack(s,cursorStack)){const k=Math.min(cursorStack.count,slotMax(r,s)-s.count);s.count+=k;cursorStack.count-=k;if(cursorStack.count<=0)cursorStack=null;}
    else if(accepts(r,cursorStack)&&cursorStack.count<=slotMax(r,cursorStack)){setSlot(r,cursorStack);cursorStack=s;}
  } else if(btn===2){
    if(!cursorStack){if(s){const h=Math.ceil(s.count/2);cursorStack=cloneStack(s);cursorStack.count=h;s.count-=h;if(s.count<=0)setSlot(r,null);}}
    else if(!s){if(accepts(r,cursorStack)){const n=cloneStack(cursorStack);n.count=1;setSlot(r,n);cursorStack.count--;if(!cursorStack.count)cursorStack=null;}}
    else if(canStack(s,cursorStack)){if(s.count<slotMax(r,s)){s.count++;cursorStack.count--;if(!cursorStack.count)cursorStack=null;}}
    else if(accepts(r,cursorStack)&&cursorStack.count<=slotMax(r,cursorStack)){setSlot(r,cursorStack);cursorStack=s;}
  }
}
function screenChanged(r){if(screen&&screen.onChange)screen.onChange(r);onInventoryChanged();renderScreen();}
function collectAll(st){const ms=maxStack(st.id);for(const g of allGroups()){if(g.output)continue;for(let i=0;i<g.n&&st.count<ms;i++){const s=g.arr[g.from+i];if(s&&canStack(s,st)){const k=Math.min(s.count,ms-st.count);s.count-=k;st.count+=k;if(!s.count)g.arr[g.from+i]=null;}}}
  if(screen.onChange)screen.onChange(null);}
function allGroups(){return (screen.groups||[]).concat(screen.playerGroups);}
function moveInto(st,groups){ // move as much as possible of st into groups (merge first); returns leftover or null
  for(const g of groups){if(g.output)continue;for(let i=0;i<g.n&&st;i++){const s=g.arr[g.from+i];const r={g,i};if(s&&canStack(s,st)&&accepts(r,st)){const k=Math.min(st.count,slotMax(r,s)-s.count);s.count+=k;st.count-=k;if(!st.count)st=null;}}}
  for(const g of groups){if(g.output)continue;for(let i=0;i<g.n&&st;i++){const r={g,i};if(!g.arr[g.from+i]&&accepts(r,st)){const m=slotMax(r,st);const n=cloneStack(st);n.count=Math.min(m,st.count);g.arr[g.from+i]=n;st.count-=n.count;if(!st.count)st=null;}}}
  return st;
}
function quickMove(r){
  const s=getSlot(r);if(!s)return;setSlot(r,null);
  const targets=screen.quickTargets?screen.quickTargets(r,s):defaultQuickTargets(r,s);
  const left=moveInto(s,targets);if(left)setSlot(r,left);
}
function defaultQuickTargets(r,s){
  const pg=screen.playerGroups,hot=pg.find(g=>g.kind==='hotbar'),main=pg.find(g=>g.kind==='main');
  if(r.g.kind==='hotbar'||r.g.kind==='main'){
    const it=ITEM[s.id];const armor=screen.groups&&screen.groups.find(g=>g.kind==='armor');
    if(armor&&it&&it.armor&&!player.inv.armor[it.armor.slot])return [armor];
    const cont=(screen.groups||[]).filter(g=>!g.output&&g.kind!=='armor'&&g.kind!=='craft'&&g.kind!=='offhand');
    if(cont.length)return cont;
    return r.g.kind==='hotbar'?[main]:[hot];
  }
  return [hot&&{...hot,arr:hot.arr},main].filter(Boolean).reverse().length?[main,hot]:[main];
}
function takeOutput(r,btn,shift){
  const sc=screen;if(!sc.take)return;
  if(shift){let n=0;while(n<64&&sc.take(true))n++;}else sc.take(false,btn);
  onInventoryChanged();renderScreen();
}
function dropFromSlot(r,all){const s=getSlot(r);if(!s||r.g.output)return;const n=all?s.count:1;const st=cloneStack(s);st.count=n;s.count-=n;if(s.count<=0)setSlot(r,null);
  const e=dropItemAt(player.pos[0],player.pos[1]+1.3,player.pos[2],st,false);if(e){const d=forwardVec();e.vel=[d[0]*5,2,d[2]*5];e.pickupDelay=40;}if(screen.onChange)screen.onChange(r);onInventoryChanged();renderScreen();}
function swapWithHotbar(r,k){if(r.g.output)return;const hot=player.inv.main;const a=getSlot(r),b=hot[k];if(b&&!accepts(r,b))return;setSlot(r,b);hot[k]=a;if(screen.onChange)screen.onChange(r);onInventoryChanged();renderScreen();}
let mouseX=0,mouseY=0;
document.addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY;if(screen)drawCursor();const t=$('tip');if(t.style.display==='block'){t.style.left=(mouseX+14)+'px';t.style.top=(mouseY+10)+'px';}});
function drawCursor(){const c=$('cursor');if(!cursorStack||!screen){c.style.display='none';return;}c.style.display='block';c.style.left=(mouseX-20)+'px';c.style.top=(mouseY-20)+'px';
  c.querySelector('img').src=iconFor(cursorStack.id);c.querySelector('span').textContent=cursorStack.count>1?cursorStack.count:'';}
function showTip(s){const t=$('tip');if(!s||cursorStack){t.style.display='none';return;}const it=ITEM[s.id];let h=`<div class="n">${itemName(s)}</div>`;
  if(s.ench)for(const k in s.ench)h+=`<div class="e" style="color:#aaf">${ENCH[k].name} ${ROMAN[s.ench[k]]||s.ench[k]}</div>`;
  if(it&&it.attack)h+=`<div class="e">${it.attack} Attack Damage · ${it.attackSpeed} Attack Speed</div>`;
  if(it&&it.armor)h+=`<div class="e">+${it.armor.def} Armor${it.armor.tough?' · +'+it.armor.tough+' Toughness':''}</div>`;
  if(it&&it.food)h+=`<div class="e">Restores ${it.food.n} hunger</div>`;
  const md=maxDamage(s.id);if(md)h+=`<div class="e">Durability: ${md-(s.dmg|0)} / ${md}</div>`;
  if(FUEL[s.id])h+=`<div class="e">Fuel: ${(FUEL[s.id]/200).toFixed(1)} items</div>`;
  t.innerHTML=h;t.style.display='block';t.style.left=(mouseX+14)+'px';t.style.top=(mouseY+10)+'px';}
document.addEventListener('mousedown',e=>{ // click outside the panel with a cursor stack -> throw it (never lost)
  if(!screen||!cursorStack)return;const box=$('scrBox');if(box.contains(e.target))return;
  const n=e.button===2?1:cursorStack.count;const st=cloneStack(cursorStack);st.count=n;cursorStack.count-=n;if(cursorStack.count<=0)cursorStack=null;
  const ent=dropItemAt(player.pos[0],player.pos[1]+1.3,player.pos[2],st,false);if(ent){const d=forwardVec();ent.vel=[d[0]*5,2,d[2]*5];ent.pickupDelay=40;}drawCursor();});
/* crafting grid helper */
function craftGrid(title,size,extraGroups){
  const grid=new Array(size*size).fill(null),result=[null];
  const recompute=()=>{const m=matchRecipe(grid,size,size);result[0]=m?m.result:null;return m;};
  const cg={id:'craft',arr:grid,from:0,n:size*size,cols:size,kind:'craft'};
  const rg={id:'result',arr:result,from:0,n:1,cols:1,kind:'result',output:true};
  const sc={title,groups:[...(extraGroups||[]),cg,rg],playerGroups:playerGroups(),recipeBook:{size,grid},craftSize:size,
    renderTop(top){const armor=sc.groups.find(g=>g.kind==='armor');if(armor){const col=document.createElement('div');col.className='col';col.appendChild(makeGrid(armor));
        const off={id:'off',arr:player.inv.offhand,from:0,n:1,cols:1,kind:'offhand'};col.appendChild(document.createElement('br'));col.appendChild(makeGrid(off));top.appendChild(col);}
      top.appendChild(makeGrid(cg));const ar=document.createElement('div');ar.className='arrow';ar.textContent='➜';top.appendChild(ar);top.appendChild(makeGrid(rg));},
    onChange(){recompute();},
    take(shift,btn){const m=recompute();if(!m)return false;const out=m.result;
      if(shift){if(!player.inv.fits(out))return false;const extra=consumeGrid(grid);const l=player.inv.insert(out);if(l)player.give(l);for(const x of extra)player.give(x);}
      else{if(cursorStack&&(!canStack(cursorStack,out)||cursorStack.count+out.count>maxStack(out.id)))return false;const extra=consumeGrid(grid);
        if(cursorStack)cursorStack.count+=out.count;else cursorStack=out;for(const x of extra)player.give(x);}
      craftedHook(out);recompute();return true;},
    quickTargets(r,s){const pg=sc.playerGroups;if(r.g.kind==='craft')return [pg[1],pg[0]];const armor=sc.groups.find(g=>g.kind==='armor');const it=ITEM[s.id];
      if(armor&&it.armor&&!player.inv.armor[it.armor.slot])return [armor];if(r.g.kind==='armor'||r.g.kind==='offhand')return [pg[0],pg[1]];return r.g.kind==='hotbar'?[pg[0]]:[pg[1]];},
    onClose(){for(let i=0;i<grid.length;i++)if(grid[i]){player.give(grid[i]);grid[i]=null;}}};
  sc.fill=(recipe,max)=>fillFromBook(sc,grid,size,recipe,max);
  recompute();return sc;
}
function openInventory(){
  if(!player.alive())return;
  const sc=craftGrid(player.mode==='creative'?'Creative Inventory':'Inventory',2,[armorGroup()]);
  if(player.mode==='creative')sc.creativePalette=true;
  openScreen(sc);
}
function openCrafting(){openScreen(craftGrid('Crafting Table',3));}
function craftedHook(out){advanceItem(out.id);if(out.id===B.CRAFTING_TABLE)advance('craft_table');if(ITEM[out.id].tool&&ITEM[out.id].tool.type==='pickaxe')advance(out.id===I.WOODEN_PICKAXE?'wood_pick':'stone_pick');sfx.play('pickup');}
function openChest(x,y,z,v){
  let be=getBE(x,y,z);
  if(!be){be=makeBE(x,y,z,'chest');const loot=(v>>8)>>2;if(loot){const rng=S.mulberry32(S.hash(world.seed,x,y,z));const items=rollLoot(loot,rng);
      for(const s of items){const slot=Math.floor(rng()*27);if(!be.items[slot])be.items[slot]=s;else insertStack(be.items,s);}setV(x,y,z,V(B.CHEST,(v>>8)&3),SET_NO_CALLBACKS);}}
  const g={id:'chest',arr:be.items,from:0,n:27,cols:9,kind:'chest'};
  openScreen({title:'Chest',be,groups:[g],playerGroups:playerGroups(),renderTop(top){top.appendChild(makeGrid(g));},onChange(){beDirty(be);},
    quickTargets(r){const pg=this.playerGroups;return r.g.kind==='chest'?[pg[1],pg[0]].reverse():[g];},onClose(){beDirty(be);sfx.play('door_close',x,y,z);}});
  sfx.play('door_open',x,y,z);
}
function openFurnace(x,y,z){
  const be=getBE(x,y,z)||makeBE(x,y,z,'furnace');
  const gi={id:'fin',arr:be.items,from:0,n:1,cols:1,kind:'input'},gf={id:'ffuel',arr:be.items,from:1,n:1,cols:1,kind:'fuel',filter:s=>!!FUEL[s.id]},
    go={id:'fout',arr:be.items,from:2,n:1,cols:1,kind:'output',output:true};
  const sc={title:'Furnace',be,groups:[gi,gf,go],playerGroups:playerGroups(),
    renderTop(top){const col=document.createElement('div');col.className='col';col.appendChild(makeGrid(gi));const fl=document.createElement('div');fl.className='flame';fl.innerHTML='<i id="fFlame"></i>';col.appendChild(fl);col.appendChild(makeGrid(gf));
      top.appendChild(col);const pr=document.createElement('div');pr.className='prog';pr.innerHTML='<i id="fProg"></i>';top.appendChild(pr);top.appendChild(makeGrid(go));sc.tick();},
    tick(){const f=$('fFlame'),p=$('fProg');if(f)f.style.height=(be.burnMax?be.burn/be.burnMax*100:0)+'%';if(p)p.style.width=(be.cook/200*100)+'%';
      if(sc.lastOut!==(be.items[2]&&be.items[2].count)||sc.lastIn!==(be.items[0]&&be.items[0].count)){sc.lastOut=be.items[2]&&be.items[2].count;sc.lastIn=be.items[0]&&be.items[0].count;renderScreen();}},
    take(shift){const s=be.items[2];if(!s)return false;
      if(shift){const l=player.inv.insert(s);be.items[2]=l;if(l)return false;}
      else{if(cursorStack&&!canStack(cursorStack,s))return false;const room=cursorStack?maxStack(s.id)-cursorStack.count:s.count;const k=Math.min(room,s.count);if(k<=0)return false;
        if(cursorStack)cursorStack.count+=k;else{cursorStack=cloneStack(s);cursorStack.count=k;}s.count-=k;if(s.count<=0)be.items[2]=null;}
      const xp=Math.floor(be.xp);if(xp>0){player.addXP(xp);be.xp-=xp;}advanceItem(s.id);beDirty(be);return !shift;},
    quickTargets(r,s){const pg=this.playerGroups;if(r.g.kind==='input'||r.g.kind==='fuel')return [pg[1],pg[0]];if(SMELT[s.id]&&!(FUEL[s.id]&&be.items[0]))return [gi];if(FUEL[s.id])return [gf];return r.g.kind==='hotbar'?[pg[0]]:[pg[1]];},
    onChange(){beDirty(be);}};
  openScreen(sc);
}
function openEnchanting(x,y,z){
  const slots=[null,null];
  const gi={id:'eitem',arr:slots,from:0,n:1,cols:1,kind:'input',max:1,filter:s=>!!(ITEM[s.id]&&(ITEM[s.id].tool||ITEM[s.id].armor||s.id===I.BOW))&&!s.ench},
    gl={id:'elapis',arr:slots,from:1,n:1,cols:1,kind:'lapis',filter:s=>s.id===I.LAPIS_LAZULI};
  let shelves=0;for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=0;dy<=1;dy++)if((Math.abs(dx)===2||Math.abs(dz)===2)&&getId(x+dx,y+dy,z+dz)===B.BOOKSHELF)shelves++;
  shelves=Math.min(15,shelves);
  const sc={title:'Enchant',groups:[gi,gl],playerGroups:playerGroups(),
    renderTop(top){const col=document.createElement('div');col.className='col';col.appendChild(makeGrid(gi));col.appendChild(makeGrid(gl));top.appendChild(col);
      const opts=document.createElement('div');const s=slots[0];
      for(let i=0;i<3;i++){const o=enchantOption(s,i,shelves);const d=document.createElement('div');const can=o&&(player.xpLevel>=o.cost||player.creativeLike())&&(slots[1]&&slots[1].count>=i+1||player.creativeLike());
        d.className='ench'+(can?'':' no');d.innerHTML=o?`<b>${o.cost}</b> · ${ENCH[o.ench].name} ${ROMAN[o.lvl]}… <span class="small">(${i+1} lapis, ${i+1} levels)</span>`:'—';
        d.onclick=()=>{if(!can)return;s.ench={[o.ench]:o.lvl};if(o.extra)s.ench[o.extra[0]]=o.extra[1];if(!player.creativeLike()){player.spendLevels(i+1);slots[1].count-=i+1;if(!slots[1].count)slots[1]=null;}
          player.enchSeed=(Math.random()*1e9)|0;sfx.play('levelup');advance('enchant');renderScreen();};opts.appendChild(d);}
      const inf=document.createElement('div');inf.className='small';inf.textContent=`Bookshelves: ${shelves}/15 · Your level: ${player.xpLevel}`;opts.appendChild(inf);top.appendChild(opts);},
    quickTargets(r,s){const pg=this.playerGroups;if(r.g.kind==='input'||r.g.kind==='lapis')return [pg[1],pg[0]];if(s.id===I.LAPIS_LAZULI)return [gl];return [gi];},
    onClose(){for(let i=0;i<2;i++)if(slots[i]){player.give(slots[i]);slots[i]=null;}}};
  openScreen(sc);
}
function enchantOption(s,i,shelves){
  if(!s)return null;const it=ITEM[s.id];if(!it)return null;const cats=enchantCategories(s.id);
  const r=S.mulberry32(S.hash(player.enchSeed|0,s.id,i,shelves));
  const base=1+Math.floor(r()*8)+Math.floor(shelves/2)+Math.floor(r()*(shelves+1));
  const cost=i===0?Math.max(Math.floor(base/3),1):(i===1?Math.floor(base*2/3)+1:Math.max(base,shelves*2));
  const cands=Object.keys(ENCH).filter(k=>ENCH[k].on.some(c=>cats.includes(c)||c==='*'&&cats.includes('*')));if(!cands.length)return null;
  const ench=cands[Math.floor(r()*cands.length)],E=ENCH[ench];const lvl=clamp(1+Math.floor(cost/30*E.max*1.2+r()*0.8),1,E.max);
  let extra=null;if(cost>15&&r()<0.5){const c2=cands.filter(k=>k!==ench&&k!==E.excl&&ENCH[k].excl!==ench);if(c2.length){const k=c2[Math.floor(r()*c2.length)];extra=[k,clamp(1+Math.floor(r()*ENCH[k].max),1,ENCH[k].max)];}}
  return {cost,ench,lvl,extra};
}
/* creative palette (items are created, not moved: infinite source; the trash slot destroys the cursor stack by explicit request) */
let paletteFilter='';
function renderPalette(box,top){
  const wrap=document.createElement('div');const h=document.createElement('h2');h.textContent='All items';wrap.appendChild(h);
  const inp=document.createElement('input');inp.type='text';inp.placeholder='Search…';inp.value=paletteFilter;inp.oninput=()=>{paletteFilter=inp.value;fill();};inp.onkeydown=e=>e.stopPropagation();wrap.appendChild(inp);
  const pal=document.createElement('div');pal.id='palette';wrap.appendChild(pal);
  const trash=document.createElement('div');trash.className='slot';trash.title='Destroy item (drop the cursor stack here)';trash.style.background='rgba(120,20,20,.6)';trash.innerHTML='<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">✖</span>';
  trash.onmousedown=e=>{e.preventDefault();if(cursorStack){cursorStack=null;drawCursor();}else if(e.shiftKey){player.inv.main.fill(null);onInventoryChanged();renderScreen();}};
  const row=document.createElement('div');row.className='frow';row.appendChild(trash);const lab=document.createElement('span');lab.className='small';lab.textContent='Destroy slot (shift-click: clear inventory)';row.appendChild(lab);wrap.appendChild(row);
  function fill(){pal.innerHTML='';const f=paletteFilter.toLowerCase();
    for(const it of ITEM){if(!it||it.id===0)continue;if(f&&!it.name.toLowerCase().includes(f))continue;const d=document.createElement('div');d.className='slot';d.innerHTML=`<img src="${iconFor(it.id)}" alt="">`;
      d.onmouseenter=()=>showTip(mkStack(it.id,1));d.onmouseleave=()=>$('tip').style.display='none';
      d.onmousedown=e=>{e.preventDefault();if(cursorStack){cursorStack=null;drawCursor();return;}const st=mkStack(it.id,e.button===2?1:maxStack(it.id));
        if(e.shiftKey){const l=player.inv.insert(st);void l;onInventoryChanged();renderScreen();}else{cursorStack=st;drawCursor();}};pal.appendChild(d);}}
  fill();box.insertBefore(wrap,box.children[1]);void top;
}
/* recipe book */
function renderRecipeBook(box,top){
  const sc=screen,size=sc.recipeBook.size;const wrap=document.createElement('div');wrap.className='col';const h=document.createElement('h2');h.textContent='Recipe book';wrap.appendChild(h);
  const list=document.createElement('div');list.id='recipes';wrap.appendChild(list);
  const pool=player.creativeLike()?RECIPES:RECIPES.filter(r=>player.unlocked.has(r.id));
  const fits=r=>r.type==='shapeless'?r.list.length<=size*size:(r.w<=size&&r.h<=size);
  const rows=pool.filter(fits).map(r=>({r,ok:canFill(r)})).sort((a,b)=>(b.ok-a.ok)||itemName(mkStack(a.r.out,1)).localeCompare(itemName(mkStack(b.r.out,1))));
  for(const {r,ok} of rows){const d=document.createElement('div');d.className='rec'+(ok?'':' no');d.innerHTML=`<img src="${iconFor(r.out)}" alt=""> ${r.n>1?r.n+'× ':''}${ITEM[r.out].name}`;
    d.title='Click: place ingredients · Shift-click: as many as possible';d.onclick=e=>{if(sc.fill(r,e.shiftKey))renderScreen();else toast('Missing ingredients');};list.appendChild(d);}
  if(!rows.length){list.innerHTML='<div class="small" style="padding:6px">Collect materials to unlock recipes.</div>';}
  top.appendChild(wrap);void box;
}
function canFill(r){const need=new Map();const add=opts=>{const k=opts.join(',');need.set(k,{opts,n:(need.get(k)?need.get(k).n:0)+1});};
  if(r.type==='shaped')r.cells.flat().forEach(c=>c&&add(c));else r.list.forEach(add);
  for(const {opts,n} of need.values()){let have=0;for(const id of opts)have+=player.inv.count(id);if(have<n)return false;}return true;}
function fillFromBook(sc,grid,size,r,max){ // atomic: snapshot, try, roll back on failure
  const snapInv=player.inv.main.map(cloneStack),snapGrid=grid.map(cloneStack);
  const rollback=()=>{for(let i=0;i<36;i++)player.inv.main[i]=snapInv[i];for(let i=0;i<grid.length;i++)grid[i]=snapGrid[i];};
  for(let i=0;i<grid.length;i++)if(grid[i]){const l=player.inv.insert(grid[i]);if(l){rollback();return false;}grid[i]=null;}
  const cells=[];if(r.type==='shaped'){for(let y=0;y<r.h;y++)for(let x=0;x<r.w;x++)cells.push([y*size+x,r.cells[y][x]]);}else r.list.forEach((o,i)=>cells.push([i,o]));
  const sets=max?64:1;let made=0;
  for(let n=0;n<sets;n++){let ok=true;const took=[];
    for(const [idx,opts] of cells){if(!opts)continue;const cur=grid[idx];if(cur&&cur.count>=maxStack(cur.id)){ok=false;break;}
      let src=-1;for(let i=0;i<36;i++){const s=player.inv.main[i];if(s&&opts.includes(s.id)&&(!cur||canStack(cur,s))){src=i;break;}}
      if(src<0){ok=false;break;}const s=player.inv.main[src];s.count--;took.push([src,s.id,idx]);if(!s.count)player.inv.main[src]=null;
      if(cur)cur.count++;else grid[idx]=mkStack(s.id,1);}
    if(!ok){for(const [src,id,idx] of took){if(player.inv.main[src])player.inv.main[src].count++;else player.inv.main[src]=mkStack(id,1);grid[idx].count--;if(!grid[idx].count)grid[idx]=null;}break;}
    made++;}
  if(!made){rollback();return false;}
  sc.onChange();onInventoryChanged();return true;
}
/* ---------------- menus ---------------- */
function hidePanels(){for(const id of ['pause','settings','title','dead'])if(id!=='dead'||!player.dead)$(id).classList.remove('show');}
function showPause(){if(!gameRunning||screen)return;paused=true;clearInput();input.attack=input.use=false;document.exitPointerLock&&document.exitPointerLock();
  $('pMode').value=player.mode;$('pDiff').value=String(world.difficulty);$('pause').classList.add('show');
  $('pauseInfo').innerHTML=`<br>World: <b>${escapeHtml(world.name)}</b> · seed ${world.seed}<br>Dimension: ${DIMS[world.dim].name} · Day ${Math.floor(world.dayTime/24000)+1}`;}
$('bResume').onclick=()=>{$('pause').classList.remove('show');lockPointer();};
$('pMode').onchange=e=>setGamemode(e.target.value);
$('pDiff').onchange=e=>{world.difficulty=+e.target.value;world.metaDirty=true;toast('Difficulty: '+DIFF_NAMES[world.difficulty]);};
$('bSaveQuit').onclick=()=>quitToTitle();
$('bPSettings').onclick=()=>{$('pause').classList.remove('show');openSettings(()=>showPause());};
$('bAdv').onclick=()=>{const lines=Object.entries(ADV).map(([k,a])=>`${player.adv.has(k)?'✔':'·'} <b>${a.name}</b> — ${a.desc}`).join('<br>');$('pauseInfo').innerHTML='<br>'+lines;};
$('bStats').onclick=()=>{const s=player.stats;$('pauseInfo').innerHTML=`<br>Blocks mined: ${s.blocksMined}<br>Blocks placed: ${s.blocksPlaced}<br>Mobs killed: ${s.mobsKilled}<br>Deaths: ${s.deaths}<br>Distance: ${(s.distance/1000).toFixed(2)} km<br>Play time: ${Math.floor(world.playTicks/1200)} min`;};
$('bRespawn').onclick=()=>{respawn();};
$('bDeadTitle').onclick=()=>quitToTitle();
function showDeath(msg){$('deathMsg').textContent=msg;$('deathScore').textContent='Score: '+player.xpTotal;$('dead').classList.add('show');document.exitPointerLock&&document.exitPointerLock();}
function hideDeath(){$('dead').classList.remove('show');}
function showLoading(t){$('loadTxt').textContent=t;$('loadFill').style.width='0';$('loading').style.display='flex';}
function hideLoading(){$('loading').style.display='none';}
function setLoadingProgress(f){$('loadFill').style.width=(f*100)+'%';}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function openSettings(back){
  const b=$('settingsBox');const K=settings.keys;
  const kname=c=>c.replace(/^Key/,'').replace(/^Digit/,'').replace('Left',' (L)').replace('Right',' (R)');
  b.innerHTML=`<h2>Settings</h2>
  <div class="frow"><label>Render distance</label><input type="range" id="sRD" min="2" max="16" value="${settings.renderDist}"><span id="sRDv">${settings.renderDist}</span></div>
  <div class="frow"><label>Simulation distance</label><input type="range" id="sSD" min="2" max="8" value="${settings.simDist}"><span id="sSDv">${settings.simDist}</span></div>
  <div class="frow"><label>Field of view</label><input type="range" id="sFov" min="30" max="110" value="${settings.fov}"><span id="sFovv">${settings.fov}</span></div>
  <div class="frow"><label>Mouse sensitivity</label><input type="range" id="sSens" min="1" max="30" value="${settings.sens}"><label style="min-width:0"><input type="checkbox" id="sInv" ${settings.invertY?'checked':''}> invert Y</label></div>
  <div class="frow"><label>Volume</label><input type="range" id="sVol" min="0" max="100" value="${settings.volume*100}"><label style="min-width:0">Music</label><input type="range" id="sMus" min="0" max="100" value="${settings.music*100}"></div>
  <div class="frow"><label>GUI scale</label><input type="range" id="sGui" min="60" max="200" value="${settings.guiScale*100}"><label style="min-width:0"><input type="checkbox" id="sBob" ${settings.bobbing?'checked':''}> view bobbing</label></div>
  <div class="frow"><label>Toggles</label><label style="min-width:0"><input type="checkbox" id="sSpr" ${settings.sprintToggle?'checked':''}> toggle sprint</label><label style="min-width:0"><input type="checkbox" id="sCro" ${settings.crouchToggle?'checked':''}> toggle sneak</label></div>
  <h2>Key bindings <span class="small">(click, then press a key; Esc cancels)</span></h2><table class="kb">${Object.keys(DEFAULT_KEYS).map(k=>`<tr><td>${k}</td><td><button data-k="${k}">${rebinding===k?'…press a key…':kname(K[k])}</button></td></tr>`).join('')}</table>
  <div class="frow"><button id="sReset">Reset keys</button><button id="sDone">Done</button></div>`;
  const bind=(id,f)=>{const el=$(id);el.oninput=el.onchange=()=>{f(el);saveSettings();};};
  bind('sRD',el=>{settings.renderDist=+el.value;$('sRDv').textContent=el.value;lastCenter='';});bind('sSD',el=>{settings.simDist=+el.value;$('sSDv').textContent=el.value;});
  bind('sFov',el=>{settings.fov=+el.value;$('sFovv').textContent=el.value;});bind('sSens',el=>settings.sens=+el.value);bind('sInv',el=>settings.invertY=el.checked);
  bind('sVol',el=>{settings.volume=el.value/100;sfx.applyVolume();});bind('sMus',el=>{settings.music=el.value/100;sfx.applyVolume();});
  bind('sGui',el=>{settings.guiScale=el.value/100;applyGuiScale();});bind('sBob',el=>settings.bobbing=el.checked);bind('sSpr',el=>settings.sprintToggle=el.checked);bind('sCro',el=>settings.crouchToggle=el.checked);
  b.querySelectorAll('button[data-k]').forEach(btn=>btn.onclick=()=>{rebinding=btn.dataset.k;btn.textContent='…press a key…';});
  $('sReset').onclick=()=>{settings.keys=Object.assign({},DEFAULT_KEYS);saveSettings();renderSettings();};
  $('sDone').onclick=()=>{$('settings').classList.remove('show');rebinding=null;settingsBack&&settingsBack();};
  settingsBack=back;$('settings').classList.add('show');
}
let settingsBack=null;
function renderSettings(){if($('settings').classList.contains('show'))openSettings(settingsBack);}
function helpHTML(){const K=settings.keys,n=c=>c.replace(/^Key/,'');return `<b>${n(K.forward)}${n(K.left)}${n(K.back)}${n(K.right)}</b> move · <b>${n(K.jump)}</b> jump/swim · <b>${n(K.sneak)}</b> sneak (no falling off edges) · <b>${n(K.sprint)}</b> or double-tap forward: sprint<br>
  <b>Left mouse</b> hold: mine / attack (1.9-style cooldown) · <b>Right mouse</b>: use / place / eat / draw bow · <b>Middle</b>: pick block<br>
  <b>1-9</b>, wheel: hotbar · <b>${n(K.inventory)}</b>: inventory · <b>${n(K.drop)}</b>: drop (Ctrl: stack) · <b>${n(K.swap)}</b>: swap offhand<br>
  <b>${n(K.chat)}</b> chat · <b>/</b> commands (type /help) · <b>F3</b> debug · <b>F1</b> hide HUD · <b>F5</b> camera · <b>F4</b> survival⇄creative<br>
  Creative: double-tap jump to fly (${n(K.jump)} up, ${n(K.sneak)} down). Flight is not available in survival.`;}
/* ---------------- chat & commands ---------------- */
let chatOpen=false;
function openChat(prefix){chatOpen=true;document.exitPointerLock&&document.exitPointerLock();clearInput();const c=$('chat');c.style.display='block';const i=$('chatIn');i.value=prefix;setTimeout(()=>i.focus(),0);}
function closeChat(){chatOpen=false;$('chat').style.display='none';$('chatIn').blur();lockPointer();}
$('chatIn').addEventListener('keydown',e=>{e.stopPropagation();if(e.code==='Enter'){const v=$('chatIn').value.trim();closeChat();if(v)runCommand(v);}else if(e.code==='Escape'){closeChat();}});
function runCommand(txt){
  if(!txt.startsWith('/')){chatMsg('<Player> '+txt);return;}
  const a=txt.slice(1).split(/\s+/),c=a[0].toLowerCase(),p=player;
  const num=(s,d)=>{if(s===undefined)return d;if(s.startsWith('~'))return null;const n=parseFloat(s);return isFinite(n)?n:d;};
  const coord=(s,base)=>{if(s===undefined)return base;if(s.startsWith('~'))return base+(parseFloat(s.slice(1))||0);const n=parseFloat(s);return isFinite(n)?n:base;};
  const ok=m=>chatMsg(m,'#aaa'),err=m=>chatMsg(m,'#f66');
  try{switch(c){
    case 'help':ok('Commands: /gamemode <survival|creative|adventure|spectator> · /time <set|add> <day|noon|night|midnight|n> · /weather <clear|rain|thunder> · /give <item> [n] · /tp <x y z> · /kill · /effect <give|clear> [effect] [sec] [amp] · /difficulty <peaceful|easy|normal|hard> · /summon <mob> · /gamerule <rule> [value] · /locate <village|desert_pyramid|stronghold|fortress|igloo|ruined_portal> · /xp <n> [levels] · /clear · /enchant <ench> [lvl] · /setblock <x y z> <block> · /seed · /spawnpoint');break;
    case 'gamemode':{const m=GAMEMODES.find(g=>g.startsWith((a[1]||'').toLowerCase()));if(!m){err('Unknown game mode');break;}setGamemode(m);ok('Set own game mode to '+m);break;}
    case 'time':{const names={day:1000,noon:6000,night:13000,midnight:18000,sunrise:23000};let v=names[a[2]]!==undefined?names[a[2]]:num(a[2],NaN);if(!isFinite(v)){err('Invalid time');break;}
      if(a[1]==='set')world.dayTime=Math.floor(world.dayTime/24000)*24000+v;else if(a[1]==='add')world.dayTime+=v;else{err('Usage: /time set|add <value>');break;}world.metaDirty=true;ok('Time is now '+(world.dayTime%24000));break;}
    case 'weather':{const w=a[1];if(!['clear','rain','thunder'].includes(w)){err('Usage: /weather clear|rain|thunder');break;}world.weather.rain=w!=='clear';world.weather.thunder=w==='thunder';world.weather.rainTime=6000+randInt(0,12000);world.weather.thunderTime=world.weather.rainTime;ok('Weather set to '+w);break;}
    case 'give':{const key=(a[1]||'').replace(/^minecraft:/,'').toUpperCase();const id=I[key];if(!id){err('Unknown item '+a[1]);break;}const n=clamp(Math.floor(num(a[2],1)),1,64*36);let left=n;
      while(left>0){const k=Math.min(left,maxStack(id));p.give(mkStack(id,k));left-=k;}advanceItem(id);ok('Gave '+n+' '+ITEM[id].name);break;}
    case 'tp':{const x=coord(a[1],p.pos[0]),y=coord(a[2],p.pos[1]),z=coord(a[3],p.pos[2]);if(![x,y,z].every(isFinite)||Math.abs(x)>3e7||Math.abs(z)>3e7){err('Invalid position');break;}
      p.setPos(x,clamp(y,-60,400),z);p.renderPrev=p.pos.slice();p.vel=[0,0,0];p.fallDist=0;ok(`Teleported to ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`);break;}
    case 'kill':p.hurt(DMG.kill,1e6);break;
    case 'effect':{if(a[1]==='clear'){p.effects.clear();p.absorption=0;updateHud();ok('Cleared effects');break;}const k=(a[2]||'').toLowerCase();if(!EFFECTS[k]){err('Unknown effect');break;}p.addEffect(k,Math.floor(num(a[3],30)*20),clamp(Math.floor(num(a[4],0)),0,5));ok('Applied '+EFFECTS[k].name);break;}
    case 'difficulty':{const i=DIFF_NAMES.findIndex(n=>n.toLowerCase().startsWith((a[1]||'').toLowerCase()));if(i<0){ok('Difficulty is '+DIFF_NAMES[world.difficulty]);break;}world.difficulty=i;world.metaDirty=true;ok('Difficulty set to '+DIFF_NAMES[i]);break;}
    case 'summon':{const t=(a[1]||'').toLowerCase();const d=forwardVec();const x=p.pos[0]+d[0]*3,z=p.pos[2]+d[2]*3;
      if(MOBS[t]){spawnMob(t,x,p.pos[1],z);ok('Summoned '+MOBS[t].name);}else if(t==='tnt'){spawnPrimedTnt(Math.floor(x),Math.floor(p.pos[1]),Math.floor(z),80);}else if(t==='lightning_bolt'||t==='lightning'){const l=new Lightning();l.setPos(x,p.pos[1],z);world.entities.push(l);}
      else if(t==='ender_dragon'){const dr=new EnderDragon();dr.setPos(x,p.pos[1]+10,z);world.entities.push(dr);}else err('Unknown entity');break;}
    case 'gamerule':{const r=a[1];if(!(r in world.rules)){err('Rules: '+Object.keys(world.rules).join(', '));break;}if(a[2]===undefined){ok(r+' = '+world.rules[r]);break;}
      const cur=world.rules[r];world.rules[r]=typeof cur==='boolean'?a[2]==='true':clamp(parseInt(a[2],10)||0,0,100);world.metaDirty=true;ok(r+' = '+world.rules[r]);break;}
    case 'locate':{const k=(a[1]||'').toLowerCase();const col=world.dim===0?S.makeGenerator(world.seed,0).column:null;const r=S.locateStructure(world.seed,world.dim,k,p.pos[0],p.pos[2],col);
      if(!r){err('Could not find '+k+' nearby');break;}ok(`The nearest ${k} is at ${r.x}, ~, ${r.z} (${Math.round(Math.hypot(r.x-p.pos[0],r.z-p.pos[2]))} blocks away)`);break;}
    case 'xp':{const n=Math.floor(num(a[1],0));if(a[2]==='levels'||(a[1]||'').endsWith('L')){p.xpLevel=Math.max(0,p.xpLevel+parseInt(a[1],10));updateHud();}else p.addXP(n);ok('Given XP');break;}
    case 'clear':p.inv.clear();ok('Cleared inventory');break;
    case 'enchant':{const s=p.held();const k=(a[1]||'').toLowerCase();if(!s||!ENCH[k]){err('Hold an item and name an enchantment');break;}s.ench=s.ench||{};s.ench[k]=clamp(parseInt(a[2]||'1',10)||1,1,ENCH[k].max);onInventoryChanged();ok('Enchanted');break;}
    case 'setblock':{const x=Math.floor(coord(a[1],p.pos[0])),y=Math.floor(coord(a[2],p.pos[1])),z=Math.floor(coord(a[3],p.pos[2]));const id=B[(a[4]||'').toUpperCase()];
      if(id===undefined){err('Unknown block');break;}const st=clamp(parseInt(a[5]||'0',10)||0,0,255);if(setV(x,y,z,V(id,st)))ok('Block placed');else err('Cannot place there (unloaded?)');break;}
    case 'seed':ok('Seed: '+world.seed);break;
    case 'spawnpoint':world.spawn=[p.pos[0],p.pos[1],p.pos[2]];world.metaDirty=true;ok('World spawn set here');break;
    case 'save':requestSave('command');ok('Saving…');break;
    default:err('Unknown command. Type /help');
  }}catch(e){err('Command failed: '+e.message);}
}
/* ---------------- advancements & recipe unlocking ---------------- */
const ADV={mine_wood:{name:'Getting Wood',desc:'Punch a tree until a log pops out'},craft_table:{name:'Benchmarking',desc:'Craft a crafting table'},
  wood_pick:{name:'Time to Mine!',desc:'Craft a pickaxe'},stone_pick:{name:'Getting an Upgrade',desc:'Construct a better pickaxe'},
  iron:{name:'Acquire Hardware',desc:'Smelt an iron ingot'},diamond:{name:'Diamonds!',desc:'Acquire diamonds'},obsidian:{name:'Ice Bucket Challenge',desc:'Obtain a block of obsidian'},
  enter_nether:{name:'We Need to Go Deeper',desc:'Enter the Nether'},blaze_rod:{name:'Into Fire',desc:'Relieve a blaze of its rod'},eye:{name:'Eye Spy',desc:'Craft an eye of ender'},
  enter_end:{name:'The End?',desc:'Enter the End'},free_the_end:{name:'Free the End',desc:'Defeat the Ender Dragon'},kill_monster:{name:'Monster Hunter',desc:'Kill any hostile monster'},
  kill_animal:{name:'Hunter',desc:'Kill an animal'},breed:{name:'The Parrots and the Bats',desc:'Breed two animals together'},eat:{name:'Husbandry',desc:'Eat something'},
  sleep:{name:'Sweet Dreams',desc:'Sleep in a bed'},enchant:{name:'Enchanter',desc:'Enchant an item'},netherite:{name:'Cover Me in Debris',desc:'Obtain netherite'}};
function advance(k){if(!ADV[k]||player.adv.has(k))return;player.adv.add(k);world.metaDirty=true;const el=$('adv');el.innerHTML=`<b>Advancement made!</b><br>${ADV[k].name}`;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(()=>el.style.display='none',4000);chatMsg('Player has made the advancement ['+ADV[k].name+']','#ff5');sfx.play('levelup');}
function advanceItem(id){
  if(id===I.IRON_INGOT)advance('iron');if(id===I.DIAMOND)advance('diamond');if(id===B.OBSIDIAN)advance('obsidian');if(id===I.BLAZE_ROD)advance('blaze_rod');if(id===I.EYE_OF_ENDER)advance('eye');
  if(id===I.NETHERITE_INGOT||id===I.NETHERITE_SCRAP)advance('netherite');
  let n=0;for(const r of RECIPES){if(player.unlocked.has(r.id))continue;if(recipeIngredientsIds(r).includes(id)||r.type==='shaped'&&r.cells.flat().some(c=>c&&c.includes(id))||r.type==='shapeless'&&r.list.some(c=>c.includes(id))){player.unlocked.add(r.id);n++;}}
  if(n&&!player.creativeLike())chatMsg(n+' new recipe'+(n>1?'s':'')+' unlocked','#8f8');
}
