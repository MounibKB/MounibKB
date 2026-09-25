/* =====================================================================
   MAIN THREAD — core globals, math helpers, settings
   ===================================================================== */
const S={};SHARED(S);
const {B,DEF,FLAGS,LIGHT,MODEL,TEXV,F_OPAQUE,F_SOLID,F_CUBE,F_LIQUID,F_REPL,F_CLIMB,F_FULLCOL,F_RTICK,HFACE,HVEC,FDIR,OPP,ckey,DIMS,BIOMES}=S;
const V=S.V;
const UNKNOWN=-1; // voxel value for unloaded/unknown space
const $=id=>document.getElementById(id);
const clamp=(x,a,b)=>x<a?a:(x>b?b:x);
const finite=(x,d)=>(typeof x==='number'&&isFinite(x))?x:d;
const randInt=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const TICK=1/20;                 // game tick (seconds)
const REACH=4.5,REACH_CREATIVE=5;
const posKey=(x,y,z)=>x+','+y+','+z;
function perspective(fovy,aspect,near,far){const f=1/Math.tan(fovy/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);}
function mul4(a,b,o){o=o||new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+r]*b[c*4+k];o[c*4+r]=s;}return o;}
function frustumPlanes(m,out){
  const r=i=>[m[i],m[4+i],m[8+i],m[12+i]],r0=r(0),r1=r(1),r2=r(2),r3=r(3);let k=0;
  for(const [s,rr] of [[1,r0],[-1,r0],[1,r1],[-1,r1],[1,r2],[-1,r2]])out[k++]=[r3[0]+s*rr[0],r3[1]+s*rr[1],r3[2]+s*rr[2],r3[3]+s*rr[3]];
  return out;
}
function boxVisible(pl,x0,y0,z0,x1,y1,z1){for(const p of pl){if(p[0]*(p[0]>0?x1:x0)+p[1]*(p[1]>0?y1:y0)+p[2]*(p[2]>0?z1:z0)+p[3]<0)return false;}return true;}
function log(...a){console.log('[VoxelCraft]',...a);}
function reportError(where,err){console.error('[VoxelCraft]',where,err);try{toast('Error in '+where+': '+(err&&err.message||err));}catch(e){}}

/* ---------------- settings (validated, persisted per browser) ---------------- */
const DEFAULT_KEYS={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',sneak:'ShiftLeft',sprint:'ControlLeft',
  inventory:'KeyE',drop:'KeyQ',swap:'KeyF',chat:'KeyT',command:'Slash',debug:'F3',hud:'F1',perspective:'F5'};
const settings={renderDist:8,simDist:5,fov:70,sens:8,volume:0.7,music:0.4,bobbing:true,guiScale:1,difficulty:2,showFps:true,invertY:false,keys:Object.assign({},DEFAULT_KEYS),sprintToggle:false,crouchToggle:false};
function loadSettings(){
  try{const o=JSON.parse(localStorage.getItem('voxelcraft.settings')||'{}');
    settings.renderDist=clamp(Math.round(finite(o.renderDist,8)),2,16);settings.simDist=clamp(Math.round(finite(o.simDist,5)),2,8);
    settings.fov=clamp(finite(o.fov,70),30,110);settings.sens=clamp(finite(o.sens,8),1,30);settings.volume=clamp(finite(o.volume,0.7),0,1);
    settings.music=clamp(finite(o.music,0.4),0,1);settings.bobbing=o.bobbing!==false;settings.guiScale=clamp(finite(o.guiScale,1),0.6,2);
    settings.difficulty=clamp(Math.round(finite(o.difficulty,2)),0,3);settings.invertY=!!o.invertY;settings.sprintToggle=!!o.sprintToggle;settings.crouchToggle=!!o.crouchToggle;
    if(o.keys&&typeof o.keys==='object')for(const k in DEFAULT_KEYS)if(typeof o.keys[k]==='string'&&o.keys[k].length<32)settings.keys[k]=o.keys[k];
  }catch(e){log('settings reset',e);}
}
function saveSettings(){try{localStorage.setItem('voxelcraft.settings',JSON.stringify(settings));}catch(e){}}
loadSettings();
const DIFF_NAMES=['Peaceful','Easy','Normal','Hard'];
