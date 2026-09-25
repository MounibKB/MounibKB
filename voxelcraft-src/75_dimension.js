/* =====================================================================
   PORTAL TRAVEL between dimensions
   ===================================================================== */
let pendingPortal=null;
function usePortal(kind){
  const p=player,from=world.dim;
  if(kind==='nether'){
    const to=from===1?0:1,f=to===1?1/8:8;
    const tx=Math.floor(p.pos[0]*f),tz=Math.floor(p.pos[2]*f),ty=to===1?clamp(Math.floor(p.pos[1]),40,110):Math.floor(p.pos[1]);
    pendingPortal={kind,to,x:tx,y:ty,z:tz,axis:portalAxisAt(Math.floor(p.pos[0]),Math.floor(p.pos[1]),Math.floor(p.pos[2]))};
    changeDimension(to,[tx+0.5,ty,tz+0.5]);sfx.play('portal_travel');
  } else if(kind==='end'){
    if(from===2){pendingPortal=null;const b=p.bed;const sp=b&&b.dim===0?[b.x+0.5,b.y+0.6,b.z+0.5]:world.spawn.slice();sp.surface=!b;changeDimension(0,sp,!b);}
    else{pendingPortal={kind,to:2,x:100,y:49,z:0};changeDimension(2,[100.5,50,0.5]);}
    sfx.play('portal_travel');
  }
}
function portalAxisAt(x,y,z){for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const v=getV(x+dx,y+dy,z+dz);if((v&255)===B.NETHER_PORTAL)return (v>>8)&1;}return 0;}
function finishPortalArrival(){
  const pp=pendingPortal;pendingPortal=null;if(!pp)return;const p=player;
  if(pp.kind==='end'&&pp.to===2){ // obsidian landing platform
    for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){setV(pp.x+x,pp.y-1,pp.z+z,B.OBSIDIAN);for(let y=0;y<3;y++)setV(pp.x+x,pp.y+y,pp.z+z,0);}
    p.setPos(pp.x+0.5,pp.y,pp.z+0.5);bossBar.name='Ender Dragon';return;}
  if(pp.kind!=='nether')return;
  const radius=world.dim===1?16:128;
  // 1) known portals in this dimension
  let best=null,bd=1e18;
  for(const q of world.portals[world.dim]||[]){const d=(q.x-pp.x)**2+(q.z-pp.z)**2;if(d<radius*radius&&d<bd){const v=getV(q.x,q.y,q.z);if(v<0||(v&255)===B.NETHER_PORTAL){bd=d;best=q;}}}
  // 2) scan loaded area for portal blocks
  if(!best){for(let dx=-24;dx<=24&&!best;dx++)for(let dz=-24;dz<=24&&!best;dz++)for(let y=1;y<DIMS[world.dim].height-1;y++){const v=getV(pp.x+dx,y,pp.z+dz);if(v>0&&(v&255)===B.NETHER_PORTAL){best={x:pp.x+dx,y,z:pp.z+dz,axis:(v>>8)&1};break;}}}
  if(best){let y=best.y;while(getId(best.x,y-1,best.z)===B.NETHER_PORTAL)y--;p.setPos(best.x+0.5,y,best.z+0.5);registerPortal(world.dim,best.x,y,best.z,best.axis);return;}
  // 3) build a new portal at a safe spot
  const ax=pp.axis||0,[dx,dz]=ax?[0,1]:[1,0];
  let site=null;
  const H=DIMS[world.dim].height;
  for(let r=0;r<=12&&!site;r++)for(let ox=-r;ox<=r&&!site;ox++)for(let oz=-r;oz<=r&&!site;oz++){if(Math.max(Math.abs(ox),Math.abs(oz))!==r)continue;
    const x=pp.x+ox,z=pp.z+oz;
    for(let y=world.dim===1?100:Math.min(H-8,heightAt(x,z)+1);y>(world.dim===1?32:SEAm());y--){
      let ok=true;for(let i=-1;i<=2&&ok;i++){const bx=x+dx*i,bz=z+dz*i;if(!solidTop(getV(bx,y-1,bz)))ok=false;for(let j=0;j<4&&ok;j++){const v=getV(bx,y+j,bz);if(v<0||!(v===0||replaceable(v)&&!(FLAGS[v]&F_LIQUID)))ok=false;}}
      if(ok){site=[x,y,z];break;}}}
  if(!site){site=[pp.x,clamp(pp.y,world.dim===1?40:70,world.dim===1?100:200),pp.z];
    for(let i=-2;i<=3;i++)for(let k=-1;k<=1;k++){const bx=site[0]+dx*i+dz*k,bz=site[2]+dz*i+dx*k;setV(bx,site[1]-1,bz,B.OBSIDIAN);for(let j=0;j<4;j++)setV(bx,site[1]+j,bz,0);}}
  const [x,y,z]=site;
  for(let i=-1;i<=2;i++)for(let j=-1;j<=3;j++){const bx=x+dx*i,bz=z+dz*i;const edge=i===-1||i===2||j===-1||j===3;setV(bx,y+j,bz,edge?B.OBSIDIAN:V(B.NETHER_PORTAL,ax),SET_NO_CALLBACKS);}
  registerPortal(world.dim,x,y,z,ax);p.setPos(x+0.5,y,z+0.5);
}
const SEAm=()=>S.SEA-1;
