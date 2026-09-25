/* =====================================================================
   REDSTONE: emitters, conductive blocks (strong/weak power), wire networks,
   torches, repeaters, lamps, levers, buttons, plates, observers, pistons.
   ===================================================================== */
const RS=id=>DEF[id]&&DEF[id].redstone;
const isConductor=v=>v>0&&(FLAGS[v]&F_OPAQUE)&&(FLAGS[v]&F_SOLID)&&!RS(v&255);
// face index -> direction vector; attach codes of levers/buttons: 0 floor(support below) 1 ceiling 2..5 wall N,E,S,W
function attachedFace(v){ // face index pointing from the component to the block it is attached to
  const id=v&255,s=v>>8;
  if(id===B.REDSTONE_TORCH){const a=s&7;if(a===0||a>4)return 2;return HFACE[a-1];}
  if(id===B.LEVER||id===B.STONE_BUTTON){const a=s&7;if(a===0)return 2;if(a===1)return 3;return HFACE[a-2];}
  if(id===B.STONE_PRESSURE_PLATE)return 2;
  return -1;
}
// power emitted by component v (at pos p) into neighbour in direction face f (p -> p+FDIR[f]); strong=true -> only strong power
function emits(v,f,strong){
  if(v<=0)return 0;const id=v&255,s=v>>8;
  switch(RS(id)){
    case 'lever':if(!(s&8))return 0;return strong?(attachedFace(v)===f?15:0):15;
    case 'button':if(!(s&8))return 0;return strong?(attachedFace(v)===f?15:0):15;
    case 'plate':if(!(s&1))return 0;return strong?(f===2?15:0):15;
    case 'torch':if(s&8)return 0;if(strong)return f===3?15:0;return attachedFace(v)===f?0:15;
    case 'repeater':if(!(s&16))return 0;return HFACE[s&3]===f?15:0;
    case 'observer':if(!(s&8))return 0;return OPP[s&7]===f?15:0;
    case 'wire':{if(strong)return 0;const p=s&15;if(!p)return 0;if(f===2)return p;if(f===3)return 0;return p;}
  }
  if(id===B.REDSTONE_BLOCK)return strong?0:15;
  return 0;
}
// strong power flowing into conductor block at (x,y,z)
function strongPowerInto(x,y,z){let m=0;for(let f=0;f<6;f++){const d=FDIR[f],n=getV(x+d[0],y+d[1],z+d[2]);if(n<=0||!RS(n&255))continue;
  const e=emits(n,OPP[f],true);if(e>m){m=e;if(m>=15)break;}}return m;}
function weakPowerInto(x,y,z){let m=0;for(let f=0;f<6;f++){const d=FDIR[f],n=getV(x+d[0],y+d[1],z+d[2]);if(n<=0)continue;const id=n&255;
  if(id===B.REDSTONE_WIRE){const p=(n>>8)&15;if(p>m&&f!==2)m=p;} // wire powers the block below it and blocks beside it
  else if(RS(id)){const e=emits(n,OPP[f],true);if(e>m)m=e;}}return m;}
// input power for a component at (x,y,z) from any side; excludeFace skips one side
function redstonePowerAt(x,y,z,excludeFace=-1){
  let m=0;
  for(let f=0;f<6;f++){if(f===excludeFace)continue;const d=FDIR[f],nx=x+d[0],ny=y+d[1],nz=z+d[2],n=getV(nx,ny,nz);if(n<=0)continue;
    const e=emits(n,OPP[f],false);if(e>m)m=e;
    if(isConductor(n)){const bp=Math.max(strongPowerInto(nx,ny,nz),weakPowerInto(nx,ny,nz));if(bp>m)m=bp;}
    if(m>=15)return 15;}
  return m;
}
function powerFromFace(x,y,z,f){ // power arriving at (x,y,z) from its neighbour on face f
  const d=FDIR[f],nx=x+d[0],ny=y+d[1],nz=z+d[2],n=getV(nx,ny,nz);if(n<=0)return 0;
  let m=emits(n,OPP[f],false);if(isConductor(n))m=Math.max(m,strongPowerInto(nx,ny,nz),weakPowerInto(nx,ny,nz));return m;
}
function notifyAround(x,y,z){for(let f=0;f<6;f++){const d=FDIR[f];queueUpdate(x+d[0],y+d[1],z+d[2],x,y,z);}}
function notifyAround2(x,y,z){notifyAround(x,y,z);for(let f=0;f<6;f++){const d=FDIR[f];const n=getV(x+d[0],y+d[1],z+d[2]);if(isConductor(n))notifyAround(x+d[0],y+d[1],z+d[2]);}}
/* ---------------- wire networks ---------------- */
const wirePending=new Set();let wireBusy=false;
function requestWire(x,y,z){wirePending.add(posKey(x,y,z));}
function processWires(){
  if(wireBusy||!wirePending.size)return;wireBusy=true;
  try{
    const done=new Set();
    for(const k of [...wirePending]){wirePending.delete(k);if(done.has(k))continue;const [x,y,z]=k.split(',').map(Number);if(getId(x,y,z)!==B.REDSTONE_WIRE)continue;solveNetwork(x,y,z,done);}
  }finally{wireBusy=false;}
}
function wireNeighbors(x,y,z,out){
  out.length=0;
  for(const [dx,dz] of HVEC){
    const n=getV(x+dx,y,z+dz);
    if((n&255)===B.REDSTONE_WIRE&&n>0){out.push([x+dx,y,z+dz]);continue;}
    const up=getV(x+dx,y+1,z+dz),above=getV(x,y+1,z);
    if(up>0&&(up&255)===B.REDSTONE_WIRE&&!isConductor(above))out.push([x+dx,y+1,z+dz]);
    if(!isConductor(n)){const dn=getV(x+dx,y-1,z+dz);if(dn>0&&(dn&255)===B.REDSTONE_WIRE)out.push([x+dx,y-1,z+dz]);}
  }
  return out;
}
function wireSourcePower(x,y,z){ // power reaching a wire from non-wire sources
  let m=0;
  for(let f=0;f<6;f++){const d=FDIR[f],nx=x+d[0],ny=y+d[1],nz=z+d[2],n=getV(nx,ny,nz);if(n<=0||(n&255)===B.REDSTONE_WIRE)continue;
    const e=emits(n,OPP[f],false);if(e>m)m=e;
    if(isConductor(n)){const sp=strongPowerInto(nx,ny,nz);if(sp>m)m=sp;}
    if(m>=15)break;}
  return m;
}
function solveNetwork(x0,y0,z0,done){
  const cells=new Map(),stack=[[x0,y0,z0]],tmp=[];
  while(stack.length&&cells.size<4096){const [x,y,z]=stack.pop();const k=posKey(x,y,z);if(cells.has(k))continue;cells.set(k,{x,y,z,src:0,lvl:0,nb:[]});
    for(const n of wireNeighbors(x,y,z,tmp)){cells.get(k).nb.push(posKey(n[0],n[1],n[2]));stack.push(n);}}
  const buckets=[];for(let i=0;i<=15;i++)buckets.push([]);
  for(const [k,c] of cells){done.add(k);c.src=wireSourcePower(c.x,c.y,c.z);c.lvl=c.src;if(c.src)buckets[c.src].push(k);}
  for(let L=15;L>0;L--)for(const k of buckets[L]){const c=cells.get(k);if(c.lvl!==L)continue;
    for(const nk of c.nb){const n=cells.get(nk);if(n&&n.lvl<L-1){n.lvl=L-1;buckets[L-1].push(nk);}}}
  for(const c of cells.values()){const v=getV(c.x,c.y,c.z);if(((v>>8)&15)!==c.lvl){setV(c.x,c.y,c.z,V(B.REDSTONE_WIRE,c.lvl),SET_NO_CALLBACKS|SET_NO_OBSERVER);
    // notify non-wire neighbours (components + blocks below/beside whose power changed)
    for(let f=0;f<6;f++){const d=FDIR[f],nx=c.x+d[0],ny=c.y+d[1],nz=c.z+d[2];const n=getV(nx,ny,nz);if((n&255)===B.REDSTONE_WIRE)continue;
      queueUpdate(nx,ny,nz,c.x,c.y,c.z);if(isConductor(n))for(let g=0;g<6;g++){const e=FDIR[g];const m=getV(nx+e[0],ny+e[1],nz+e[2]);if((m&255)!==B.REDSTONE_WIRE)queueUpdate(nx+e[0],ny+e[1],nz+e[2],nx,ny,nz);}}}}
}
beh(B.REDSTONE_WIRE,{onPlace(x,y,z){requestWire(x,y,z);},
  onNeighbor(x,y,z,v){if(!canSurvive(x,y,z,v)){destroyBlock(x,y,z,true,null,false);return;}requestWire(x,y,z);},
  onRemove(x,y,z){for(const [dx,dz] of HVEC)for(const dy of [-1,0,1])if(getId(x+dx,y+dy,z+dz)===B.REDSTONE_WIRE)requestWire(x+dx,y+dy,z+dz);notifyAround2(x,y,z);}});
/* ---------------- torches, repeaters, lamps ---------------- */
beh(B.REDSTONE_TORCH,{
  onNeighbor(x,y,z,v){if(!canSurvive(x,y,z,v)){destroyBlock(x,y,z,true,null,false);return;}scheduleTick(x,y,z,2,B.REDSTONE_TORCH);},
  onPlace(x,y,z){scheduleTick(x,y,z,2,B.REDSTONE_TORCH);notifyAround2(x,y,z);},
  onRemove(x,y,z){notifyAround2(x,y,z);},
  onTick(x,y,z,v){const af=attachedFace(v),d=FDIR[af],ax=x+d[0],ay=y+d[1],az=z+d[2],a=getV(ax,ay,az);
    const powered=isConductor(a)?Math.max(strongPowerInto(ax,ay,az),weakPowerInto(ax,ay,az))>0:false;
    const s=v>>8,lit=!(s&8);if(powered===lit){setV(x,y,z,V(B.REDSTONE_TORCH,powered?(s|8):(s&~8)),SET_NO_CALLBACKS);notifyAround2(x,y,z);}}});
beh(B.REPEATER,{
  onNeighbor(x,y,z,v){if(!canSurvive(x,y,z,v)){destroyBlock(x,y,z,true,null,false);return;}const s=v>>8,d=(s>>2)&3;scheduleTick(x,y,z,(d+1)*2,B.REPEATER);},
  onPlace(x,y,z){scheduleTick(x,y,z,2,B.REPEATER);},
  onRemove(x,y,z,v){const f=HFACE[(v>>8)&3],d=FDIR[f];notifyAround(x+d[0],y+d[1],z+d[2]);notifyAround(x,y,z);},
  onTick(x,y,z,v){const s=v>>8,back=OPP[HFACE[s&3]],inp=powerFromFace(x,y,z,back)>0,on=!!(s&16);
    if(inp!==on){setV(x,y,z,V(B.REPEATER,inp?(s|16):(s&~16)),SET_NO_CALLBACKS);const f=HFACE[s&3],d=FDIR[f];queueUpdate(x+d[0],y+d[1],z+d[2],x,y,z);notifyAround2(x+d[0],y+d[1],z+d[2]);
      if(inp)scheduleTick(x,y,z,(((s>>2)&3)+1)*2,B.REPEATER);}},
  onUse(x,y,z,v){const s=v>>8;setV(x,y,z,V(B.REPEATER,(s&~12)|((((s>>2)&3)+1)&3)<<2),0);sfx.play('click',x,y,z);return true;}});
beh(B.REDSTONE_LAMP,{onNeighbor(x,y,z,v){const pw=redstonePowerAt(x,y,z)>0,lit=!!((v>>8)&1);if(pw&&!lit)setV(x,y,z,V(B.REDSTONE_LAMP,1),SET_NO_CALLBACKS);else if(!pw&&lit)scheduleTick(x,y,z,4,B.REDSTONE_LAMP);},
  onPlace(x,y,z,v){queueUpdate(x,y,z,x,y,z);},
  onTick(x,y,z,v){if(!(redstonePowerAt(x,y,z)>0)&&((v>>8)&1))setV(x,y,z,V(B.REDSTONE_LAMP,0),SET_NO_CALLBACKS);}});
/* ---------------- levers, buttons, plates ---------------- */
function toggleSwitch(x,y,z,v,on){if(v<=0||attachedFace(v)<0)return;const s=v>>8;setV(x,y,z,V(v&255,on?(s|8):(s&~8)),SET_NO_CALLBACKS);notifyAround2(x,y,z);
  const af=attachedFace(v),d=FDIR[af];notifyAround2(x+d[0],y+d[1],z+d[2]);}
beh(B.LEVER,{onUse(x,y,z,v){toggleSwitch(x,y,z,v,!((v>>8)&8));sfx.play('click',x,y,z);return true;},onRemove(x,y,z,v){if((v>>8)&8&&attachedFace(v)>=0){const d=FDIR[attachedFace(v)];notifyAround2(x,y,z);notifyAround2(x+d[0],y+d[1],z+d[2]);}}});
beh(B.STONE_BUTTON,{onUse(x,y,z,v){if((v>>8)&8)return true;toggleSwitch(x,y,z,v,true);scheduleTick(x,y,z,20,B.STONE_BUTTON);sfx.play('click',x,y,z);return true;},
  onTick(x,y,z,v){if((v>>8)&8){toggleSwitch(x,y,z,v,false);sfx.play('click',x,y,z);}},onRemove(x,y,z,v){if((v>>8)&8&&attachedFace(v)>=0){const d=FDIR[attachedFace(v)];notifyAround2(x,y,z);notifyAround2(x+d[0],y+d[1],z+d[2]);}}});
beh(B.STONE_PRESSURE_PLATE,{
  onEntityInside(e,x,y,z){const v=getV(x,y,z);if(!((v>>8)&1)){setV(x,y,z,V(B.STONE_PRESSURE_PLATE,1),SET_NO_CALLBACKS);notifyAround2(x,y,z);notifyAround2(x,y-1,z);sfx.play('click',x,y,z);}
    scheduleTick(x,y,z,20,B.STONE_PRESSURE_PLATE);},
  onTick(x,y,z,v){if(!((v>>8)&1))return;if(entitiesInBox(x+0.06,y,z+0.06,x+0.94,y+0.3,z+0.94).some(e=>e.living||e.type==='item')){scheduleTick(x,y,z,20,B.STONE_PRESSURE_PLATE);return;}
    setV(x,y,z,V(B.STONE_PRESSURE_PLATE,0),SET_NO_CALLBACKS);notifyAround2(x,y,z);notifyAround2(x,y-1,z);sfx.play('click',x,y,z);},
  onRemove(x,y,z,v){if((v>>8)&1){notifyAround2(x,y,z);notifyAround2(x,y-1,z);}}});
beh(B.REDSTONE_BLOCK,{onPlace(x,y,z){notifyAround2(x,y,z);},onRemove(x,y,z){notifyAround2(x,y,z);}});
/* ---------------- observer ---------------- */
beh(B.OBSERVER,{onTick(x,y,z,v){const s=v>>8;
  if(!(s&8)){setV(x,y,z,V(B.OBSERVER,s|8),SET_NO_CALLBACKS|SET_NO_OBSERVER);scheduleTick(x,y,z,2,B.OBSERVER);}
  else setV(x,y,z,V(B.OBSERVER,s&~8),SET_NO_CALLBACKS|SET_NO_OBSERVER);
  const b=FDIR[OPP[s&7]];queueUpdate(x+b[0],y+b[1],z+b[2],x,y,z);notifyAround2(x+b[0],y+b[1],z+b[2]);}});
/* ---------------- pistons ---------------- */
const IMMOVABLE=new Set([B.OBSIDIAN,B.CRYING_OBSIDIAN,B.BEDROCK,B.END_PORTAL_FRAME,B.END_PORTAL,B.NETHER_PORTAL,B.PISTON_HEAD,B.SPAWNER,B.ENCHANTING_TABLE]);
function pistonPowered(x,y,z,front){for(let f=0;f<6;f++){if(f===front)continue;if(powerFromFace(x,y,z,f)>0)return true;}return powerFromFace(x,y+1,z,3)>0&&false;}
function isMovable(v){if(v<=0)return true;const id=v&255;if(IMMOVABLE.has(id)||DEF[id].hard<0||DEF[id].be)return false;
  if((id===B.PISTON||id===B.STICKY_PISTON)&&((v>>8)&8))return false;return true;}
const breaksOnPush=v=>v>0&&!(FLAGS[v]&F_SOLID)&&!(FLAGS[v]&F_LIQUID)||(v>0&&(FLAGS[v]&F_REPL));
for(const pid of [B.PISTON,B.STICKY_PISTON])beh(pid,{
  onNeighbor(x,y,z){scheduleTick(x,y,z,1,pid);},onPlace(x,y,z){scheduleTick(x,y,z,1,pid);},
  onRemove(x,y,z,v){if((v>>8)&8){const d=FDIR[(v>>8)&7];if(getId(x+d[0],y+d[1],z+d[2])===B.PISTON_HEAD)setV(x+d[0],y+d[1],z+d[2],0,SET_NO_CALLBACKS|SET_NOTIFY);}},
  onTick(x,y,z,v){const s=v>>8,f=s&7,ext=!!(s&8),pw=pistonPowered(x,y,z,f);const d=FDIR[f];
    if(pw&&!ext){
      const line=[];let cx=x+d[0],cy=y+d[1],cz=z+d[2];
      for(let i=0;i<=12;i++){const n=getV(cx,cy,cz);if(n<0||cy<0||cy>255)return;
        if(n===0||(FLAGS[n]&F_LIQUID)||breaksOnPush(n))break;if(!isMovable(n)||i===12)return;line.push([cx,cy,cz,n]);cx+=d[0];cy+=d[1];cz+=d[2];}
      const end=getV(cx,cy,cz);if(end>0&&breaksOnPush(end))destroyBlock(cx,cy,cz,true,null,false);
      for(let i=line.length-1;i>=0;i--){const [bx,by,bz,bv]=line[i];setV(bx+d[0],by+d[1],bz+d[2],bv);}
      pushEntities(x+d[0],y+d[1],z+d[2],d,line.length+1);
      setV(x,y,z,V(pid,s|8),SET_NO_CALLBACKS);setV(x+d[0],y+d[1],z+d[2],V(B.PISTON_HEAD,f|(pid===B.STICKY_PISTON?8:0)));
      sfx.play('piston_out',x,y,z);
    } else if(!pw&&ext){
      const hx=x+d[0],hy=y+d[1],hz=z+d[2];if(getId(hx,hy,hz)===B.PISTON_HEAD)setV(hx,hy,hz,0,SET_NO_CALLBACKS|SET_NOTIFY);
      setV(x,y,z,V(pid,s&~8),SET_NO_CALLBACKS);
      if(pid===B.STICKY_PISTON){const px=hx+d[0],py=hy+d[1],pz=hz+d[2],pv=getV(px,py,pz);
        if(pv>0&&isMovable(pv)&&!breaksOnPush(pv)&&!(FLAGS[pv]&F_LIQUID)){setV(px,py,pz,0);setV(hx,hy,hz,pv);}}
      sfx.play('piston_in',x,y,z);
    }}});
beh(B.PISTON_HEAD,{onNeighbor(x,y,z,v){const f=(v>>8)&7,d=FDIR[f];const b=getV(x-d[0],y-d[1],z-d[2]);if(b>=0&&!(((b&255)===B.PISTON||(b&255)===B.STICKY_PISTON)&&((b>>8)&8)))setV(x,y,z,0);},
  onRemove(x,y,z,v){const f=(v>>8)&7,d=FDIR[f];const bx=x-d[0],by=y-d[1],bz=z-d[2],b=getV(bx,by,bz);if(b>0&&((b&255)===B.PISTON||(b&255)===B.STICKY_PISTON)&&((b>>8)&8))destroyBlock(bx,by,bz,true,null,false);}});
