/* =====================================================================
   MESH WORKER: world generation cache, BFS lighting, meshing (greedy cubes,
   boxes, plants, fluids, wire, connected blocks), 2x LOD meshes.
   Vertex = uvec4 (16 bytes):
     w0 = x16 | y16<<9 | z16<<22            (positions in 1/16 block, chunk-local)
     w1 = layer | sky<<8 | blk<<12 | ao<<16 | face<<18 | anim<<21
     w2 = u16 | v16<<13                     (texture coords in 1/16 texel-tiles)
     w3 = r | g<<8 | b<<16                  (tint)
   ===================================================================== */
function WORKER(S){
'use strict';
const {B,DEF,FLAGS,LIGHT,FILTER,MODEL,TEXV,UVROT,TINT,F_OPAQUE,F_SOLID,F_CUBE,F_SELFCULL,F_AO,F_LIQUID,F_TRANS,BIOMES,HVEC,FIXED_TINT}=S;
let gen=null,dim=0,seed=0,epoch=0,hasSky=true;
let edits=new Map();const cache=new Map();
let ccx=0,ccz=0,keepR=14;
const M=14,GX=44,GZ=44,GY=258,SXF=GZ*GY,SZF=GY;
const grid=new Uint16Array(GX*GZ*GY),sky=new Uint8Array(GX*GZ*GY),blk=new Uint8Array(GX*GZ*GY);
const tops=new Int16Array(GX*GZ);
const QCAP=1<<21,QM=QCAP-1,queue=new Int32Array(QCAP);
const LGX=10,LGZ=10,LGY=130;
const lgrid=new Uint16Array(LGX*LGZ*LGY),lsky=new Uint8Array(LGX*LGZ*LGY),lblk=new Uint8Array(LGX*LGZ*LGY);
const lhalf=new Uint8Array(LGX*LGZ*LGY),ltops=new Int16Array(LGX*LGZ);
const maskA=new Int32Array(4096),maskB=new Int32Array(4096),maskC=new Int32Array(4096);
const cAO=new Int32Array(4),cSky=new Int32Array(4),cBlk=new Int32Array(4);
const tintG=new Uint8Array(18*18*3),tintF=new Uint8Array(18*18*3);
let oBuf=new Uint32Array(1<<18),oLen=0,tBuf=new Uint32Array(1<<16),tLen=0;
let minY=4096,maxY=0;
let G,GS,GB,BASE,STR,NX,NZ,SCALE,SKIRT=false;
const FD=[0,0,1,1,2,2],FS=[-1,1,-1,1,-1,1];
const FU=FD.map(d=>(d+1)%3),FV=FD.map(d=>(d+2)%3);
const QU=[-1,1,1,-1],QV=[-1,-1,1,1];
const ORD_P=[0,1,2,3],ORD_N=[0,3,2,1];
const px=new Float64Array(12),puv=new Float64Array(8),pao=new Int32Array(4),psk=new Int32Array(4),pbl=new Int32Array(4);

function getChunk(cx,cz){
  const k=S.ckey(cx,cz);let c=cache.get(k);
  if(!c){const g=gen.generate(cx,cz);const e=edits.get(k);if(e)for(const [idx,v] of e)g.data[idx]=v;c=g;cache.set(k,c);}
  return c;
}
function push4(t,w0,w1,w2,w3){
  if(t===0){if(oLen+4>oBuf.length){const n=new Uint32Array(oBuf.length*2);n.set(oBuf);oBuf=n;}oBuf[oLen++]=w0;oBuf[oLen++]=w1;oBuf[oLen++]=w2;oBuf[oLen++]=w3;}
  else{if(tLen+4>tBuf.length){const n=new Uint32Array(tBuf.length*2);n.set(tBuf);tBuf=n;}tBuf[tLen++]=w0;tBuf[tLen++]=w1;tBuf[tLen++]=w2;tBuf[tLen++]=w3;}
}
// emit one quad from scratch arrays px (4 xyz in 1/16), puv, pao, psk, pbl; vertices already CCW from outside
function emit(t,f,layer,anim,rgb,flip){
  const o=flip?1:0;
  for(let j=0;j<4;j++){
    const k=(j+o)&3;
    const x=Math.round(px[k*3]),y=Math.round(px[k*3+1]),z=Math.round(px[k*3+2]);
    if(y<minY)minY=y;if(y>maxY)maxY=y;
    let u=Math.round(puv[k*2]),v=Math.round(puv[k*2+1]);if(u<0)u=0;if(v<0)v=0;if(u>8191)u=8191;if(v>8191)v=8191;
    push4(t,(x|(y<<9)|(z<<22))>>>0,layer|(psk[k]<<8)|(pbl[k]<<12)|(pao[k]<<16)|(f<<18)|(anim<<21),(u|(v<<13))>>>0,rgb);
  }
}
// world-aligned texture coordinates for an axis-aligned face (positions in 1/16), with optional 90deg rotations
function faceUV(d,x,y,z,rot,out,i){
  let u,v;
  if(d===0){u=z;v=4096-y;}else if(d===1){u=x;v=z;}else{u=x;v=4096-y;}
  if(rot===1){const t=u;u=v;v=4096-t;}else if(rot===2){u=4096-u;v=4096-v;}else if(rot===3){const t=u;u=4096-v;v=t;}
  out[i]=u;out[i+1]=v;
}
function corners(ni,su,sv){
  for(let k=0;k<4;k++){
    const du=QU[k]*su,dv=QV[k]*sv,s1=ni+du,s2=ni+dv,c=s1+dv;
    const b1=G[s1],b2=G[s2],b3=G[c],f1=FLAGS[b1],f2=FLAGS[b2],f3=FLAGS[b3];
    const o1=f1&F_AO?1:0,o2=f2&F_AO?1:0,o3=f3&F_AO?1:0;
    cAO[k]=(o1&&o2)?0:3-o1-o2-o3;
    let ss=GS[ni],bs=GB[ni],n=1;
    const p1=!(f1&F_OPAQUE),p2=!(f2&F_OPAQUE);
    if(p1){ss+=GS[s1];bs+=GB[s1];n++;}
    if(p2){ss+=GS[s2];bs+=GB[s2];n++;}
    if((p1||p2)&&!(f3&F_OPAQUE)){ss+=GS[c];bs+=GB[c];n++;}
    cSky[k]=(ss/n+0.5)|0;cBlk[k]=(bs/n+0.5)|0;
  }
}
function tintFor(v,x,z,f){
  const tk=TINT[v];
  if(!tk){const d=DEF[v&255];if(d&&d.tintTop&&f===3)return colAt(tintG,x,z);return 0xffffff;}
  if(tk===1)return colAt(tintG,x,z);if(tk===2)return colAt(tintF,x,z);
  if(tk===5){const c=S.redstoneColor((v>>8)&15);return c[0]|(c[1]<<8)|(c[2]<<16);}
  const c=FIXED_TINT[tk];return c?c[0]|(c[1]<<8)|(c[2]<<16):0xffffff;
}
function colAt(arr,x,z){const cx=Math.max(-1,Math.min(16,x)),cz=Math.max(-1,Math.min(16,z)),i=((cx+1)*18+(cz+1))*3;return arr[i]|(arr[i+1]<<8)|(arr[i+2]<<16);}
function buildTints(ch){ // 5x5 blended biome colors for columns -1..16
  const bioAt=(x,z)=>{const ncx=x<0?0:(x<16?1:2),ncz=z<0?0:(z<16?1:2);const c=ch[ncz*3+ncx];return c.biomes[((x-(ncx-1)*16)*16)+(z-(ncz-1)*16)];};
  for(let x=-1;x<=16;x++)for(let z=-1;z<=16;z++){let gr=0,gg=0,gb=0,fr=0,fg=0,fb=0,n=0;
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const bb=BIOMES[bioAt(Math.max(-14,Math.min(29,x+dx)),Math.max(-14,Math.min(29,z+dz)))]||BIOMES[3];
      gr+=bb.grass[0];gg+=bb.grass[1];gb+=bb.grass[2];fr+=bb.foliage[0];fg+=bb.foliage[1];fb+=bb.foliage[2];n++;}
    const i=((x+1)*18+(z+1))*3;tintG[i]=gr/n;tintG[i+1]=gg/n;tintG[i+2]=gb/n;tintF[i]=fr/n;tintF[i+1]=fg/n;tintF[i+2]=fb/n;}
}
/* ---------- greedy cube meshing ---------- */
function greedy(H){
  const dims=[NX,H,NZ];
  for(let f=0;f<6;f++){
    const d=FD[f],u=FU[f],v=FV[f],s=FS[f];
    const sd=STR[d],su=STR[u],sv=STR[v],nd=dims[d],nu=dims[u],nv=dims[v],noff=s*sd,edgeI=s<0?0:nd-1;
    const cc=[0,0,0];
    for(let i=0;i<nd;i++){
      let n=0,any=false;const bi=BASE+i*sd;cc[d]=i;
      for(let b=0;b<nv;b++){
        let ci=bi+b*sv;cc[v]=b;
        for(let a=0;a<nu;a++,ci+=su,n++){
          const id=G[ci],fl=FLAGS[id];
          if(!(fl&F_CUBE)){maskA[n]=0;continue;}
          const nb=G[ci+noff],nf=FLAGS[nb];
          if((nf&F_OPAQUE)||(nb===id&&(fl&F_SELFCULL))||((nf&F_CUBE)&&(fl&F_TRANS)&&(nf&F_TRANS)&&(nb&255)===(id&255))){
            if(!(SKIRT&&d!==1&&i===edgeI&&(d===0?a:b)>=ltops[((d===0?i:a)+1)*LGZ+(d===0?b:i)+1]-2)){maskA[n]=0;continue;}
          }
          corners(ci+noff,su,sv);
          cc[u]=a;
          maskA[n]=0x40000000|TEXV[id*6+f]|((cAO[0]|(cAO[1]<<2)|(cAO[2]<<4)|(cAO[3]<<6))<<8)|(UVROT[id*6+f]<<16)|((fl&F_TRANS)?1<<18:0);
          maskB[n]=(cSky[0]|(cSky[1]<<4)|(cSky[2]<<8)|(cSky[3]<<12))|((cBlk[0]|(cBlk[1]<<4)|(cBlk[2]<<8)|(cBlk[3]<<12))<<16);
          maskC[n]=tintFor(id,SCALE===1?cc[0]:cc[0]*2,SCALE===1?cc[2]:cc[2]*2,f);
          any=true;
        }
      }
      if(!any)continue;
      const pd=s>0?i+1:i;
      n=0;
      for(let b=0;b<nv;b++){
        for(let a=0;a<nu;){
          const ma=maskA[n];
          if(ma===0){a++;n++;continue;}
          const mb=maskB[n],mc=maskC[n];
          let w=1;while(a+w<nu&&maskA[n+w]===ma&&maskB[n+w]===mb&&maskC[n+w]===mc)w++;
          let h=1;
          outer:for(;b+h<nv;h++){const r=n+h*nu;for(let k=0;k<w;k++)if(maskA[r+k]!==ma||maskB[r+k]!==mb||maskC[r+k]!==mc)break outer;}
          for(let k=0;k<4;k++){cAO[k]=(ma>>(8+2*k))&3;cSky[k]=(mb>>(4*k))&15;cBlk[k]=(mb>>(16+4*k))&15;}
          const ord=s>0?ORD_P:ORD_N,rot=(ma>>16)&3,tgt=(ma>>18)&1;
          const pos=[0,0,0];
          for(let j=0;j<4;j++){const k=ord[j];
            pos[d]=pd*16*SCALE;pos[u]=(QU[k]<0?a:a+w)*16*SCALE;pos[v]=(QV[k]<0?b:b+h)*16*SCALE;
            px[j*3]=pos[0];px[j*3+1]=pos[1];px[j*3+2]=pos[2];faceUV(d,pos[0],pos[1],pos[2],rot,puv,j*2);
            pao[j]=cAO[k];psk[j]=cSky[k];pbl[j]=cBlk[k];}
          const e0=pao[0]*32+psk[0]+pbl[0],e1=pao[1]*32+psk[1]+pbl[1],e2=pao[2]*32+psk[2]+pbl[2],e3=pao[3]*32+psk[3]+pbl[3];
          emit(tgt,f,ma&255,0,mc,e0+e2<e1+e3);
          for(let hh=0;hh<h;hh++){const r=n+hh*nu;for(let k=0;k<w;k++)maskA[r+k]=0;}
          a+=w;n+=w;
        }
      }
    }
  }
}
/* ---------- box models ---------- */
const nbFn=(ci)=>(dx,dy,dz)=>G[ci+dx*STR[0]+dy+dz*STR[2]];
function emitBoxes(boxes,ci,x,y,z,v){
  const ownS=GS[ci],ownB=GB[ci],trans=(FLAGS[v]&F_TRANS)?1:0,anim=DEF[v&255].anim||0;
  for(const bo of boxes){
    const b=bo.b;
    for(let f=0;f<6;f++){
      const d=FD[f],s=FS[f],u=FU[f],vv=FV[f];
      if(bo.nosides){const ex=[b[3]-b[0],b[4]-b[1],b[5]-b[2]];const th=ex[0]<=ex[1]&&ex[0]<=ex[2]?0:(ex[1]<=ex[2]?1:2);if(d!==th)continue;}
      const onEdge=s<0?b[d]===0:b[d+3]===16;
      let ls=ownS,lb=ownB;
      if(onEdge){const nb=G[ci+s*STR[d]];if(FLAGS[nb]&F_OPAQUE)continue;ls=Math.max(ls,GS[ci+s*STR[d]]);lb=Math.max(lb,GB[ci+s*STR[d]]);}
      if(b[u]===b[u+3]||b[vv]===b[vv+3])continue; // zero-area face
      const tn=Array.isArray(bo.t)?bo.t[f]:bo.t;const layer=S.T[tn]!==undefined?S.T[tn]:S.T.white;
      const ord=s>0?ORD_P:ORD_N,rot=bo.rot?bo.rot[f]:0,uvr=bo.uv?bo.uv[f]:null;
      const base=[x*16,y*16,z*16];
      for(let j=0;j<4;j++){const k=ord[j];
        const p=[0,0,0];p[d]=base[d]+(s>0?b[d+3]:b[d]);p[u]=base[u]+(QU[k]<0?b[u]:b[u+3]);p[vv]=base[vv]+(QV[k]<0?b[vv]:b[vv+3]);
        px[j*3]=p[0];px[j*3+1]=p[1];px[j*3+2]=p[2];
        if(uvr){ // explicit uv rect [u0,v0,u1,v1]: texture-u follows the horizontal axis, texture-v runs top->bottom
          let hi,lo;
          if(d===0){hi=QV[k]>0;lo=QU[k]>0;puv[j*2]=hi?uvr[2]:uvr[0];puv[j*2+1]=lo?uvr[1]:uvr[3];}
          else if(d===1){hi=QV[k]>0;lo=QU[k]>0;puv[j*2]=hi?uvr[2]:uvr[0];puv[j*2+1]=lo?uvr[3]:uvr[1];}
          else{hi=QU[k]>0;lo=QV[k]>0;puv[j*2]=hi?uvr[2]:uvr[0];puv[j*2+1]=lo?uvr[1]:uvr[3];}
        } else faceUV(d,p[0],p[1],p[2],rot,puv,j*2);
        pao[j]=3;psk[j]=ls;pbl[j]=lb;}
      emit(trans,f,layer,anim,tintFor(v,x,z,f),false);
    }
  }
}
// double-sided plane quads for plants: pts = 4 corners (x,y,z in 1/16 world-local) CCW, uvs
function plane(t,layer,anim,rgb,ls,lb,p,uv){
  for(let side=0;side<2;side++){
    for(let j=0;j<4;j++){const k=side?3-j:j;px[j*3]=p[k*3];px[j*3+1]=p[k*3+1];px[j*3+2]=p[k*3+2];puv[j*2]=uv[k*2];puv[j*2+1]=uv[k*2+1];pao[j]=3;psk[j]=ls;pbl[j]=lb;}
    emit(t,6,layer,anim,rgb,false);
  }
}
function emitPlant(model,ci,x,y,z,v){
  const layer=TEXV[v*6+1],ls=GS[ci],lb=GB[ci],rgb=tintFor(v,x,z,1),anim=DEF[v&255].anim||0;
  const X=x*16,Y=y*16,Z=z*16,H=16;
  const uvq=[0,16,16,16,16,0,0,0];
  if(model===2){ // cross
    plane(0,layer,anim,rgb,ls,lb,[X+1,Y,Z+1, X+15,Y,Z+15, X+15,Y+H,Z+15, X+1,Y+H,Z+1],uvq);
    plane(0,layer,anim,rgb,ls,lb,[X+15,Y,Z+1, X+1,Y,Z+15, X+1,Y+H,Z+15, X+15,Y+H,Z+1],uvq);
  } else { // crop '#'
    for(const o of [4,12]){plane(0,layer,anim,rgb,ls,lb,[X+o,Y,Z, X+o,Y,Z+16, X+o,Y+H,Z+16, X+o,Y+H,Z],uvq);
      plane(0,layer,anim,rgb,ls,lb,[X,Y,Z+o, X+16,Y,Z+o, X+16,Y+H,Z+o, X,Y+H,Z+o],uvq);}
  }
}
function emitWire(ci,x,y,z,v){
  const m=S.wireConn(nbFn(ci)),ls=GS[ci],lb=GB[ci],rgb=tintFor(v,x,z,3);
  const X=x*16,Y=y*16+1,Z=z*16;
  const top=(p,uv,layer)=>{for(let j=0;j<4;j++){px[j*3]=p[j*3];px[j*3+1]=p[j*3+1];px[j*3+2]=p[j*3+2];puv[j*2]=uv[j*2];puv[j*2+1]=uv[j*2+1];pao[j]=3;psk[j]=ls;pbl[j]=lb;}emit(0,3,layer,0,rgb,false);};
  const DOT=S.T.redstone_dust_dot,LINE=S.T.redstone_dust_line;
  // top face CCW from above: (x0,z1)->(x1,z1)->(x1,z0)->(x0,z0) ; uv v grows with z
  top([X,Y,Z+16, X+16,Y,Z+16, X+16,Y,Z, X,Y,Z],[0,16,16,16,16,0,0,0],DOT);
  const arm=[[X,Z,X+16,Z+8],[X+8,Z,X+16,Z+16],[X,Z+8,X+16,Z+16],[X,Z,X+8,Z+16]];
  for(let h=0;h<4;h++){if(!(m&(1<<h)))continue;const [x0,z0,x1,z1]=arm[h];const rotd=(h===1||h===3);
    const uv=rotd?[z1-Z,x0-X,z1-Z,x1-X,z0-Z,x1-X,z0-Z,x0-X]:[x0-X,z1-Z,x1-X,z1-Z,x1-X,z0-Z,x0-X,z0-Z];
    top([x0,Y,z1, x1,Y,z1, x1,Y,z0, x0,Y,z0],uv,LINE);
    if(m&(16<<h)){ // climbing the neighbouring block's face
      const [dx,dz]=HVEC[h];const wx=X+8+dx*7,wz=Z+8+dz*7;const a=[dz!==0?X:wx,dz!==0?wz:Z],b=[dz!==0?X+16:wx,dz!==0?wz:Z+16];
      plane(0,LINE,0,rgb,ls,lb,[a[0],Y,a[1], b[0],Y,b[1], b[0],Y+16,b[1], a[0],Y+16,a[1]],[0,16,16,16,16,0,0,0]);}
  }
}
function emitVine(ci,x,y,z,v){
  const s=v>>8,ls=GS[ci],lb=GB[ci],rgb=tintFor(v,x,z,1),layer=TEXV[v*6+1],X=x*16,Y=y*16,Z=z*16;
  const uvq=[0,16,16,16,16,0,0,0];
  if(s&1)plane(0,layer,0,rgb,ls,lb,[X,Y,Z+1, X+16,Y,Z+1, X+16,Y+16,Z+1, X,Y+16,Z+1],uvq);
  if(s&2)plane(0,layer,0,rgb,ls,lb,[X+15,Y,Z, X+15,Y,Z+16, X+15,Y+16,Z+16, X+15,Y+16,Z],uvq);
  if(s&4)plane(0,layer,0,rgb,ls,lb,[X,Y,Z+15, X+16,Y,Z+15, X+16,Y+16,Z+15, X,Y+16,Z+15],uvq);
  if(s&8)plane(0,layer,0,rgb,ls,lb,[X+1,Y,Z, X+1,Y,Z+16, X+1,Y+16,Z+16, X+1,Y+16,Z],uvq);
  if(!(s&15))plane(0,layer,0,rgb,ls,lb,[X,Y+15,Z, X+16,Y+15,Z, X+16,Y+15,Z+16, X,Y+15,Z+16],uvq);
}
/* ---------- fluids ---------- */
const HL=[14,12,11,9,7,5,4,2];
function fluidH(ci,id){ // height (1/16) of a same-fluid cell, 16 if the fluid continues above
  const v=G[ci];if((G[ci+1]&255)===id)return 16;const s=v>>8;if(s&8)return 14;return HL[s&7];
}
function cornerH(ci,id,cxo,czo){
  let sum=0,cnt=0;
  for(let dx=cxo-1;dx<=cxo;dx++)for(let dz=czo-1;dz<=czo;dz++){
    const n=ci+dx*STR[0]+dz*STR[2],nv=G[n];
    if((nv&255)===id){if((G[n+1]&255)===id)return 16;sum+=fluidH(n,id);cnt++;}
    else if(!(FLAGS[nv]&F_SOLID)){cnt++;}
  }
  return cnt?sum/cnt:fluidH(ci,id);
}
function emitFluid(ci,x,y,z,v){
  const id=v&255,t=id===B.WATER?1:0,anim=id===B.WATER?1:2,layer=TEXV[v*6+3],rgb=0xffffff;
  const above=G[ci+1],full=(above&255)===id;
  let h00,h10,h11,h01;
  if(SCALE===2){const hh=full?16:(lhalf[ci]?7:14);h00=h10=h11=h01=hh*2;}
  else if(full){h00=h10=h11=h01=16;}
  else{h00=cornerH(ci,id,0,0);h10=cornerH(ci,id,1,0);h11=cornerH(ci,id,1,1);h01=cornerH(ci,id,0,1);}
  const S16=16*SCALE,X=x*S16,Y=y*S16,Z=z*S16;
  // top
  if(!full&&!(FLAGS[above]&F_OPAQUE&&h00>=15)){
    corners(ci+1,STR[2],STR[0]);
    // canonical corner order for +y: u=z, v=x -> k: (z0,x0),(z1,x0),(z1,x1),(z0,x1)
    const P=[[X,Y+h00,Z],[X,Y+h01,Z+S16],[X+S16,Y+h11,Z+S16],[X+S16,Y+h10,Z]];
    for(let j=0;j<4;j++){px[j*3]=P[j][0];px[j*3+1]=P[j][1];px[j*3+2]=P[j][2];puv[j*2]=P[j][0];puv[j*2+1]=P[j][2];pao[j]=3;psk[j]=cSky[j];pbl[j]=cBlk[j];}
    emit(t,3,layer,anim,rgb,false);
  }
  // sides
  const side=(f,nOff,p)=>{const nb=G[ci+nOff];if((nb&255)===id||(FLAGS[nb]&F_OPAQUE))return;
    const ls=Math.max(GS[ci],GS[ci+nOff]),lb=Math.max(GB[ci],GB[ci+nOff]);
    for(let j=0;j<4;j++){px[j*3]=p[j*3];px[j*3+1]=p[j*3+1];px[j*3+2]=p[j*3+2];const d=FD[f];faceUV(d,p[j*3],p[j*3+1],p[j*3+2],0,puv,j*2);pao[j]=3;psk[j]=ls;pbl[j]=lb;}
    emit(t,f,layer,anim,rgb,false);};
  // -x face (d=0,u=y,v=z, s<0 order 0,3,2,1): (y0,z0),(y0,z1),(y1,z1),(y1,z0)
  side(0,-STR[0],[X,Y,Z, X,Y,Z+S16, X,Y+h01,Z+S16, X,Y+h00,Z]);
  side(1,STR[0],[X+S16,Y,Z, X+S16,Y+h10,Z, X+S16,Y+h11,Z+S16, X+S16,Y,Z+S16]);
  side(4,-STR[2],[X,Y,Z, X,Y+h00,Z, X+S16,Y+h10,Z, X+S16,Y,Z]);
  side(5,STR[2],[X,Y,Z+S16, X+S16,Y,Z+S16, X+S16,Y+h11,Z+S16, X,Y+h01,Z+S16]);
  // bottom
  const below=G[ci-1];
  if((below&255)!==id&&!(FLAGS[below]&F_OPAQUE)){
    const ls=GS[ci-1],lb=GB[ci-1];
    const p=[X,Y,Z, X+S16,Y,Z, X+S16,Y,Z+S16, X,Y,Z+S16];
    for(let j=0;j<4;j++){px[j*3]=p[j*3];px[j*3+1]=p[j*3+1];px[j*3+2]=p[j*3+2];puv[j*2]=p[j*3];puv[j*2+1]=p[j*3+2];pao[j]=3;psk[j]=ls;pbl[j]=lb;}
    emit(t,2,layer,anim,rgb,false);
  }
}
function specials(H){
  for(let x=0;x<NX;x++)for(let z=0;z<NZ;z++){
    const ci0=BASE+x*STR[0]+z*STR[2];
    for(let y=0;y<H;y++){
      const ci=ci0+y,v=G[ci];if(!v)continue;const m=MODEL[v];
      if(m===1||m===0)continue;
      if(m===5){emitFluid(ci,x,y,z,v);continue;}
      if(SCALE!==1)continue;
      if(m===4){if(!(FLAGS[v]&F_CUBE))emitBoxes(S.staticBoxes(v),ci,x,y,z,v);}
      else if(m===2||m===3)emitPlant(m,ci,x,y,z,v);
      else if(m===6)emitWire(ci,x,y,z,v);
      else if(m===7||m===8||m===9)emitBoxes(S.dynBoxes(v,S.connMask(v,nbFn(ci)),false),ci,x,y,z,v);
      else if(m===10)emitVine(ci,x,y,z,v);
    }
  }
}
/* ---------- lighting ---------- */
let qt=0;
function bfs(L,head){
  while(head!==qt){
    const i=queue[head];head=(head+1)&QM;
    const l=L[i];if(l<=1)continue;
    const gy=i%GY,col=(i-gy)/GY,gz=col%GZ,gx=(col-gz)/GZ;
    let n,b,nl;
    if(gy>1){n=i-1;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
    if(gy<256){n=i+1;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
    if(gx>0){n=i-SXF;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
    if(gx<GX-1){n=i+SXF;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
    if(gz>0){n=i-SZF;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
    if(gz<GZ-1){n=i+SZF;b=FILTER[grid[n]];if(b<15){nl=l-1-b;if(nl>L[n]){L[n]=nl;queue[qt]=n;qt=(qt+1)&QM;}}}
  }
}
function computeLight(){
  if(hasSky){
    // sunlight: full above the highest light-filtering block of each column
    for(let c=0;c<GX*GZ;c++){const base=c*GY,t=tops[c];sky.fill(0,base,base+t+2);sky.fill(15,base+t+2,base+GY);}
    qt=0;
    for(let gx=0;gx<GX;gx++)for(let gz=0;gz<GZ;gz++){
      const c=gx*GZ+gz,t=tops[c];let mt=t;
      if(gx>0&&tops[c-GZ]>mt)mt=tops[c-GZ];if(gx<GX-1&&tops[c+GZ]>mt)mt=tops[c+GZ];
      if(gz>0&&tops[c-1]>mt)mt=tops[c-1];if(gz<GZ-1&&tops[c+1]>mt)mt=tops[c+1];
      const hi=Math.min(255,Math.max(t+1,mt));
      for(let y=t+1;y<=hi;y++){queue[qt]=c*GY+y+1;qt=(qt+1)&QM;}
    }
    bfs(sky,0);
  } else sky.fill(0);
  blk.fill(0);qt=0;
  for(let c=0;c<GX*GZ;c++){const base=c*GY,t=tops[c];
    for(let gy=1;gy<=t+1;gy++){const e=LIGHT[grid[base+gy]];if(e){blk[base+gy]=e;queue[qt]=base+gy;qt=(qt+1)&QM;}}}
  bfs(blk,0);
}
function buildLod(regionMax){
  const yCells=Math.min(128,(regionMax>>1)+2);
  lgrid.fill(0);lblk.fill(0);lsky.fill(hasSky?15:0);lhalf.fill(0);
  let chunkTop=0;const BF=(M*GZ+M)*GY+1;
  for(let X=-1;X<=8;X++)for(let Z=-1;Z<=8;Z++){
    const lc=((X+1)*LGZ+(Z+1))*LGY;lgrid[lc]=B.BEDROCK;let top=-1;
    for(let Y=0;Y<yCells;Y++){
      let sol=0,liq=0,rep=0,lid=0,upLiq=0;
      for(let dy=1;dy>=0;dy--)for(let dx=0;dx<2;dx++)for(let dz=0;dz<2;dz++){
        const v=grid[BF+(2*X+dx)*SXF+(2*Z+dz)*SZF+2*Y+dy],fl=FLAGS[v];
        if((fl&F_CUBE)&&!(fl&F_TRANS&&(v&255)!==B.ICE)){sol++;if(!rep)rep=v;}else if(fl&F_LIQUID){liq++;if(!lid)lid=v&255;if(dy)upLiq++;}
      }
      const v=sol>=4?rep:(liq>=4?lid:0);
      lgrid[lc+Y+1]=v;if(v)top=Y;
      if(v&&(FLAGS[v]&F_LIQUID)&&!upLiq)lhalf[lc+Y+1]=1;
    }
    if(hasSky)for(let Y=0;Y<=top;Y++)lsky[lc+Y+1]=6;
    ltops[(X+1)*LGZ+(Z+1)]=top;
    if(X>=0&&X<8&&Z>=0&&Z<8&&top>chunkTop)chunkTop=top;
  }
  return chunkTop;
}
function doMesh(m){
  const {cx,cz,lod}=m;
  const ch=[];
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)ch[(dz+1)*3+dx+1]=getChunk(cx+dx,cz+dz);
  let regionMax=0,chunkMax=0;
  for(let gx=0;gx<GX;gx++){
    const wx=gx-M,ncx=wx<0?0:(wx<16?1:2),lx=wx-(ncx-1)*16;
    for(let gz=0;gz<GZ;gz++){
      const wz=gz-M,ncz=wz<0?0:(wz<16?1:2),lz=wz-(ncz-1)*16;
      const src=ch[ncz*3+ncx].data,off=((lx<<4)|lz)<<8,col=(gx*GZ+gz)*GY;
      grid.set(src.subarray(off,off+256),col+1);grid[col]=B.BEDROCK;grid[col+257]=0;
      let t=255;while(t>=0&&src[off+t]===0)t--;
      tops[gx*GZ+gz]=t;if(t>regionMax)regionMax=t;
      if(wx>=0&&wx<16&&wz>=0&&wz<16&&t>chunkMax)chunkMax=t;
    }
  }
  oLen=0;tLen=0;minY=4096;maxY=0;
  buildTints(ch);
  let light=null;
  if(lod===0){
    computeLight();
    G=grid;GS=sky;GB=blk;BASE=(M*GZ+M)*GY+1;STR=[SXF,1,SZF];NX=16;NZ=16;SCALE=1;SKIRT=false;
    greedy(chunkMax+1);specials(chunkMax+1);
    light=new Uint8Array(65536);
    for(let x=0;x<16;x++)for(let z=0;z<16;z++){const src=((x+M)*GZ+(z+M))*GY+1,dst=((x<<4)|z)<<8,lim=Math.min(255,chunkMax+2);
      for(let y=0;y<=lim;y++)light[dst+y]=(sky[src+y]<<4)|blk[src+y];for(let y=lim+1;y<256;y++)light[dst+y]=hasSky?0xf0:0;}
  } else {
    const top=buildLod(regionMax);
    G=lgrid;GS=lsky;GB=lblk;BASE=(1*LGZ+1)*LGY+1;STR=[LGZ*LGY,1,LGY];NX=8;NZ=8;SCALE=2;SKIRT=true;
    greedy(top+1);specials(top+1);
  }
  const o=oBuf.slice(0,oLen),t=tBuf.slice(0,tLen);
  const msg={t:'mesh',epoch,cx,cz,lod,ver:m.ver,o,tr:t,minY:minY>maxY?0:minY/16,maxY:maxY/16};
  const tr=[o.buffer,t.buffer];
  if(light){msg.light=light;tr.push(light.buffer);}
  if(m.needData){msg.data=ch[4].data.slice();msg.biomes=ch[4].biomes.slice();tr.push(msg.data.buffer,msg.biomes.buffer);}
  self.postMessage(msg,tr);
}
self.onmessage=e=>{
  const m=e.data;
  try{
    switch(m.t){
      case 'init':
        seed=m.seed;dim=m.dim;epoch=m.epoch;gen=S.makeGenerator(seed,dim);hasSky=S.DIMS[dim].sky;
        edits=new Map();cache.clear();
        for(const [k,buf] of m.edits||[])edits.set(k,S.decodeEdits(buf));
        break;
      case 'sets':{
        const L=m.list;
        for(let i=0;i<L.length;i+=4){const x=L[i],y=L[i+1],z=L[i+2],v=L[i+3];
          const cx=Math.floor(x/16),cz=Math.floor(z/16),k=S.ckey(cx,cz),idx=(((x-cx*16)<<4)|(z-cz*16))<<8|y;
          let ed=edits.get(k);if(!ed){ed=new Map();edits.set(k,ed);}ed.set(idx,v);
          const c=cache.get(k);if(c)c.data[idx]=v;}
        break;}
      case 'mesh':doMesh(m);break;
      case 'center':ccx=m.cx;ccz=m.cz;keepR=m.r;
        for(const k of [...cache.keys()]){const cx=S.keyCX(k),cz=S.keyCZ(k);if(Math.max(Math.abs(cx-ccx),Math.abs(cz-ccz))>keepR)cache.delete(k);}
        break;
      case 'baseline':{const g=gen.generate(m.cx,m.cz);self.postMessage({t:'baseline',epoch,cx:m.cx,cz:m.cz,data:g.data},[g.data.buffer]);break;}
      case 'spawn':{const p=gen.findSpawn();self.postMessage({t:'spawn',epoch,x:p.x,z:p.z});break;}
    }
  }catch(err){
    self.postMessage({t:'error',epoch,req:m.t,cx:m.cx,cz:m.cz,ver:m.ver,msg:String(err&&err.stack||err)});
  }
};
}
