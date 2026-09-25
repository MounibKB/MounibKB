/* ---------------- PRNG / hashing / noise ---------------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function hash(a,b,c,d){let h=Math.imul(a|0,0x27d4eb2d)^Math.imul(b|0,0x165667b1)^Math.imul(c|0,0x85ebca6b)^Math.imul(d|0,0xc2b2ae35);
  h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;h=Math.imul(h,0x297a2d39);h^=h>>>15;return h>>>0;}
function ckey(cx,cz){return (cx+32768)*65536+(cz+32768);}
function keyCX(k){return Math.floor(k/65536)-32768;} function keyCZ(k){return (k%65536)-32768;}
function smoothstep(a,b,x){const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);}
function seedFromString(s){if(!s)return (Math.random()*2147483647)|0;if(/^-?\d+$/.test(s))return parseInt(s,10)|0;
  let h=7;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),0x5bd1e995)^(h>>>13);return h|0;}
function makeNoise(seed){
  const p=new Uint8Array(512),r=mulberry32(seed),perm=[];
  for(let i=0;i<256;i++)perm[i]=i;
  for(let i=255;i>0;i--){const j=(r()*(i+1))|0;const t=perm[i];perm[i]=perm[j];perm[j]=t;}
  for(let i=0;i<512;i++)p[i]=perm[i&255];
  const fade=t=>t*t*t*(t*(t*6-15)+10);
  function g2(h,x,y){switch(h&7){case 0:return x+y;case 1:return -x+y;case 2:return x-y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y;}}
  function g3(h,x,y,z){const hh=h&15,u=hh<8?x:y,v=hh<4?y:(hh===12||hh===14?x:z);return((hh&1)?-u:u)+((hh&2)?-v:v);}
  function n2(x,y){let X=Math.floor(x),Y=Math.floor(y);const xf=x-X,yf=y-Y;X&=255;Y&=255;const u=fade(xf),v=fade(yf);
    const aa=p[p[X]+Y],ab=p[p[X]+Y+1],ba=p[p[X+1]+Y],bb=p[p[X+1]+Y+1];
    const a1=g2(aa,xf,yf),x1=a1+u*(g2(ba,xf-1,yf)-a1),a2=g2(ab,xf,yf-1),x2=a2+u*(g2(bb,xf-1,yf-1)-a2);return x1+v*(x2-x1);}
  function n3(x,y,z){let X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);const xf=x-X,yf=y-Y,zf=z-Z;X&=255;Y&=255;Z&=255;
    const u=fade(xf),v=fade(yf),w=fade(zf);
    const A=p[X]+Y,AA=p[A]+Z,AB=p[A+1]+Z,Bb=p[X+1]+Y,BA=p[Bb]+Z,BB=p[Bb+1]+Z;
    const l=(a,b,t)=>a+t*(b-a);
    return l(l(l(g3(p[AA],xf,yf,zf),g3(p[BA],xf-1,yf,zf),u),l(g3(p[AB],xf,yf-1,zf),g3(p[BB],xf-1,yf-1,zf),u),v),
             l(l(g3(p[AA+1],xf,yf,zf-1),g3(p[BA+1],xf-1,yf,zf-1),u),l(g3(p[AB+1],xf,yf-1,zf-1),g3(p[BB+1],xf-1,yf-1,zf-1),u),v),w);}
  return {n2,n3};
}
function fbm2(n,x,z,oct){let s=0,a=1,f=1,t=0;for(let i=0;i<oct;i++){s+=a*n.n2(x*f,z*f);t+=a;a*=0.5;f*=2.03;}return s/t;}

/* ---------------- biomes ---------------- */
const BIOMES=[],BIO={};
function biome(id,key,o){const b=Object.assign({id,key,name:key.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),
  temp:0.8,rain:0.4,grass:[0x91,0xbd,0x59],foliage:[0x77,0xab,0x2f],top:B.GRASS_BLOCK,filler:B.DIRT,under:B.SAND,
  trees:[],treeCount:0,grassChance:0.1,flowers:[],precip:'rain',dim:0,creatures:[],monsters:[]},o);BIOMES[id]=b;BIO[key.toUpperCase()]=id;return b;}
const STD_MON=[['zombie',95],['skeleton',100],['creeper',100],['spider',100],['enderman',10]];
const STD_ANI=[['pig',10],['cow',8],['sheep',12],['chicken',10]];
biome(0,'ocean',{grassChance:0,under:B.GRAVEL,creatures:[],monsters:STD_MON});
biome(1,'deep_ocean',{grassChance:0,under:B.GRAVEL,monsters:STD_MON});
biome(2,'beach',{top:B.SAND,filler:B.SAND,grassChance:0,monsters:STD_MON});
biome(3,'plains',{trees:[['oak',9],['fancy_oak',1]],treeCount:0.06,grassChance:0.35,flowers:['dandelion','poppy','cornflower'],creatures:STD_ANI.concat([['horse',0]]),monsters:STD_MON});
biome(4,'forest',{trees:[['oak',8],['birch',3],['fancy_oak',1]],treeCount:9,grassChance:0.12,flowers:['dandelion','poppy'],creatures:STD_ANI,monsters:STD_MON});
biome(5,'birch_forest',{grass:[0x88,0xbb,0x67],foliage:[0x6b,0xa9,0x41],trees:[['birch',1]],treeCount:9,grassChance:0.12,flowers:['allium','dandelion'],creatures:STD_ANI,monsters:STD_MON});
biome(6,'taiga',{temp:0.25,grass:[0x86,0xb7,0x83],foliage:[0x68,0xa4,0x64],trees:[['spruce',1]],treeCount:8,grassChance:0.15,creatures:STD_ANI,monsters:STD_MON,podzol:true});
biome(7,'snowy_plains',{temp:0,grass:[0x80,0xb4,0x97],foliage:[0x60,0xa1,0x7b],trees:[['spruce',1]],treeCount:0.15,grassChance:0.02,precip:'snow',snowTop:true,creatures:[['rabbit',0]],monsters:STD_MON.concat([['stray',0]])});
biome(8,'snowy_taiga',{temp:-0.5,grass:[0x80,0xb4,0x97],foliage:[0x60,0xa1,0x7b],trees:[['spruce',1]],treeCount:7,grassChance:0.05,precip:'snow',snowTop:true,creatures:STD_ANI,monsters:STD_MON});
biome(9,'jungle',{temp:0.95,rain:0.9,grass:[0x59,0xc9,0x3c],foliage:[0x30,0xbb,0x0b],trees:[['jungle',4],['jungle_bush',5],['fancy_oak',1]],treeCount:18,grassChance:0.4,flowers:['poppy'],melons:true,creatures:[['chicken',10],['pig',6]],monsters:STD_MON});
biome(10,'savanna',{temp:2,rain:0,grass:[0xbf,0xb7,0x55],foliage:[0xae,0xa4,0x2a],trees:[['acacia',4],['oak',1]],treeCount:0.9,grassChance:0.5,precip:'none',creatures:STD_ANI,monsters:STD_MON});
biome(11,'desert',{temp:2,rain:0,top:B.SAND,filler:B.SAND,deep:B.SANDSTONE,grassChance:0,precip:'none',cactus:true,deadbush:true,monsters:[['husk',0]].concat(STD_MON)});
biome(12,'badlands',{temp:2,rain:0,top:B.RED_SAND,filler:B.RED_SAND,grass:[0x90,0x81,0x4d],foliage:[0x9e,0x81,0x4d],grassChance:0,precip:'none',deadbush:true,terracotta:true,monsters:STD_MON});
biome(13,'swamp',{rain:0.9,grass:[0x6a,0x70,0x39],foliage:[0x6a,0x70,0x39],trees:[['swamp_oak',1]],treeCount:2,grassChance:0.2,flowers:['blue_orchid'],lily:true,mushrooms:true,creatures:STD_ANI,monsters:STD_MON.concat([['slime',0]])});
biome(14,'mangrove_swamp',{temp:0.8,rain:0.9,grass:[0x6a,0x70,0x39],foliage:[0x8d,0xb1,0x27],top:B.MUD,filler:B.MUD,under:B.MUD,trees:[['mangrove',1]],treeCount:6,grassChance:0.05,lily:true,monsters:STD_MON});
biome(15,'cherry_grove',{temp:0.5,grass:[0xb6,0xdb,0x61],foliage:[0xb6,0xdb,0x61],trees:[['cherry',1]],treeCount:3,grassChance:0.4,flowers:['allium','dandelion'],creatures:[['pig',1],['rabbit',0]],monsters:STD_MON});
biome(16,'meadow',{temp:0.5,grass:[0x83,0xbb,0x6d],foliage:[0x63,0xa9,0x48],trees:[['oak',1],['birch',1]],treeCount:0.05,grassChance:0.6,flowers:['dandelion','poppy','cornflower','allium'],creatures:[['sheep',1]],monsters:STD_MON});
biome(17,'stony_peaks',{temp:1,top:B.STONE,filler:B.STONE,grassChance:0,emerald:true,monsters:STD_MON});
biome(18,'snowy_slopes',{temp:-0.3,top:B.SNOW_BLOCK,filler:B.SNOW_BLOCK,grassChance:0,precip:'snow',snowTop:true,emerald:true,monsters:STD_MON});
biome(19,'mushroom_fields',{temp:0.9,rain:1,top:B.MYCELIUM,grass:[0x55,0xc9,0x3f],foliage:[0x2b,0xbb,0x0f],trees:[['huge_red_mushroom',1],['huge_brown_mushroom',1]],treeCount:0.4,grassChance:0,mushrooms:true,creatures:[['mooshroom',0]],monsters:[]});
biome(20,'pale_garden',{temp:0.7,grass:[0x77,0x8e,0x7b],foliage:[0x87,0x8d,0x76],trees:[['pale_oak',1]],treeCount:10,grassChance:0.2,paleMoss:true,creatures:[],monsters:STD_MON});
biome(21,'river',{grassChance:0,under:B.SAND,monsters:STD_MON});
biome(22,'frozen_ocean',{temp:0,precip:'snow',grassChance:0,under:B.GRAVEL,frozen:true,monsters:STD_MON});
// Nether
const NETH_MON=[['zombified_piglin',100],['ghast',6]];
biome(32,'nether_wastes',{dim:1,top:B.NETHERRACK,filler:B.NETHERRACK,precip:'none',monsters:NETH_MON.concat([['magma_cube',2]])});
biome(33,'soul_sand_valley',{dim:1,top:B.SOUL_SAND,filler:B.SOUL_SOIL,precip:'none',monsters:[['skeleton',20],['ghast',50]]});
biome(34,'crimson_forest',{dim:1,top:B.CRIMSON_NYLIUM,filler:B.NETHERRACK,precip:'none',trees:[['crimson_fungus',1]],treeCount:6,monsters:[['zombified_piglin',60],['hoglin',0]]});
biome(35,'warped_forest',{dim:1,top:B.WARPED_NYLIUM,filler:B.NETHERRACK,precip:'none',trees:[['warped_fungus',1]],treeCount:6,monsters:[['enderman',1]]});
biome(36,'basalt_deltas',{dim:1,top:B.BASALT,filler:B.BLACKSTONE,precip:'none',monsters:[['magma_cube',100],['ghast',40]]});
biome(40,'the_end',{dim:2,top:B.END_STONE,filler:B.END_STONE,precip:'none',monsters:[['enderman',10]]});
const DIMS=[{id:0,key:'overworld',name:'Overworld',height:256,sky:true,fixedTime:false,ceiling:false,lavaSpeed:30,scale:1,bedWorks:true,waterEvaporates:false},
  {id:1,key:'nether',name:'The Nether',height:128,sky:false,fixedTime:true,ceiling:true,lavaSpeed:10,scale:8,bedWorks:false,waterEvaporates:true,ambient:0.3,fog:[0.23,0.05,0.04]},
  {id:2,key:'end',name:'The End',height:256,sky:false,fixedTime:true,ceiling:false,lavaSpeed:30,scale:1,bedWorks:false,waterEvaporates:false,ambient:0.35,fog:[0.06,0.04,0.08]}];

/* ---------------- tree / feature generators ---------------- */
// put(x,y,z,v,mode): mode 0 = only into air/replaceable, 1 = force, 2 = air or leaves
const LEAF=(id)=>id|(1<<9); // distance 1 (bits 1-3 of state) -> state value 2
function blob(put,x,y,z,r,leaf,rng,corners){
  for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){if(Math.abs(dx)===r&&Math.abs(dz)===r&&(!corners||rng()<0.5))continue;put(x+dx,y,z+dz,leaf,0);}
}
const TREES={
  oak(r,x,y,z,put,wood=0,hmin=4){const h=hmin+((r()*3)|0),log=WOOD_LOG[wood],lf=LEAF(WOOD_LEAVES[wood]);put(x,y,z,B.DIRT,1);
    for(let yy=y+h-2;yy<=y+h+1;yy++)blob(put,x,yy,z,yy>=y+h?1:2,lf,r,true);for(let i=1;i<=h;i++)put(x,y+i,z,log,1);return true;},
  birch(r,x,y,z,put){return TREES.oak(r,x,y,z,put,1,5);},
  swamp_oak(r,x,y,z,put){TREES.oak(r,x,y,z,put,0,4);const lf=LEAF(B.OAK_LEAVES);for(let i=0;i<8;i++){const dx=((r()*7)|0)-3,dz=((r()*7)|0)-3;
    for(let k=0;k<3;k++)put(x+dx,y+3-k,z+dz,V(B.VINE,dx<0?2:8),0);}void lf;return true;},
  fancy_oak(r,x,y,z,put){const h=6+((r()*4)|0),log=B.OAK_LOG,lf=LEAF(B.OAK_LEAVES);put(x,y,z,B.DIRT,1);
    for(let dy=-2;dy<=2;dy++){const rad=dy===2?1:(Math.abs(dy)===2?2:3);for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++)if(dx*dx+dz*dz<=rad*rad+1)put(x+dx,y+h+dy,z+dz,lf,0);}
    for(let i=1;i<=h;i++)put(x,y+i,z,log,1);
    for(let b=0;b<3;b++){const dx=((r()*3)|0)-1,dz=((r()*3)|0)-1;if(dx||dz)put(x+dx,y+h-1,z+dz,V(log,dx?1:2),1);}return true;},
  spruce(r,x,y,z,put){const h=6+((r()*4)|0),lf=LEAF(B.SPRUCE_LEAVES);put(x,y,z,B.DIRT,1);let rad=0;
    for(let yy=y+h+1;yy>=y+2;yy--){const rr=yy>=y+h?(yy===y+h+1?0:1):rad;blob(put,x,yy,z,rr,lf,r,false);rad=rad>=2?1:rad+1;if(yy<y+h-3&&rad===1&&r()<0.4)rad=3;}
    for(let i=1;i<=h;i++)put(x,y+i,z,B.SPRUCE_LOG,1);return true;},
  jungle(r,x,y,z,put){const h=8+((r()*6)|0),lf=LEAF(B.JUNGLE_LEAVES);put(x,y,z,B.DIRT,1);
    for(let yy=y+h-2;yy<=y+h+1;yy++)blob(put,x,yy,z,yy>=y+h?2:3,lf,r,true);
    for(let i=1;i<=h;i++){put(x,y+i,z,B.JUNGLE_LOG,1);if(r()<0.3){const f=(r()*4)|0,[dx,dz]=HVEC[f];put(x+dx,y+i,z+dz,V(B.VINE,1<<((f+2)&3)),0);}}
    for(let k=0;k<6;k++){const f=(r()*4)|0,[dx,dz]=HVEC[f],d=3+((r()*1)|0);for(let j=0;j<3;j++)put(x+dx*d,y+h-3-j,z+dz*d,V(B.VINE,1<<((f+2)&3)),0);}return true;},
  jungle_bush(r,x,y,z,put){const lf=LEAF(B.OAK_LEAVES);put(x,y+1,z,B.JUNGLE_LOG,1);blob(put,x,y+1,z,2,lf,r,true);blob(put,x,y+2,z,1,lf,r,true);put(x,y+3,z,lf,0);return true;},
  acacia(r,x,y,z,put){const h=5+((r()*3)|0),lf=LEAF(B.ACACIA_LEAVES);put(x,y,z,B.DIRT,1);let cx=x,cz=z;const f=(r()*4)|0,[dx,dz]=HVEC[f];
    for(let i=1;i<=h;i++){if(i>h-3){cx+=dx;cz+=dz;}put(cx,y+i,cz,B.ACACIA_LOG,1);}
    blob(put,cx,y+h+1,cz,3,lf,r,false);blob(put,cx,y+h+2,cz,1,lf,r,false);
    for(let dx2=-2;dx2<=2;dx2++)for(let dz2=-2;dz2<=2;dz2++)if(Math.abs(dx2)+Math.abs(dz2)<=3)put(cx+dx2,y+h+2,cz+dz2,lf,0);return true;},
  cherry(r,x,y,z,put){const h=5+((r()*3)|0),lf=LEAF(B.CHERRY_LEAVES);put(x,y,z,B.DIRT,1);let cx=x,cz=z;const f=(r()*4)|0,[dx,dz]=HVEC[f];
    for(let i=1;i<=h;i++){if(i===h-1){cx+=dx;cz+=dz;}put(cx,y+i,cz,B.CHERRY_LOG,1);}
    for(let dy=-1;dy<=2;dy++){const rad=dy===2?2:(dy===-1?3:4);for(let a=-rad;a<=rad;a++)for(let b2=-rad;b2<=rad;b2++)if(a*a+b2*b2<=rad*rad&&!(dy===-1&&r()<0.4))put(cx+a,y+h+dy,cz+b2,lf,0);}return true;},
  pale_oak(r,x,y,z,put){const h=6+((r()*3)|0),lf=LEAF(B.PALE_OAK_LEAVES);put(x,y,z,B.DIRT,1);
    for(let dy=-2;dy<=1;dy++){const rad=dy===1?2:3;for(let a=-rad;a<=rad;a++)for(let b2=-rad;b2<=rad;b2++)if(a*a+b2*b2<=rad*rad+1)put(x+a,y+h+dy,z+b2,lf,0);}
    for(let i=1;i<=h;i++)put(x,y+i,z,B.PALE_OAK_LOG,1);
    for(let k=0;k<5;k++){const a=((r()*5)|0)-2,b2=((r()*5)|0)-2;put(x+a,y+h-3,z+b2,V(B.VINE,1),0);}return true;},
  mangrove(r,x,y,z,put){const h=5+((r()*3)|0),lf=LEAF(B.MANGROVE_LEAVES);
    for(const [dx,dz] of HVEC){put(x+dx,y+1,z+dz,B.MANGROVE_LOG,1);put(x+dx,y,z+dz,B.MANGROVE_LOG,1);}
    for(let i=1;i<=h;i++)put(x,y+i,z,B.MANGROVE_LOG,1);
    for(let yy=y+h-1;yy<=y+h+1;yy++)blob(put,x,yy,z,yy===y+h+1?1:3,lf,r,true);return true;},
  huge_red_mushroom(r,x,y,z,put){const h=4+((r()*3)|0);for(let i=1;i<=h;i++)put(x,y+i,z,B.MUSHROOM_STEM,1);
    for(let dy=-2;dy<=0;dy++){const rad=dy===0?1:2;for(let a=-rad;a<=rad;a++)for(let b2=-rad;b2<=rad;b2++){if(dy<0&&Math.abs(a)<rad&&Math.abs(b2)<rad)continue;put(x+a,y+h+1+dy,z+b2,B.RED_MUSHROOM_BLOCK,0);}}
    put(x,y+h+1,z,B.RED_MUSHROOM_BLOCK,1);return true;},
  huge_brown_mushroom(r,x,y,z,put){const h=4+((r()*3)|0);for(let i=1;i<=h;i++)put(x,y+i,z,B.MUSHROOM_STEM,1);
    for(let a=-3;a<=3;a++)for(let b2=-3;b2<=3;b2++)if(!(Math.abs(a)===3&&Math.abs(b2)===3))put(x+a,y+h+1,z+b2,B.BROWN_MUSHROOM_BLOCK,0);return true;},
  crimson_fungus(r,x,y,z,put){return fungus(r,x,y,z,put,B.CRIMSON_STEM,B.NETHER_WART_BLOCK);},
  warped_fungus(r,x,y,z,put){return fungus(r,x,y,z,put,B.WARPED_STEM,B.WARPED_WART_BLOCK);},
};
function fungus(r,x,y,z,put,stem,wart){const h=4+((r()*5)|0);for(let i=1;i<=h;i++)put(x,y+i,z,stem,1);
  for(let dy=-2;dy<=1;dy++){const rad=dy===1?1:2;for(let a=-rad;a<=rad;a++)for(let b2=-rad;b2<=rad;b2++){if(dy<1&&Math.abs(a)<rad&&Math.abs(b2)<rad&&dy<0)continue;
    put(x+a,y+h+dy,z+b2,r()<0.08?B.SHROOMLIGHT:wart,0);}}return true;}
function pickWeighted(list,rv){let tot=0;for(const e of list)tot+=e[1];let t=rv*tot;for(const e of list){t-=e[1];if(t<=0)return e[0];}return list[list.length-1][0];}

/* ---------------- generators ---------------- */
const SEA=62;
function makeGenerator(seed,dim){
  if(dim===1)return makeNether(seed);
  if(dim===2)return makeEnd(seed);
  return makeOverworld(seed);
}
function orePass(data,ro,type,count,size,ymin,ymax,host){
  for(let n=0;n<count;n++){
    let x=(ro()*16)|0,y=ymin+(((ro()+ro())/2*(ymax-ymin))|0),z=(ro()*16)|0;
    for(let k=0;k<size;k++){
      if(x>=0&&x<16&&z>=0&&z<16&&y>0&&y<255){const idx=(x*16+z)*256+y;if(data[idx]===host)data[idx]=type;}
      const r=ro();if(r<0.33)x+=ro()<0.5?-1:1;else if(r<0.66)y+=ro()<0.5?-1:1;else z+=ro()<0.5?-1:1;
    }
  }
}
function makeOverworld(seed){
  const nC=makeNoise(seed^0x51ed),nE=makeNoise(seed+17),nW=makeNoise(seed*3+5),nT=makeNoise(seed+99),nH=makeNoise(seed+123),
    nD=makeNoise(seed+1234),nR=makeNoise(seed+777),nDet=makeNoise(seed+4242),nEnt=makeNoise(seed+31337),nM=makeNoise(seed+90210),
    nC1=makeNoise(seed+31),nC2=makeNoise(seed+57),nC3=makeNoise(seed+91),nFl=makeNoise(seed+5),nPat=makeNoise(seed+606);
  const col={h:0,b:0,river:false,entrance:false};
  function column(x,z){
    const C=fbm2(nC,x/1100,z/1100,5)*1.7,E=fbm2(nE,x/700,z/700,4)*1.7,Wn=fbm2(nW,x/520,z/520,4)*1.7;
    const Tn=fbm2(nT,x/1500,z/1500,3)*1.7+ nDet.n2(x/60,z/60)*0.04,Hn=fbm2(nH,x/1100,z/1100,3)*1.7;
    let h;
    if(C<-0.5)h=30+(C+1)*30; else if(C<-0.18)h=45+(C+0.5)/0.32*14; else if(C<-0.05)h=59+(C+0.18)/0.13*5; else h=64+Math.min(1,(C+0.05)/0.6)*18;
    const inland=smoothstep(-0.05,0.35,C),rough=smoothstep(0.6,-0.6,E);
    h+=fbm2(nD,x/95,z/95,4)*(3+11*rough)*(0.25+0.75*inland);
    const pv=1-Math.abs(3*Math.abs(Wn)-2);
    const ridge=Math.max(0,1-Math.abs(fbm2(nR,x/300,z/300,4)*1.8));
    h+=inland*rough*Math.pow(Math.max(0,pv*0.5+0.5),1.5)*ridge*ridge*150;
    let river=false;const rv=Math.abs(Wn);
    if(C>-0.1&&rv<0.055&&h<120){const t=1-rv/0.055;const target=57+(1-t)*6;if(h>target){h=h+(target-h)*smoothstep(0,0.6,t);river=t>0.35;}}
    let b;
    const mush=nM.n2(x/180,z/180);
    if(C<-0.3&&mush>0.5){h=Math.max(h,63+(mush-0.5)*55);b=19;}
    h+=nDet.n2(x/13,z/13)*1.2;
    h=Math.max(6,Math.min(230,Math.floor(h)));
    const tb=Tn<-0.45?0:(Tn<-0.15?1:(Tn<0.18?2:(Tn<0.42?3:4))),hb=Hn<-0.35?0:(Hn<-0.1?1:(Hn<0.1?2:(Hn<0.3?3:4)));
    if(b===undefined){
      if(h<SEA){b=river?21:(tb===0?22:(C<-0.5?1:0));}
      else if(river)b=21;
      else if(C<-0.05&&h<=SEA+3)b=tb===4?11:2;
      else if(h>122)b=tb<=1?18:17;
      else if(h>92)b=(tb===2&&hb>=2&&Wn>0)?15:16;
      else if(hb>=3&&h<=SEA+4&&E>0.25&&(tb===2||tb===3||tb===4))b=tb===2?13:14;
      else{
        const TAB=[[7,7,7,8,8],[3,3,4,6,6],[3,3,4,5,Wn>0.25?20:4],[10,10,4,9,9],[11,11,11,E>0.1?12:10,12]];
        b=TAB[tb][hb];
      }
    }
    col.h=h;col.b=b;col.river=river;col.entrance=nEnt.n2(x/70,z/70)>0.42&&h>SEA+3&&b!==19;
    return col;
  }
  function biomeAt(x,z){return column(x,z).b;}
  function generate(cx,cz){
    const data=new Uint16Array(65536),bio=new Uint8Array(256),hm=new Int16Array(256),ent=new Uint8Array(256),riv=new Uint8Array(256);
    const X0=cx*16,Z0=cz*16;let maxH=SEA;
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const c=column(X0+lx,Z0+lz),i=lx*16+lz;hm[i]=c.h;bio[i]=c.b;ent[i]=c.entrance?1:0;riv[i]=c.river?1:0;if(c.h>maxH)maxH=c.h;}
    const NY=(Math.min(252,maxH+4)>>2)+2;
    const g1=new Float32Array(25*NY),g2=new Float32Array(25*NY),g3=new Float32Array(25*NY);
    for(let ix=0;ix<5;ix++)for(let iz=0;iz<5;iz++)for(let iy=0;iy<NY;iy++){
      const wx=X0+ix*4,wz=Z0+iz*4,wy=iy*4,k=(ix*5+iz)*NY+iy;
      g1[k]=nC1.n3(wx/44,wy/26,wz/44);g2[k]=nC2.n3(wx/44,wy/26,wz/44);g3[k]=nC3.n3(wx/85,wy/42,wz/85);}
    function tri(g,lx,y,lz){const ix=lx>>2,iz=lz>>2,iy=y>>2,fx=(lx&3)*0.25,fz=(lz&3)*0.25,fy=(y&3)*0.25;
      const k000=(ix*5+iz)*NY+iy,k100=k000+5*NY,k010=k000+NY,k110=k100+NY;
      const a=g[k000]+(g[k100]-g[k000])*fx,b=g[k010]+(g[k110]-g[k010])*fx,c=g[k000+1]+(g[k100+1]-g[k000+1])*fx,d=g[k010+1]+(g[k110+1]-g[k010+1])*fx;
      const e=a+(b-a)*fz,f=c+(d-c)*fz;return e+(f-e)*fy;}
    const rb=mulberry32(hash(seed,cx,cz,9));
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){
      const i=lx*16+lz,h=hm[i],bi=BIOMES[bio[i]],base=i*256;
      const caveTop=ent[i]?h:h-6;
      const floorN=nFl.n2((X0+lx)/9,(Z0+lz)/9),pat=nPat.n2((X0+lx)/14,(Z0+lz)/14);
      const top=Math.max(h,SEA);
      let topB=bi.top,fill=bi.filler;
      if(h<SEA-1){topB=bi.under===B.GRAVEL?(floorN>0.2?B.GRAVEL:(floorN<-0.35?B.CLAY:B.SAND)):(floorN>0.35?B.GRAVEL:bi.under);fill=topB===B.CLAY?B.SAND:(topB===B.GRAVEL?B.GRAVEL:B.SAND);}
      else if(h<SEA+1&&bi.top===B.GRASS_BLOCK&&bio[i]!==13&&bio[i]!==14){topB=B.SAND;fill=B.SAND;}
      if(bi.podzol&&pat>0.35)topB=B.PODZOL;
      if(bi.paleMoss&&pat>0.2)topB=B.PALE_MOSS_BLOCK;
      if(bio[i]===17&&h>150&&pat>0.1)topB=B.STONE;
      if(bio[i]===18&&h>170)topB=B.PACKED_ICE;
      for(let y=0;y<=top;y++){
        let id;
        if(y===0||(y<4&&rb()<0.55-y*0.15))id=B.BEDROCK;
        else if(y<h-3)id=(bi.deep&&y>=h-8)?bi.deep:B.STONE;
        else if(y<h)id=fill;
        else if(y===h)id=topB;
        else id=B.WATER;
        if(bi.terracotta&&y>=h-14&&y<h&&y>SEA){const band=((y+Math.floor(pat*3))%7+7)%7;id=[B.TERRACOTTA,B.ORANGE_TERRACOTTA,B.RED_TERRACOTTA,B.YELLOW_TERRACOTTA,B.TERRACOTTA,B.WHITE_TERRACOTTA,B.BROWN_TERRACOTTA][band];}
        if(id!==B.BEDROCK&&id!==B.WATER&&y<=caveTop&&y>1){
          const a=tri(g1,lx,y,lz),c=tri(g2,lx,y,lz);
          let cave=a*a+c*c<0.0042;
          if(!cave&&y<48)cave=tri(g3,lx,y,lz)>0.36+(48-y)*0.002;
          if(cave)id=y<=10?B.LAVA:B.AIR;
        }
        data[base+y]=id;
      }
      if(bi.frozen&&h<SEA)data[base+SEA]=B.ICE;
    }
    const ro=mulberry32(hash(seed,cx,cz,1));
    orePass(data,ro,B.COAL_ORE,20,14,5,130,B.STONE);orePass(data,ro,B.IRON_ORE,10,8,5,72,B.STONE);orePass(data,ro,B.COPPER_ORE,7,9,20,96,B.STONE);
    orePass(data,ro,B.GOLD_ORE,4,8,5,32,B.STONE);orePass(data,ro,B.REDSTONE_ORE,7,7,5,16,B.STONE);orePass(data,ro,B.LAPIS_ORE,2,7,5,32,B.STONE);
    orePass(data,ro,B.DIAMOND_ORE,2,7,3,16,B.STONE);orePass(data,ro,B.GRAVEL,5,24,5,70,B.STONE);orePass(data,ro,B.DIRT,5,24,5,100,B.STONE);
    if(BIOMES[bio[136]].emerald)orePass(data,ro,B.EMERALD_ORE,5,1,32,120,B.STONE);
    // trees & large features from this chunk and its neighbours (features may cross chunk borders)
    const put=(x,y,z,v,mode)=>{const lx=x-X0,lz=z-Z0;if(lx<0||lx>15||lz<0||lz>15||y<1||y>254)return;
      const idx=(lx*16+lz)*256+y,cur=data[idx];
      if(mode===1||cur===0||((FLAGS[cur]&F_REPL)&&!(FLAGS[cur]&F_LIQUID))||(mode===2&&DEF[cur&255]&&DEF[cur&255].key.endsWith('leaves')))data[idx]=v;};
    for(let ncx=cx-1;ncx<=cx+1;ncx++)for(let ncz=cz-1;ncz<=cz+1;ncz++){
      const rt=mulberry32(hash(seed,ncx,ncz,2));
      const bc=BIOMES[column(ncx*16+8,ncz*16+8).b];
      if(!bc.trees.length)continue;
      let n=bc.treeCount>=1?Math.floor(bc.treeCount*(0.6+rt()*0.8)):(rt()<bc.treeCount?1:0);
      for(let t=0;t<n;t++){
        const x=ncx*16+((rt()*16)|0),z=ncz*16+((rt()*16)|0),rv=rt(),seedT=(rt()*4294967296)>>>0;
        const c=column(x,z);if(c.entrance||c.river||c.h<=SEA||c.h>200)continue;
        const bt=BIOMES[c.b];if(!bt.trees.length)continue;
        // only if the ground is the biome's natural top (not a cave mouth / structure)
        if(bt.top!==B.GRASS_BLOCK&&bt.top!==B.MYCELIUM&&bt.top!==B.MUD)continue;
        const kind=pickWeighted(bt.trees,rv);
        TREES[kind](mulberry32(seedT),x,c.h,z,put);
      }
    }
    // surface decoration (own chunk only)
    const rd=mulberry32(hash(seed,cx,cz,3));
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){
      const i=lx*16+lz,bi=BIOMES[bio[i]],base=i*256;
      let y=255;while(y>0&&data[base+y]===0)y--;
      const g=data[base+y],above=base+y+1;if(y>=254)continue;
      const r1=rd();
      if(g===B.GRASS_BLOCK||g===B.PODZOL){
        if(r1<bi.grassChance)data[above]=rd()<0.12?B.FERN:B.SHORT_GRASS;
        else if(bi.flowers.length&&r1<bi.grassChance+0.02)data[above]=B[bi.flowers[(rd()*bi.flowers.length)|0].toUpperCase()];
        else if(r1<bi.grassChance+0.021&&rd()<0.08)data[above]=V(B.PUMPKIN,(rd()*4)|0);
        else if(bi.melons&&r1<bi.grassChance+0.03)data[above]=B.MELON;
      } else if((g===B.SAND||g===B.RED_SAND)&&y>SEA){
        if(bi.cactus&&r1<0.006){const hh=1+((rd()*3)|0);for(let k=1;k<=hh;k++)data[base+y+k]=B.CACTUS;}
        else if(bi.deadbush&&r1<0.012)data[above]=B.DEAD_BUSH;
      } else if(g===B.MYCELIUM&&r1<0.03)data[above]=rd()<0.5?B.RED_MUSHROOM:B.BROWN_MUSHROOM;
      // sugar cane next to water
      if((g===B.SAND||g===B.GRASS_BLOCK||g===B.DIRT)&&y===SEA&&data[above]===0&&rd()<0.18){
        let wet=false;for(const [dx,dz] of HVEC){const nx=lx+dx,nz=lz+dz;if(nx>=0&&nx<16&&nz>=0&&nz<16&&data[(nx*16+nz)*256+y]===B.WATER)wet=true;}
        if(wet){const hh=1+((rd()*3)|0);for(let k=1;k<=hh;k++)data[base+y+k]=B.SUGAR_CANE;}
      }
      if(bi.lily&&g===B.WATER&&y===SEA&&rd()<0.04)data[above]=B.LILY_PAD;
      if(bi.mushrooms&&data[above]===0&&(g===B.GRASS_BLOCK||g===B.DIRT)&&rd()<0.01)data[above]=rd()<0.5?B.RED_MUSHROOM:B.BROWN_MUSHROOM;
      if(bi.snowTop){let yy=255;while(yy>0&&data[base+yy]===0)yy--;const tv=data[base+yy];
        if(tv&&yy<254&&(FLAGS[tv]&F_SOLID)&&(FLAGS[tv]&(F_CUBE))&&tv!==B.ICE){data[base+yy+1]=B.SNOW;if((tv&255)===B.GRASS_BLOCK)data[base+yy]=V(B.GRASS_BLOCK,1);}
        else if((tv&255)===B.SHORT_GRASS||(tv&255)===B.FERN){data[base+yy]=B.SNOW;if((data[base+yy-1]&255)===B.GRASS_BLOCK)data[base+yy-1]=V(B.GRASS_BLOCK,1);}}
    }
    placeStructures(seed,0,cx,cz,data,column);
    return {data,biomes:bio};
  }
  function findSpawn(){
    for(let r=0;r<600;r+=8)for(let a=0;a<Math.max(1,r/4);a++){
      const ang=a/Math.max(1,r/4)*Math.PI*2,x=Math.round(Math.cos(ang)*r),z=Math.round(Math.sin(ang)*r);
      const c=column(x,z);if(c.h>SEA+1&&c.h<110&&!c.river&&[3,4,5,6,10,15,16].includes(c.b))return {x,z};}
    return {x:0,z:0};
  }
  return {dim:0,generate,findSpawn,column,biomeAt,height:256};
}
function makeNether(seed){
  const nA=makeNoise(seed+1001),nB=makeNoise(seed+1002),nBio=makeNoise(seed+1003),nBio2=makeNoise(seed+1004),nF=makeNoise(seed+1005);
  function biomeAt(x,z){const a=fbm2(nBio,x/220,z/220,3)*1.7,b=fbm2(nBio2,x/220,z/220,3)*1.7;
    if(a>0.35)return b>0?34:35; if(a<-0.35)return b>0?33:36; return 32;}
  function generate(cx,cz){
    const data=new Uint16Array(65536),bio=new Uint8Array(256),X0=cx*16,Z0=cz*16;
    const NY=34;const g=new Float32Array(25*NY);
    for(let ix=0;ix<5;ix++)for(let iz=0;iz<5;iz++)for(let iy=0;iy<NY;iy++){
      const wx=X0+ix*4,wz=Z0+iz*4,wy=iy*4,k=(ix*5+iz)*NY+iy;
      let d=nA.n3(wx/70,wy/35,wz/70)*0.9+nB.n3(wx/24,wy/18,wz/24)*0.35;
      if(wy<32)d+=(32-wy)/20; if(wy>100)d+=(wy-100)/14;
      g[k]=d;}
    const tri=(lx,y,lz)=>{const ix=lx>>2,iz=lz>>2,iy=y>>2,fx=(lx&3)*0.25,fz=(lz&3)*0.25,fy=(y&3)*0.25;
      const k000=(ix*5+iz)*NY+iy,k100=k000+5*NY,k010=k000+NY,k110=k100+NY;
      const a=g[k000]+(g[k100]-g[k000])*fx,b=g[k010]+(g[k110]-g[k010])*fx,c=g[k000+1]+(g[k100+1]-g[k000+1])*fx,d=g[k010+1]+(g[k110+1]-g[k010+1])*fx;
      const e=a+(b-a)*fz,f=c+(d-c)*fz;return e+(f-e)*fy;};
    const rb=mulberry32(hash(seed,cx,cz,19));
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){
      const i=lx*16+lz,base=i*256,bb=biomeAt(X0+lx,Z0+lz),bi=BIOMES[bb];bio[i]=bb;
      for(let y=0;y<128;y++){
        let id;
        if(y===0||y===127||(y<5&&rb()<0.6-y*0.12)||(y>122&&rb()<0.6-(127-y)*0.12))id=B.BEDROCK;
        else id=tri(lx,y,lz)>0.12?B.NETHERRACK:(y<=31?B.LAVA:B.AIR);
        data[base+y]=id;
      }
      // surface rules: floor blocks under air
      for(let y=126;y>1;y--){const id=data[base+y];
        if(id===B.NETHERRACK&&data[base+y+1]===B.AIR){
          data[base+y]=bi.top;
          if(bi.top===B.SOUL_SAND||bi.top===B.BASALT){for(let k=1;k<3;k++)if(data[base+y-k]===B.NETHERRACK)data[base+y-k]=bi.filler;}
          if(bb===32&&y>31&&y<35&&nF.n2((X0+lx)/8,(Z0+lz)/8)>0.3)data[base+y]=B.GRAVEL;
        }
        if(id===B.NETHERRACK&&y>=29&&y<=33&&data[base+y+1]===B.LAVA&&rb()<0.2)data[base+y]=B.MAGMA_BLOCK;
      }
    }
    const ro=mulberry32(hash(seed,cx,cz,21));
    orePass(data,ro,B.NETHER_QUARTZ_ORE,14,10,10,117,B.NETHERRACK);orePass(data,ro,B.GOLD_ORE,6,6,10,117,B.NETHERRACK);
    orePass(data,ro,B.ANCIENT_DEBRIS,1,2,8,22,B.NETHERRACK);orePass(data,ro,B.SOUL_SAND,2,20,32,90,B.NETHERRACK);
    // glowstone clusters hanging from ceilings
    for(let n=0;n<3;n++){const x=(ro()*16)|0,z=(ro()*16)|0;const base=(x*16+z)*256;let y=120;
      while(y>40&&!(data[base+y]===B.AIR&&data[base+y+1]!==B.AIR&&data[base+y+1]!==B.LAVA))y--;
      if(y<=40)continue;let px=x,py=y,pz=z;for(let k=0;k<25;k++){if(px>=0&&px<16&&pz>=0&&pz<16&&py>1&&py<127){const idx=(px*16+pz)*256+py;if(data[idx]===B.AIR)data[idx]=B.GLOWSTONE;}
        const r=ro();if(r<0.4)py--;else if(r<0.7)px+=ro()<0.5?-1:1;else pz+=ro()<0.5?-1:1;}}
    // fungi, fire
    const put=(x,y,z,v,mode)=>{const lx=x-X0,lz=z-Z0;if(lx<0||lx>15||lz<0||lz>15||y<1||y>126)return;const idx=(lx*16+lz)*256+y;if(mode===1||data[idx]===0)data[idx]=v;};
    for(let ncx=cx-1;ncx<=cx+1;ncx++)for(let ncz=cz-1;ncz<=cz+1;ncz++){
      const rt=mulberry32(hash(seed,ncx,ncz,22));const bb=biomeAt(ncx*16+8,ncz*16+8),bi=BIOMES[bb];if(!bi.trees.length)continue;
      for(let t=0;t<bi.treeCount;t++){const x=ncx*16+((rt()*16)|0),z=ncz*16+((rt()*16)|0),y=32+((rt()*60)|0),sd=(rt()*4294967296)>>>0;
        // find floor by sampling the density function directly (deterministic across chunks)
        if(ncx===cx&&ncz===cz){const base=((x-X0)*16+(z-Z0))*256;let yy=y;while(yy<120&&data[base+yy]!==B.AIR)yy++;while(yy>32&&data[base+yy-1]===B.AIR)yy--;
          if(data[base+yy-1]===bi.top&&data[base+yy]===B.AIR)TREES[bi.trees[0][0]](mulberry32(sd),x,yy-1,z,put);}
      }
    }
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const base=(lx*16+lz)*256;
      for(let y=33;y<120;y++)if(data[base+y]===B.AIR&&data[base+y-1]===B.NETHERRACK&&ro()<0.003)data[base+y]=B.FIRE;}
    placeStructures(seed,1,cx,cz,data,null);
    return {data,biomes:bio};
  }
  return {dim:1,generate,findSpawn:()=>({x:0,z:0}),column:(x,z)=>({h:64,b:biomeAt(x,z)}),biomeAt,height:128};
}
function endPillars(seed){
  const r=mulberry32(hash(seed,0,0,77)),out=[];const idx=[0,1,2,3,4,5,6,7,8,9];
  for(let i=9;i>0;i--){const j=(r()*(i+1))|0;[idx[i],idx[j]]=[idx[j],idx[i]];}
  for(let i=0;i<10;i++){const a=2*Math.PI*i/10;out.push({x:Math.round(42*Math.cos(a)),z:Math.round(42*Math.sin(a)),rad:2+(idx[i]/3|0),h:76+idx[i]*3,caged:idx[i]<2});}
  return out;
}
function makeEnd(seed){
  const nA=makeNoise(seed+2001);const pillars=endPillars(seed);
  function height(x,z){const d=Math.hypot(x,z);if(d>95)return null;const f=1-d/95;return {top:Math.floor(56+f*8+nA.n2(x/20,z/20)*3),bot:Math.floor(56-8-f*40+nA.n2(x/15+9,z/15)*4)};}
  function generate(cx,cz){
    const data=new Uint16Array(65536),bio=new Uint8Array(256).fill(40),X0=cx*16,Z0=cz*16;
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const x=X0+lx,z=Z0+lz,h=height(x,z);if(!h)continue;const base=(lx*16+lz)*256;
      for(let y=Math.max(1,h.bot);y<=h.top;y++)data[base+y]=B.END_STONE;}
    for(const p of pillars)for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const x=X0+lx,z=Z0+lz,dx=x-p.x,dz=z-p.z;if(dx*dx+dz*dz>p.rad*p.rad+1)continue;
      const base=(lx*16+lz)*256;for(let y=50;y<=p.h;y++)data[base+y]=B.OBSIDIAN;if(dx===0&&dz===0)data[base+p.h+1]=B.BEDROCK;}
    // exit portal frame (bedrock fountain) at the origin
    for(let lx=0;lx<16;lx++)for(let lz=0;lz<16;lz++){const x=X0+lx,z=Z0+lz,d2=x*x+z*z;if(d2>16)continue;const base=(lx*16+lz)*256,y0=65;
      if(d2<=9){data[base+y0-1]=B.BEDROCK;}else data[base+y0]=B.BEDROCK;
      if(x===0&&z===0)for(let k=0;k<4;k++)data[base+y0+k]=B.BEDROCK;}
    return {data,biomes:bio};
  }
  return {dim:2,generate,findSpawn:()=>({x:100,z:0}),column:(x,z)=>{const h=height(x,z);return {h:h?h.top:0,b:40};},biomeAt:()=>40,height:256,pillars};
}

/* ---------------- edit codec (4 bytes per edited voxel: idx u16, voxel u16) ---------------- */
function encodeEdits(m){const b=new Uint8Array(m.size*4);let i=0;for(const [idx,v] of m){b[i++]=idx&255;b[i++]=idx>>8;b[i++]=v&255;b[i++]=v>>8;}return b;}
function decodeEdits(b,m){m=m||new Map();if(!(b instanceof Uint8Array))throw new Error('bad edit buffer');
  for(let i=0;i+3<b.length;i+=4){const idx=b[i]|(b[i+1]<<8),v=b[i+2]|(b[i+3]<<8);if(DEF[v&255])m.set(idx,v);else m.set(idx,0);}return m;}
function b64enc(bytes){let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(s);}
function b64dec(str){const s=atob(str),b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i);return b;}
