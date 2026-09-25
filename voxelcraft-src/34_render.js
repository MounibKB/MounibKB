/* =====================================================================
   RENDERER (WebGL2)
   ===================================================================== */
const canvas=$('c');
const gl=canvas.getContext('webgl2',{antialias:false,powerPreference:'high-performance',alpha:false,preserveDrawingBuffer:false});
if(!gl){document.body.innerHTML='<div style="color:#fff;padding:40px;font:18px sans-serif">WebGL 2 is required but not available in this browser.</div>';throw new Error('no webgl2');}
let glLost=false;
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();glLost=true;toast('Graphics context lost — reload the page (your world is saved).');});
const MAX_LAYERS=gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
function makeArrayTex(tiles){
  const n=Math.max(1,tiles.length);if(n>MAX_LAYERS)throw new Error('texture layers exceed GPU limit');
  const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D_ARRAY,tex);
  const all=new Uint8Array(n*1024);tiles.forEach((t,i)=>all.set(t,i*1024));
  // bleed colour into fully transparent texels so mipmaps don't darken cutout edges
  for(let l=0;l<n;l++)for(let p=0;p<256;p++){const o=l*1024+p*4;if(all[o+3]===0){let r=0,g=0,b=0,c=0;
    for(const d of [-4,4,-64,64]){const q=o+d;if(q>=l*1024&&q<(l+1)*1024&&all[q+3]){r+=all[q];g+=all[q+1];b+=all[q+2];c++;}}if(c){all[o]=r/c;all[o+1]=g/c;all[o+2]=b/c;}}}
  gl.texImage3D(gl.TEXTURE_2D_ARRAY,0,gl.RGBA8,16,16,n,0,gl.RGBA,gl.UNSIGNED_BYTE,all);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MIN_FILTER,gl.NEAREST_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_WRAP_T,gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY,gl.TEXTURE_MAX_LEVEL,4);gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  const an=gl.getExtension('EXT_texture_filter_anisotropic');if(an)gl.texParameterf(gl.TEXTURE_2D_ARRAY,an.TEXTURE_MAX_ANISOTROPY_EXT,4);
  return tex;
}
const blockTex=makeArrayTex(BLOCK_TILES);
const itemTex=makeArrayTex(ITEM_TEX_NAMES.map(n=>TEX.items[n]));
// 512x512 atlas (UI icons draw from it)
const atlas=document.createElement('canvas');atlas.width=512;atlas.height=512;
{const ctx=atlas.getContext('2d');BLOCK_TILES.forEach((t,i)=>ctx.putImageData(new ImageData(t,16,16),(i%32)*16,Math.floor(i/32)*16));
  ITEM_TEX_NAMES.forEach((n,i)=>{const j=i+256;ctx.putImageData(new ImageData(TEX.items[n],16,16),(j%32)*16,Math.floor(j/32)*16);});}

function compile(vs,fs){
  const mk=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s)+'\n'+src.split('\n').map((l,i)=>(i+1)+': '+l).join('\n'));return s;};
  const p=gl.createProgram();gl.attachShader(p,mk(gl.VERTEX_SHADER,vs));gl.attachShader(p,mk(gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(p));
  const u={},n=gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);
  for(let i=0;i<n;i++){const a=gl.getActiveUniform(p,i);u[a.name.replace('[0]','')]=gl.getUniformLocation(p,a.name);}
  return {p,u};
}
const LIGHT_GLSL=`
uniform float uDaylight,uAmbient,uNightVision;
float lightLevel(float sky,float blk){float s=sky*uDaylight;float l=max(s,blk);float b=pow(0.8,15.0-l);b=mix(b,1.0,uNightVision*0.85);return uAmbient+(1.0-uAmbient)*b;}
vec3 lightTint(float sky,float blk){return mix(vec3(1.0),vec3(1.0,0.84,0.62),clamp((blk-sky*uDaylight)*0.22,0.0,1.0));}`;
const FOG_GLSL=`uniform vec3 uFogColor;uniform float uFogNear,uFogFar;float fogF(float d){return clamp((d-uFogNear)/(uFogFar-uFogNear),0.0,1.0);}`;
const chunkProg=compile(`#version 300 es
layout(location=0) in uvec4 aV;
uniform mat4 uPV;uniform vec3 uOffset;uniform float uUVScale;uniform float uTime;
out vec3 vUV;out float vShade;out float vSky;out float vBlk;out float vAO;out float vDist;out vec3 vTint;
void main(){
  uint w0=aV.x,w1=aV.y,w2=aV.z,w3=aV.w;
  vec3 p=vec3(float(w0&511u),float((w0>>9u)&8191u),float((w0>>22u)&511u))/16.0;
  uint f=(w1>>18u)&7u,anim=(w1>>21u)&3u;
  vec2 uv=vec2(float(w2&8191u),float((w2>>13u)&8191u))/16.0*uUVScale;
  if(anim==1u)uv+=vec2(uTime*0.03,uTime*0.05);
  else if(anim==2u)uv+=vec2(uTime*0.02,uTime*0.013);
  else if(anim==3u)uv.y+=fract(uTime*1.3);
  vUV=vec3(uv,float(w1&255u));
  vShade=f<2u?0.8:(f==2u?0.5:(f==3u?1.0:(f<6u?0.65:0.9)));
  vSky=float((w1>>8u)&15u);vBlk=float((w1>>12u)&15u);vAO=float((w1>>16u)&3u);
  vTint=vec3(float(w3&255u),float((w3>>8u)&255u),float((w3>>16u)&255u))/255.0;
  vec3 wp=p+uOffset;vDist=length(vec3(wp.x,wp.y*0.35,wp.z));
  gl_Position=uPV*vec4(wp,1.0);
}`,`#version 300 es
precision highp float;precision highp sampler2DArray;
uniform sampler2DArray uTex;uniform float uAlphaTest;${LIGHT_GLSL}${FOG_GLSL}
in vec3 vUV;in float vShade;in float vSky;in float vBlk;in float vAO;in float vDist;in vec3 vTint;out vec4 o;
void main(){
  vec4 c=texture(uTex,vUV);if(c.a<uAlphaTest)discard;
  float ao=0.45+vAO*0.1833;
  vec3 col=c.rgb*vTint*lightLevel(vSky,vBlk)*lightTint(vSky,vBlk)*vShade*ao;
  o=vec4(mix(col,uFogColor,fogF(vDist)),c.a);
}`);
const boxProg=compile(`#version 300 es
layout(location=0) in vec3 aPos;layout(location=1) in vec3 aNor;layout(location=2) in vec2 aUV;
layout(location=3) in vec3 iPos;layout(location=4) in vec3 iSize;layout(location=5) in vec2 iRot;
layout(location=6) in vec3 iLay;layout(location=7) in vec4 iCol;layout(location=8) in vec4 iUVT;
uniform mat4 uPV;
out vec3 vUV;out vec4 vCol;out float vShade;out float vDist;out float vArr;out float vAlpha;
void main(){
  vec3 p=aPos*iSize,n=aNor;
  float cp=cos(iRot.y),sp=sin(iRot.y);
  p=vec3(p.x,p.y*cp-p.z*sp,p.y*sp+p.z*cp);n=vec3(n.x,n.y*cp-n.z*sp,n.y*sp+n.z*cp);
  float cy=cos(iRot.x),sy=sin(iRot.x);
  p=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy);n=vec3(n.x*cy+n.z*sy,n.y,-n.x*sy+n.z*cy);
  vec3 wp=iPos+p;
  float layer=aNor.y>0.5?iLay.x:(aNor.y<-0.5?iLay.z:iLay.y);
  vArr=layer>=512.0?1.0:0.0;if(layer>=512.0)layer-=512.0;
  vUV=vec3(iUVT.xy+aUV*iUVT.z,layer);vAlpha=iUVT.w;
  vShade=0.62+0.38*max(dot(n,normalize(vec3(0.35,1.0,0.55))),0.0);
  vCol=iCol;vDist=length(vec3(wp.x,wp.y*0.35,wp.z));
  gl_Position=uPV*vec4(wp,1.0);
}`,`#version 300 es
precision highp float;precision highp sampler2DArray;
uniform sampler2DArray uTex,uItems;uniform float uEmissive;uniform float uFog;${FOG_GLSL}
in vec3 vUV;in vec4 vCol;in float vShade;in float vDist;in float vArr;in float vAlpha;out vec4 o;
void main(){
  vec4 t=vUV.z<0.0?vec4(1.0):(vArr>0.5?texture(uItems,vUV):texture(uTex,vUV));
  if(t.a<0.1)discard;
  vec3 c=t.rgb*vCol.rgb*mix(vShade*vCol.a,1.0,uEmissive);
  o=vec4(mix(c,uFogColor,uFog*fogF(vDist)),t.a*vAlpha);
}`);
const lineProg=compile(`#version 300 es
layout(location=0) in vec3 aPos;uniform mat4 uPV;uniform vec3 uOffset;uniform vec3 uScale;
void main(){gl_Position=uPV*vec4(aPos*uScale+uOffset,1.0);}`,`#version 300 es
precision mediump float;uniform vec4 uColor;out vec4 o;void main(){o=uColor;}`);
const skyProg=compile(`#version 300 es
layout(location=0) in vec2 aP;uniform mat4 uInvPV;out vec3 vDir;
void main(){vec4 w=uInvPV*vec4(aP,1.0,1.0);vDir=w.xyz/w.w;gl_Position=vec4(aP,0.9999,1.0);}`,`#version 300 es
precision highp float;in vec3 vDir;uniform vec3 uTop,uHorizon;uniform float uStars;uniform vec3 uSunDir;out vec4 o;
float h(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,45.164)))*43758.5453);}
void main(){vec3 d=normalize(vDir);float t=smoothstep(-0.05,0.45,d.y);vec3 c=mix(uHorizon,uTop,t);
  if(uStars>0.0&&d.y>0.0){vec3 q=floor(d*180.0);float s=h(q);if(s>0.9975)c+=vec3(uStars*(s-0.9975)*400.0*smoothstep(0.0,0.2,d.y));}
  float sg=max(dot(d,uSunDir),0.0);c+=vec3(1.0,0.6,0.3)*pow(sg,24.0)*0.35*smoothstep(-0.2,0.2,uSunDir.y+0.2);
  o=vec4(c,1.0);}`);
/* ---------- chunk GPU buffers ---------- */
const ebo=gl.createBuffer();let eboQuads=0;
function ensureEBO(q){
  if(q<=eboQuads)return;
  const n=Math.max(q,eboQuads*2,65536),idx=new Uint32Array(n*6);
  for(let i=0,v=0,j=0;i<n;i++,v+=4){idx[j++]=v;idx[j++]=v+1;idx[j++]=v+2;idx[j++]=v;idx[j++]=v+2;idx[j++]=v+3;}
  gl.bindVertexArray(null);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,idx,gl.STATIC_DRAW);eboQuads=n;
}
ensureEBO(65536);
const meshPool=[];let gpuBytes=0;
function allocMesh(){
  if(meshPool.length)return meshPool.pop();
  const vao=gl.createVertexArray(),vbo=gl.createBuffer();
  gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.enableVertexAttribArray(0);
  gl.vertexAttribIPointer(0,4,gl.UNSIGNED_INT,16,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ebo);gl.bindVertexArray(null);
  return {vao,vbo,count:0,cap:0};
}
function freeMesh(m){if(m){m.count=0;if(meshPool.length<64)meshPool.push(m);else{gpuBytes-=m.cap;gl.deleteBuffer(m.vbo);gl.deleteVertexArray(m.vao);}}}
function uploadMesh(m,words){
  const quads=words.length/16;
  if(!quads){m.count=0;return;}
  ensureEBO(quads);
  gl.bindBuffer(gl.ARRAY_BUFFER,m.vbo);
  if(words.byteLength>m.cap||words.byteLength<m.cap/4){gpuBytes+=words.byteLength-m.cap;gl.bufferData(gl.ARRAY_BUFFER,words,gl.STATIC_DRAW);m.cap=words.byteLength;}
  else gl.bufferSubData(gl.ARRAY_BUFFER,0,words);
  m.count=quads*6;
}
/* ---------- instanced boxes ---------- */
const INST_F=20,MAX_INST=4096;
const instData=new Float32Array(MAX_INST*INST_F);let instCount=0;
const boxVAO=gl.createVertexArray(),instVBO=gl.createBuffer();
{
  const v=[];const FDl=[0,0,1,1,2,2],FSl=[-1,1,-1,1,-1,1],QU=[-1,1,1,-1],QV=[-1,-1,1,1];
  for(let f=0;f<6;f++){
    const d=FDl[f],u=(d+1)%3,w=(d+2)%3,s=FSl[f],ord=s>0?[0,1,2,3]:[0,3,2,1];
    const corner=k=>{const p=[0,0,0];p[d]=0.5*s;p[u]=0.5*QU[k];p[w]=0.5*QV[k];
      const uv=d===0?[p[2]+0.5,0.5-p[1]]:(d===1?[p[0]+0.5,p[2]+0.5]:[p[0]+0.5,0.5-p[1]]);const n=[0,0,0];n[d]=s;return [...p,...n,...uv];};
    for(const j of [0,1,2,0,2,3])v.push(...corner(ord[j]));
  }
  gl.bindVertexArray(boxVAO);
  const vb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(v),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,32,0);
  gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,32,12);
  gl.enableVertexAttribArray(2);gl.vertexAttribPointer(2,2,gl.FLOAT,false,32,24);
  gl.bindBuffer(gl.ARRAY_BUFFER,instVBO);gl.bufferData(gl.ARRAY_BUFFER,instData.byteLength,gl.DYNAMIC_DRAW);
  for(const [loc,sz,off] of [[3,3,0],[4,3,3],[5,2,6],[6,3,8],[7,4,11],[8,4,15]]){gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,sz,gl.FLOAT,false,INST_F*4,off*4);gl.vertexAttribDivisor(loc,1);}
  gl.bindVertexArray(null);
}
// layers: block texture index, or 512+item texture index, or -1 (untextured)
function addBox(x,y,z,sx,sy,sz,yaw,pitch,lt,ls,lb,r,g,b,bright,uox=0,uoy=0,uvs=1,alpha=1){
  if(instCount>=MAX_INST)flushBoxes();const o=instCount++*INST_F,d=instData;
  d[o]=x;d[o+1]=y;d[o+2]=z;d[o+3]=sx;d[o+4]=sy;d[o+5]=sz;d[o+6]=yaw;d[o+7]=pitch;d[o+8]=lt;d[o+9]=ls;d[o+10]=lb;
  d[o+11]=r;d[o+12]=g;d[o+13]=b;d[o+14]=bright;d[o+15]=uox;d[o+16]=uoy;d[o+17]=uvs;d[o+18]=alpha;d[o+19]=0;
}
function flushBoxes(){
  if(!instCount)return;
  gl.bindVertexArray(boxVAO);gl.bindBuffer(gl.ARRAY_BUFFER,instVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER,0,instData,0,instCount*INST_F);
  gl.drawArraysInstanced(gl.TRIANGLES,0,36,instCount);instCount=0;
}
const lineVAO=gl.createVertexArray();
{const e=[];const P=[[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]];
  for(const [i,j] of [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]])e.push(...P[i],...P[j]);
  gl.bindVertexArray(lineVAO);const lb=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,lb);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(e),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,12,0);gl.bindVertexArray(null);}
const skyVAO=gl.createVertexArray();
{gl.bindVertexArray(skyVAO);const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,8,0);gl.bindVertexArray(null);}
function invert4(m){const o=new Float32Array(16),a=m;
  const b00=a[0]*a[5]-a[1]*a[4],b01=a[0]*a[6]-a[2]*a[4],b02=a[0]*a[7]-a[3]*a[4],b03=a[1]*a[6]-a[2]*a[5],b04=a[1]*a[7]-a[3]*a[5],b05=a[2]*a[7]-a[3]*a[6],
    b06=a[8]*a[13]-a[9]*a[12],b07=a[8]*a[14]-a[10]*a[12],b08=a[8]*a[15]-a[11]*a[12],b09=a[9]*a[14]-a[10]*a[13],b10=a[9]*a[15]-a[11]*a[13],b11=a[10]*a[15]-a[11]*a[14];
  let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;if(!det)return o;det=1/det;
  o[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det;o[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*det;o[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det;o[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*det;
  o[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*det;o[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;o[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*det;o[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;
  o[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det;o[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*det;o[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det;o[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*det;
  o[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*det;o[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;o[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*det;o[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;return o;}
let W=0,H=0;
function resize(){const dpr=Math.min(window.devicePixelRatio||1,1.5);W=Math.max(1,Math.floor(innerWidth*dpr));H=Math.max(1,Math.floor(innerHeight*dpr));canvas.width=W;canvas.height=H;}
window.addEventListener('resize',resize);resize();
// icon helpers for UI (data URLs cached)
const ICONS={};
function tileCanvas(t){const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').putImageData(new ImageData(t,16,16),0,0);return c;}
function iconFor(id){
  if(ICONS[id]!==undefined)return ICONS[id];
  const it=ITEM[id];let url='';
  if(it){const c=document.createElement('canvas');c.width=c.height=32;const x=c.getContext('2d');x.imageSmoothingEnabled=false;
    if(it.block){const v=it.block,m=MODEL[v],fl=FLAGS[v];
      if(m===2||m===3||m===6||m===10||(m===4&&!(fl&F_CUBE)&&[B.TORCH,B.REDSTONE_TORCH,B.LADDER,B.RAIL,B.LEVER,B.LILY_PAD,B.COBWEB].includes(v))){
        x.drawImage(tileCanvas(BLOCK_TILES[TEXV[v*6+1]]),0,0,32,32);}
      else{const top=tileCanvas(BLOCK_TILES[TEXV[v*6+3]]),side=tileCanvas(BLOCK_TILES[TEXV[v*6+5]]),side2=tileCanvas(BLOCK_TILES[TEXV[v*6+1]]);
        const tintTop=S.TINT[v]||(DEF[v].tintTop?1:0);
        x.setTransform(14/16,-7/16,14/16,7/16,2,9);x.drawImage(top,0,0);if(tintTop){x.globalCompositeOperation='multiply';x.fillStyle=tintTop===4?'#80a755':(tintTop===3?'#619961':'#7cbd50');x.fillRect(0,0,16,16);x.globalCompositeOperation='destination-in';x.drawImage(top,0,0);x.globalCompositeOperation='source-over';}
        x.setTransform(14/16,7/16,0,15/16,2,9);x.drawImage(side,0,0);x.fillStyle='rgba(0,0,0,0.25)';x.fillRect(0,0,16,16);
        x.setTransform(14/16,-7/16,0,15/16,16,16);x.drawImage(side2,0,0);x.fillStyle='rgba(0,0,0,0.45)';x.fillRect(0,0,16,16);}}
    else{const t=TEX.items[it.tex];if(t)x.drawImage(tileCanvas(t),0,0,32,32);}
    url=c.toDataURL();}
  ICONS[id]=url;return url;
}
