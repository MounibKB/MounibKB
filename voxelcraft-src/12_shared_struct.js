/* ---------------- structures: region-grid starts + reusable pieces ----------------
   A structure start is chosen per (spacing x spacing) chunk region; its plan is a list
   of pieces with bounding boxes. Each generated chunk places the parts of all pieces
   that intersect it, so structures seamlessly cross chunk borders. */
const LOOT={NONE:0,VILLAGE:1,DUNGEON:2,PYRAMID:3,MINESHAFT:4,RUINED_PORTAL:5,STRONGHOLD:6,FORTRESS:7};
const SPAWNER_MOBS=['zombie','skeleton','spider','blaze'];
const chestV=(facing,loot)=>V(B.CHEST,(facing&3)|(loot<<2));
function box3(put,x0,y0,z0,x1,y1,z1,v,mode=1){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)put(x,y,z,v,mode);}
function hollow(put,x0,y0,z0,x1,y1,z1,wall,inside=0){for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++){
  const edge=x===x0||x===x1||y===y0||y===y1||z===z0||z===z1;put(x,y,z,edge?(typeof wall==='function'?wall(x,y,z):wall):inside,1);}}
const piece=(x0,y0,z0,x1,y1,z1,place)=>({bb:[x0,y0,z0,x1,y1,z1],place});
// position hash in [0,1): use inside place() closures (they run once per intersected chunk, so they must not consume a shared RNG)
const hr=(x,y,z,salt)=>hash(x,y,z,salt|0)/4294967296;

function houseP(x,z,y,f,r){ // small village house, door facing f
  const w=2,d=2;return piece(x-w-1,y-4,z-d-1,x+w+1,y+7,z+d+1,put=>{
    for(let xx=x-w;xx<=x+w;xx++)for(let zz=z-d;zz<=z+d;zz++)for(let yy=y-4;yy<y;yy++)put(xx,yy,zz,B.COBBLESTONE,0);
    box3(put,x-w,y,z-d,x+w,y,z+d,B.COBBLESTONE);
    for(let yy=y+1;yy<=y+3;yy++)for(let xx=x-w;xx<=x+w;xx++)for(let zz=z-d;zz<=z+d;zz++){
      const ex=xx===x-w||xx===x+w,ez=zz===z-d||zz===z+d;
      put(xx,yy,zz,ex&&ez?B.OAK_LOG:(ex||ez?(yy===y+2&&(xx===x||zz===z)?B.GLASS_PANE:B.OAK_PLANKS):0),1);}
    for(let k=0;k<=2;k++)box3(put,x-w-1+k,y+4+k,z-d-1+k,x+w+1-k,y+4+k,z+d+1-k,k===2?V(B.OAK_SLAB,0):B.OAK_PLANKS);
    const [dx,dz]=HVEC[f];const doorx=x+dx*w,doorz=z+dz*d;
    put(doorx,y+1,doorz,V(B.OAK_DOOR,(f+2)&3),1);put(doorx,y+2,doorz,V(B.OAK_DOOR,((f+2)&3)|8),1);
    put(doorx+dx,y,doorz+dz,V(B.COBBLESTONE_STAIRS,(f+2)&3),1);put(doorx+dx,y+1,doorz+dz,0,1);put(doorx+dx,y+2,doorz+dz,0,1);
    put(x,y+3,z,V(B.TORCH,0),1);put(x,y+1,z,0,1);
    if(r<0.5)put(x-dx*(w-1)+(dz?1:0),y+1,z-dz*(d-1)+(dx?1:0),chestV(f,LOOT.VILLAGE),1);
    else put(x-dx*(w-1),y+1,z-dz*(d-1),B.CRAFTING_TABLE,1);
  });
}
function farmP(x,z,y){return piece(x-3,y-1,z-4,x+3,y+1,z+4,put=>{
  for(let xx=x-3;xx<=x+3;xx++)for(let zz=z-4;zz<=z+4;zz++){const edge=xx===x-3||xx===x+3||zz===z-4||zz===z+4;
    put(xx,y-1,zz,B.DIRT,1);
    if(edge)put(xx,y,zz,B.OAK_LOG,1);else if(xx===x)put(xx,y,zz,B.WATER,1);else{put(xx,y,zz,V(B.FARMLAND,7),1);put(xx,y+1,zz,V(B.WHEAT,(Math.abs(xx*7+zz*13))%8),1);}}});}
function pathP(x0,z0,x1,z1,column){const xa=Math.min(x0,x1),xb=Math.max(x0,x1),za=Math.min(z0,z1),zb=Math.max(z0,z1);
  return piece(xa-1,0,za-1,xb+1,255,zb+1,put=>{for(let x=xa;x<=xb;x++)for(let z=za;z<=zb;z++){const h=column(x,z).h;put(x,h,z,B.GRAVEL,1);put(x,h+1,z,0,1);put(x,h+2,z,0,1);}});}
const STRUCTS=[
  {key:'village',dim:0,spacing:26,sep:8,salt:10387312,biomes:[3,10,11,6,7,16],plan(r,x,z,column){
    const y=column(x,z).h;if(y<=SEA)return null;const P=[];
    P.push(piece(x-2,y-3,z-2,x+2,y+4,z+2,put=>{box3(put,x-2,y-3,z-2,x+2,y,z+2,B.COBBLESTONE);box3(put,x-1,y-2,z-1,x+1,y,z+1,B.WATER);
      for(const [a,b] of [[-2,-2],[2,-2],[-2,2],[2,2]]){put(x+a,y+1,z+b,B.OAK_FENCE,1);put(x+a,y+2,z+b,B.OAK_FENCE,1);}box3(put,x-2,y+3,z-2,x+2,y+3,z+2,B.COBBLESTONE_SLAB);}));
    for(let f=0;f<4;f++){const [dx,dz]=HVEC[f];const L=14+((r()*8)|0);
      P.push(pathP(x+dx*3,z+dz*3,x+dx*L,z+dz*L,column));
      for(let k=6;k<L;k+=8){for(const side of [-1,1]){if(r()<0.25)continue;const sx=dz*side,sz=-dx*side;const hx=x+dx*k+sx*5,hz=z+dz*k+sz*5;
        const hy=column(hx,hz).h;if(hy<=SEA||Math.abs(hy-y)>6)continue;
        if(r()<0.2)P.push(farmP(hx,hz,hy));else{let fd=0;for(let q=0;q<4;q++)if(HVEC[q][0]===-sx&&HVEC[q][1]===-sz)fd=q;P.push(houseP(hx,hz,hy,fd,r()));}}}
      const lx=x+dx*(L-1)+dz*2,lz=z+dz*(L-1)-dx*2,ly=column(lx,lz).h;
      P.push(piece(lx,ly,lz,lx,ly+4,lz,put=>{put(lx,ly+1,lz,B.OAK_FENCE,1);put(lx,ly+2,lz,B.OAK_FENCE,1);put(lx,ly+3,lz,B.OAK_PLANKS,1);put(lx,ly+4,lz,B.TORCH,1);}));
    }
    return P;}},
  {key:'desert_pyramid',dim:0,spacing:32,sep:8,salt:14357617,biomes:[11],plan(r,x,z,column){
    const y=column(x,z).h;if(y<=SEA)return null;
    return [piece(x-10,y-14,z-10,x+10,y+11,z+10,put=>{
      for(let k=0;k<=10;k++)for(let xx=x-10+k;xx<=x+10-k;xx++)for(let zz=z-10+k;zz<=z+10-k;zz++){
        const edge=xx===x-10+k||xx===x+10-k||zz===z-10+k||zz===z+10-k;put(xx,y+k,zz,edge||k===0?B.SANDSTONE:0,1);}
      for(let xx=x-10;xx<=x+10;xx++)for(let zz=z-10;zz<=z+10;zz++)for(let yy=y-4;yy<y;yy++)put(xx,yy,zz,B.SANDSTONE,0);
      put(x,y+1,z-10,0,1);put(x,y+2,z-10,0,1);put(x,y+1,z-9,0,1);put(x,y+2,z-9,0,1);
      box3(put,x-3,y-13,z-3,x+3,y-1,z+3,B.SANDSTONE);box3(put,x-2,y-12,z-2,x+2,y-1,z+2,0);box3(put,x,y,z,x,y,z,V(B.ORANGE_TERRACOTTA));
      put(x,y-12,z,B.STONE_PRESSURE_PLATE,1);box3(put,x-1,y-14,z-1,x+1,y-14,z+1,B.TNT);
      put(x+2,y-12,z,chestV(3,LOOT.PYRAMID),1);put(x-2,y-12,z,chestV(1,LOOT.PYRAMID),1);put(x,y-12,z+2,chestV(0,LOOT.PYRAMID),1);put(x,y-12,z-2,chestV(2,LOOT.PYRAMID),1);
    })];}},
  {key:'igloo',dim:0,spacing:32,sep:8,salt:14357618,biomes:[7,8],plan(r,x,z,column){
    const y=column(x,z).h;if(y<=SEA)return null;
    return [piece(x-4,y,z-4,x+4,y+5,z+4,put=>{
      for(let xx=x-4;xx<=x+4;xx++)for(let zz=z-4;zz<=z+4;zz++)for(let yy=y+1;yy<=y+5;yy++){const d=Math.hypot(xx-x,(yy-y-1)*1.3,zz-z);
        if(d<=4.3&&d>=3.3)put(xx,yy,zz,B.SNOW_BLOCK,1);else if(d<3.3)put(xx,yy,zz,0,1);}
      put(x,y+1,z-4,0,1);put(x,y+2,z-4,0,1);put(x+1,y+1,z+1,V(B.BED,0),1);put(x+1,y+1,z,V(B.BED,4),1);put(x-2,y+1,z,B.FURNACE,1);put(x-2,y+1,z+1,B.CRAFTING_TABLE,1);put(x,y+3,z,B.TORCH,0);})];}},
  {key:'ruined_portal',dim:0,spacing:40,sep:15,salt:34222645,biomes:null,plan(r,x,z,column){
    const y=column(x,z).h;if(y<=SEA-3)return null;const f=r()<0.5;
    return [piece(x-4,y-1,z-4,x+4,y+6,z+4,put=>{
      for(let xx=x-3;xx<=x+3;xx++)for(let zz=z-3;zz<=z+3;zz++)if(hr(xx,y,zz,1)<0.7)put(xx,y,zz,hr(xx,y,zz,2)<0.5?B.NETHERRACK:B.MAGMA_BLOCK,1);
      for(let a=-1;a<=2;a++)for(let b=0;b<=4;b++){const edge=a===-1||a===2||b===0||b===4;if(!edge)continue;
        const px=f?x+a:x,pz=f?z:z+a;if(hr(px,b,pz,3)<0.75)put(px,y+b+1,pz,hr(px,b,pz,4)<0.2?B.CRYING_OBSIDIAN:B.OBSIDIAN,1);}
      put(x+2,y+1,z+2,chestV(0,LOOT.RUINED_PORTAL),1);})];}},
  {key:'dungeon',dim:0,spacing:5,sep:1,salt:10387313,biomes:null,underground:true,plan(r,x,z){
    if(r()<0.35)return null;const y=12+((r()*30)|0),mob=(r()*3)|0,second=r()<0.6;
    return [piece(x-4,y-1,z-4,x+4,y+4,z+4,put=>{
      hollow(put,x-4,y-1,z-4,x+4,y+4,z+4,(a,b,c)=>((a*7+b*3+c*11)&3)===0?B.MOSSY_COBBLESTONE:B.COBBLESTONE,0);
      put(x,y,z,V(B.SPAWNER,mob),1);put(x+3,y,z,chestV(3,LOOT.DUNGEON),1);if(second)put(x,y,z-3,chestV(2,LOOT.DUNGEON),1);})];}},
  {key:'mineshaft',dim:0,spacing:12,sep:4,salt:10387319,biomes:null,underground:true,plan(r,x,z){
    if(r()<0.4)return null;const P=[];let cxp=x,cyp=18+((r()*20)|0),czp=z,dir=(r()*4)|0;
    for(let s=0;s<10;s++){const len=6+((r()*10)|0),[dx,dz]=HVEC[dir];const x0=cxp,z0=czp,x1=cxp+dx*len,z1=czp+dz*len,yy=cyp;
      const ax=dz!==0,rng=mulberry32(hash(x0,z0,yy,5));
      P.push(piece(Math.min(x0,x1)-1,yy-1,Math.min(z0,z1)-1,Math.max(x0,x1)+1,yy+3,Math.max(z0,z1)+1,put=>{
        for(let k=0;k<=len;k++){const px=x0+dx*k,pz=z0+dz*k;
          for(let w=-1;w<=1;w++)for(let h=0;h<3;h++)put(px+(ax?w:0),yy+h,pz+(ax?0:w),0,1);
          for(let w=-1;w<=1;w++)put(px+(ax?w:0),yy-1,pz+(ax?0:w),B.OAK_PLANKS,0);
          if(k%4===0){for(const w of [-1,1]){put(px+(ax?w:0),yy,pz+(ax?0:w),B.OAK_FENCE,1);put(px+(ax?w:0),yy+1,pz+(ax?0:w),B.OAK_FENCE,1);}
            for(let w=-1;w<=1;w++)put(px+(ax?w:0),yy+2,pz+(ax?0:w),B.OAK_PLANKS,1);}
          else put(px,yy,pz,V(B.RAIL,ax?0:1),1);
          if(rng()<0.04)put(px+(ax?1:0),yy+2,pz+(ax?0:1),B.COBWEB,1);
          if(rng()<0.015)put(px+(ax?-1:0),yy,pz+(ax?0:-1),chestV(0,LOOT.MINESHAFT),1);
          if(k%8===4&&rng()<0.5)put(px,yy+2,pz,V(B.TORCH,0),0);}}));
      cxp=x1;czp=z1;if(r()<0.5)dir=(dir+(r()<0.5?1:3))&3;if(Math.abs(cxp-x)>60||Math.abs(czp-z)>60)break;}
    return P;}},
  {key:'fortress',dim:1,spacing:27,sep:4,salt:30084232,biomes:null,plan(r,x,z){
    const y=64,P=[];
    P.push(piece(x-5,y-1,z-5,x+5,y+6,z+5,put=>{hollow(put,x-5,y-1,z-5,x+5,y+6,z+5,B.NETHER_BRICKS,0);
      put(x,y,z,V(B.SPAWNER,3),1);put(x+3,y,z+3,chestV(0,LOOT.FORTRESS),1);
      for(let f=0;f<4;f++){const [dx,dz]=HVEC[f];for(let w=-1;w<=1;w++)for(let h=0;h<3;h++)put(x+dx*5+(dz?w:0),y+h,z+dz*5+(dx?w:0),0,1);}}));
    for(let f=0;f<4;f++){const [dx,dz]=HVEC[f],L=20+((r()*15)|0);
      P.push(piece(Math.min(x,x+dx*L)-3,0,Math.min(z,z+dz*L)-3,Math.max(x,x+dx*L)+3,y+4,Math.max(z,z+dz*L)+3,put=>{
        for(let k=6;k<=L;k++){const px=x+dx*k,pz=z+dz*k;
          for(let w=-2;w<=2;w++){const qx=px+(dz?w:0),qz=pz+(dx?w:0);put(qx,y-1,qz,B.NETHER_BRICKS,1);
            if(Math.abs(w)===2){put(qx,y,qz,B.NETHER_BRICKS,1);}else{put(qx,y,qz,0,1);put(qx,y+1,qz,0,1);put(qx,y+2,qz,0,1);}}
          if(k%7===0)for(let yy=y-2;yy>5;yy--)for(let w of [-1,1])put(px+(dz?w:0),yy,pz+(dx?w:0),B.NETHER_BRICKS,0);}}));}
    return P;}},
];
function strongholds(seed){ // deterministic positions (block coords), MC-like rings
  const r=mulberry32(hash(seed,1,2,3)),out=[];const a0=r()*Math.PI*2;
  for(let i=0;i<3;i++){const a=a0+i*Math.PI*2/3,d=700+r()*500;out.push({x:Math.round(Math.cos(a)*d),z:Math.round(Math.sin(a)*d),y:28});}
  for(let i=0;i<6;i++){const a=a0+0.4+i*Math.PI/3,d=2000+r()*700;out.push({x:Math.round(Math.cos(a)*d),z:Math.round(Math.sin(a)*d),y:28});}
  return out;
}
function strongholdPlan(sh,seed){
  const {x,z,y}=sh,r=mulberry32(hash(seed,x,z,44)),P=[];
  // portal room
  P.push(piece(x-6,y-1,z-8,x+6,y+7,z+8,put=>{
    hollow(put,x-6,y-1,z-8,x+6,y+7,z+8,B.STONE_BRICKS,0);
    box3(put,x-2,y-1,z-2,x+2,y-1,z+2,B.LAVA);
    const eye=(a,b)=>hr(x+a,y,z+b,9)<0.1?4:0;
    for(let a=-2;a<=2;a++){put(x+a,y,z-2,V(B.END_PORTAL_FRAME,2|eye(a,-2)),1);put(x+a,y,z+2,V(B.END_PORTAL_FRAME,0|eye(a,2)),1);
      put(x-2,y,z+a,V(B.END_PORTAL_FRAME,1|eye(-2,a)),1);put(x+2,y,z+a,V(B.END_PORTAL_FRAME,3|eye(2,a)),1);}
    for(const c of [[-2,-2],[2,-2],[-2,2],[2,2]])put(x+c[0],y,z+c[1],B.STONE_BRICKS,1);
    box3(put,x-1,y,z-1,x+1,y,z+1,0);
    for(let k=3;k<=6;k++)put(x,y+k-3,z+k,V(B.STONE_BRICK_STAIRS,0),1);
    put(x+5,y+2,z-7,V(B.TORCH,3),1);put(x-5,y+2,z-7,V(B.TORCH,1),1);put(x+5,y+2,z+7,V(B.TORCH,3),1);put(x-5,y+2,z+7,V(B.TORCH,1),1);
    for(let a=-1;a<=1;a++)for(let h=0;h<3;h++){put(x+a,y+h,z-8,0,1);put(x+a,y+h,z+8,0,1);}}));
  // library + corridors
  for(let f=0;f<4;f++){const [dx,dz]=HVEC[f],L=18+((r()*12)|0),sx=x+dx*(f%2?7:9),sz=z+dz*(f%2?7:9);
    P.push(piece(Math.min(sx,sx+dx*L)-2,y-1,Math.min(sz,sz+dz*L)-2,Math.max(sx,sx+dx*L)+2,y+4,Math.max(sz,sz+dz*L)+2,put=>{
      for(let k=0;k<=L;k++){const px=sx+dx*k,pz=sz+dz*k;
        for(let w=-2;w<=2;w++)for(let h=-1;h<=4;h++){const qx=px+(dz?w:0),qz=pz+(dx?w:0);const edge=Math.abs(w)===2||h===-1||h===4;
          put(qx,y+h,qz,edge?(((qx+h*3+qz)&7)===0?B.MOSSY_COBBLESTONE:B.STONE_BRICKS):0,1);}
        if(k%6===3)put(px+(dz?1:0),y+2,pz+(dx?1:0),V(B.TORCH,0),0);}
      if(f===1){const lx=sx+dx*L,lz=sz+dz*L;hollow(put,lx-4,y-1,lz-4,lx+4,y+5,lz+4,B.OAK_PLANKS,0);
        for(let a=-3;a<=3;a++)for(let h=0;h<4;h++){put(lx+a,y+h,lz-3,B.BOOKSHELF,1);put(lx+a,y+h,lz+3,B.BOOKSHELF,1);}
        put(lx,y,lz,chestV(0,LOOT.STRONGHOLD),1);put(lx,y+3,lz,V(B.TORCH,0),1);}}));}
  return P;
}
const planCache=new Map();
function structStart(st,seed,rx,rz){
  const r=mulberry32(hash(seed+st.salt,rx,rz,st.salt));
  const cx=rx*st.spacing+((r()*(st.spacing-st.sep))|0),cz=rz*st.spacing+((r()*(st.spacing-st.sep))|0);
  return {cx,cz,r};
}
function placeStructures(seed,dim,cx,cz,data,column){
  const X0=cx*16,Z0=cz*16;
  const put=(x,y,z,v,mode)=>{const lx=x-X0,lz=z-Z0;if(lx<0||lx>15||lz<0||lz>15||y<1||y>254)return;
    const idx=(lx*16+lz)*256+y,cur=data[idx];if(cur===B.BEDROCK)return;
    if(mode===1||cur===0||(FLAGS[cur]&F_REPL))data[idx]=v;};
  const run=(key,plan)=>{let P=planCache.get(key);if(P===undefined){P=plan()||[];planCache.set(key,P);if(planCache.size>400)planCache.delete(planCache.keys().next().value);}
    for(const p of P){const b=p.bb;if(b[3]<X0||b[0]>X0+15||b[5]<Z0||b[2]>Z0+15)continue;p.place(put);}};
  for(const st of STRUCTS){
    if(st.dim!==dim)continue;
    const rx0=Math.floor((cx-6)/st.spacing),rx1=Math.floor((cx+6)/st.spacing),rz0=Math.floor((cz-6)/st.spacing),rz1=Math.floor((cz+6)/st.spacing);
    for(let rx=rx0;rx<=rx1;rx++)for(let rz=rz0;rz<=rz1;rz++){
      const s=structStart(st,seed,rx,rz);if(Math.abs(s.cx-cx)>6||Math.abs(s.cz-cz)>6)continue;
      const bx0=s.cx*16+8,bz0=s.cz*16+8;
      run(st.key+':'+seed+':'+rx+','+rz,()=>{
        if(st.biomes&&column&&!st.biomes.includes(column(bx0,bz0).b))return null;
        if(!st.underground&&column){const c=column(bx0,bz0);if(c.river||c.entrance)return null;}
        return st.plan(s.r,bx0,bz0,column);});
    }
  }
  if(dim===0)for(const sh of strongholds(seed)){if(Math.abs(Math.floor(sh.x/16)-cx)>4||Math.abs(Math.floor(sh.z/16)-cz)>4)continue;
    run('sh:'+seed+':'+sh.x+','+sh.z,()=>strongholdPlan(sh,seed));}
}
function locateStructure(seed,dim,key,x,z,column){ // nearest start of a structure type (block coords) or null
  if(key==='stronghold'){let best=null,bd=1e18;for(const s of strongholds(seed)){const d=(s.x-x)**2+(s.z-z)**2;if(d<bd){bd=d;best=s;}}return best;}
  const st=STRUCTS.find(s=>s.key===key&&s.dim===dim);if(!st)return null;
  const rcx=Math.floor(Math.floor(x/16)/st.spacing),rcz=Math.floor(Math.floor(z/16)/st.spacing);let best=null,bd=1e18;
  for(let r=0;r<=12;r++){for(let rx=rcx-r;rx<=rcx+r;rx++)for(let rz=rcz-r;rz<=rcz+r;rz++){if(Math.max(Math.abs(rx-rcx),Math.abs(rz-rcz))!==r)continue;
    const s=structStart(st,seed,rx,rz),bx0=s.cx*16+8,bz0=s.cz*16+8;if(st.biomes&&column&&!st.biomes.includes(column(bx0,bz0).b))continue;
    const d=(bx0-x)**2+(bz0-z)**2;if(d<bd){bd=d;best={x:bx0,z:bz0};}}if(best)return best;}
  return null;
}
