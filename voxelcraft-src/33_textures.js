/* =====================================================================
   PROCEDURAL TEXTURES — 16x16 tiles for blocks (texture array A) and items
   (texture array B). A 512x512 atlas canvas is also built for UI icons.
   ===================================================================== */
const TEX=(()=>{
  const N=16;
  const newTile=()=>new Uint8ClampedArray(N*N*4);
  let rs=1;const rnd=()=>{rs=(rs*16807)%2147483647;return rs/2147483647;};
  const seedFor=name=>{let h=2166136261;for(let i=0;i<name.length;i++)h=Math.imul(h^name.charCodeAt(i),16777619);rs=(h>>>1)%2147483646+1;};
  const set=(t,x,y,r,g,b,a=255)=>{if(x<0||y<0||x>15||y>15)return;const i=(y*16+x)*4;t[i]=r;t[i+1]=g;t[i+2]=b;t[i+3]=a;};
  const get=(t,x,y)=>{const i=((y&15)*16+(x&15))*4;return [t[i],t[i+1],t[i+2],t[i+3]];};
  const fill=(t,c,v=20,a=255)=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const k=(rnd()-0.5)*v;set(t,x,y,c[0]+k,c[1]+k,c[2]+k,a);}};
  const clear=t=>t.fill(0);
  const speck=(t,n,c,v=12)=>{for(let i=0;i<n;i++){const k=(rnd()-0.5)*v;set(t,(rnd()*16)|0,(rnd()*16)|0,c[0]+k,c[1]+k,c[2]+k);}};
  const blotch=(t,n,c,sz=2)=>{for(let i=0;i<n;i++){const cx=rnd()*16,cy=rnd()*16;for(let k=0;k<sz*3;k++)set(t,(cx+(rnd()-0.5)*sz*2)|0,(cy+(rnd()-0.5)*sz*2)|0,...c.map(v=>v+(rnd()-0.5)*14));}};
  const copy=(d,s)=>d.set(s);
  const T={}; // name -> tile
  const def=(name,fn)=>{seedFor(name);const t=newTile();fn(t);T[name]=t;return t;};
  const base=name=>T[name];
  // ---------- stone family ----------
  def('stone',t=>{fill(t,[126,126,126],24);blotch(t,6,[104,104,104],1);});
  def('cobblestone',t=>voronoi(t,[122,122,122],40,[70,70,70]));
  def('mossy_cobblestone',t=>{copy(t,base('cobblestone'));blotch(t,10,[74,110,52],2);});
  def('stone_bricks',t=>bricksT(t,[122,122,122],[82,82,82],8,16));
  def('bricks',t=>bricksT(t,[150,74,60],[180,170,160],4,8,24));
  def('bedrock',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const r=rnd(),v=r<0.3?42:(r<0.7?86:140),k=(rnd()-0.5)*14;set(t,x,y,v+k,v+k,v+k);}});
  def('obsidian',t=>{fill(t,[22,16,34],10);blotch(t,6,[48,30,70],1);});
  def('crying_obsidian',t=>{copy(t,base('obsidian'));blotch(t,5,[120,40,220],1);});
  def('dirt',t=>{fill(t,[134,96,67],26);speck(t,22,[106,76,52]);});
  def('grass_top',t=>{fill(t,[150,150,150],34);speck(t,30,[120,120,120]);}); // tinted per biome (grey base)
  def('grass_side',t=>{copy(t,base('dirt'));for(let x=0;x<16;x++){const d=3+((rnd()*2.4)|0);for(let y=0;y<d;y++){const k=(rnd()-0.5)*26;set(t,x,y,94+k,152+k,54+k);}}});
  def('snowy_grass_side',t=>{copy(t,base('dirt'));for(let x=0;x<16;x++){const d=3+((rnd()*2.4)|0);for(let y=0;y<d;y++){const k=(rnd()-0.5)*10;set(t,x,y,238+k,246+k,250+k);}}});
  def('podzol_top',t=>{fill(t,[106,72,36],30);speck(t,20,[82,56,30]);speck(t,10,[70,100,40]);});
  def('podzol_side',t=>{copy(t,base('dirt'));for(let x=0;x<16;x++)for(let y=0;y<3;y++){const k=(rnd()-0.5)*20;set(t,x,y,106+k,72+k,36+k);}});
  def('mycelium_top',t=>{fill(t,[112,98,112],26);speck(t,20,[140,124,140]);});
  def('mycelium_side',t=>{copy(t,base('dirt'));for(let x=0;x<16;x++){const d=2+((rnd()*2)|0);for(let y=0;y<d;y++){const k=(rnd()-0.5)*16;set(t,x,y,112+k,98+k,112+k);}}});
  def('sand',t=>{fill(t,[218,206,160],16);speck(t,14,[196,184,140]);});
  def('red_sand',t=>{fill(t,[190,102,33],18);speck(t,14,[160,84,26]);});
  def('gravel',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const r=rnd(),k=(rnd()-0.5)*18;
    if(r<0.3)set(t,x,y,92+k,86+k,84+k);else if(r<0.6)set(t,x,y,152+k,144+k,140+k);else set(t,x,y,124+k,116+k,112+k);}});
  def('clay',t=>{fill(t,[160,166,178],10);});
  def('mud',t=>{fill(t,[60,57,60],12);speck(t,10,[76,70,70]);});
  def('sandstone_top',t=>fill(t,[216,202,150],10));
  def('sandstone_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const band=y<3?-10:(y>12?-18:(y===8?-8:0)),k=(rnd()-0.5)*10;set(t,x,y,214+band+k,198+band+k,146+band+k);}});
  const terr=(n,c)=>def(n,t=>{fill(t,c,12);});
  terr('terracotta',[152,94,67]);terr('terracotta_red',[143,61,46]);terr('terracotta_orange',[161,83,37]);terr('terracotta_yellow',[186,133,35]);
  terr('terracotta_white',[209,178,161]);terr('terracotta_brown',[77,51,35]);
  // ---------- ores & mineral blocks ----------
  const ore=(n,c,host='stone')=>def(n,t=>{copy(t,base(host));for(let k=0;k<5;k++){const cx=2+rnd()*12,cy=2+rnd()*12;
    for(let j=0;j<4;j++){const x=(cx+(rnd()-0.5)*3)|0,y=(cy+(rnd()-0.5)*3)|0,v=(rnd()-0.5)*40;set(t,x,y,c[0]+v,c[1]+v,c[2]+v);set(t,x+1,y,c[0]+v*0.5,c[1]+v*0.5,c[2]+v*0.5);}}});
  ore('coal_ore',[34,34,34]);ore('iron_ore',[216,175,147]);ore('gold_ore',[250,220,70]);ore('diamond_ore',[96,226,232]);ore('redstone_ore',[210,20,20]);
  ore('lapis_ore',[30,70,190]);ore('emerald_ore',[40,200,90]);ore('copper_ore',[200,110,70]);
  const mineral=(n,c,edge)=>def(n,t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const e=x===0||y===0||x===15||y===15,k=(rnd()-0.5)*12-(x+y)*0.6;
    const cc=e?edge:c;set(t,x,y,cc[0]+k,cc[1]+k,cc[2]+k);}});
  mineral('coal_block',[26,26,28],[16,16,18]);mineral('iron_block',[224,224,228],[170,170,176]);mineral('gold_block',[252,220,76],[210,160,30]);
  mineral('diamond_block',[110,236,226],[50,170,160]);mineral('redstone_block',[176,24,10],[120,14,6]);mineral('lapis_block',[34,72,170],[24,48,120]);
  mineral('emerald_block',[50,210,100],[20,150,60]);mineral('copper_block',[196,106,76],[150,80,56]);
  // ---------- wood ----------
  const WOODC={oak:[[184,146,90],[104,82,50],[150,118,72]],birch:[[216,200,150],[220,220,210],[196,180,130]],spruce:[[112,82,50],[64,46,28],[98,72,44]],
    jungle:[[168,120,82],[86,68,30],[150,106,70]],acacia:[[172,92,50],[106,98,92],[150,80,44]],cherry:[[226,178,170],[56,26,40],[206,158,150]],
    pale_oak:[[226,214,210],[106,100,96],[206,196,190]],mangrove:[[118,54,48],[86,68,46],[102,46,40]]};
  for(const w in WOODC){const [pl,bark,ring]=WOODC[w];
    def(w+'_log',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%4===0?-22:0)+(rnd()-0.5)*18;
      if(w==='birch'){const dark=rnd()<0.08||((y*7+x*3)%23===0);set(t,x,y,dark?40:bark[0]+s*0.3,dark?40:bark[1]+s*0.3,dark?40:bark[2]+s*0.3);}
      else set(t,x,y,bark[0]+s,bark[1]+s,bark[2]+s);}});
    def(w+'_log_top',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));
      if(d>6.6)set(t,x,y,bark[0],bark[1],bark[2]);else{const r=(Math.floor(d)%2)?-18:0,k=(rnd()-0.5)*10;set(t,x,y,ring[0]+r+k,ring[1]+r+k,ring[2]+r+k);}}});
    def(w+'_planks',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const seam=(y%4===3)||(x===((y>>2)%2?4:11));const k=(rnd()-0.5)*14;
      if(seam)set(t,x,y,pl[0]*0.68,pl[1]*0.68,pl[2]*0.68);else set(t,x,y,pl[0]+k,pl[1]+k,pl[2]+k);}});
  }
  const LEAFC={oak:[150,150,150],birch:[150,150,150],spruce:[150,150,150],jungle:[150,150,150],acacia:[150,150,150],cherry:[236,170,200],pale_oak:[160,166,150],mangrove:[150,150,150]};
  for(const w in LEAFC)def(w+'_leaves',t=>{const c=LEAFC[w];for(let y=0;y<16;y++)for(let x=0;x<16;x++){const k=(rnd()-0.5)*56;
    if(rnd()<0.18)set(t,x,y,c[0]*0.6,c[1]*0.6,c[2]*0.6,0);else set(t,x,y,c[0]+k*0.8,c[1]+k,c[2]+k*0.8);}});
  const SAPC={oak:[70,130,40],birch:[110,150,60],spruce:[50,90,50],jungle:[60,140,30],acacia:[120,140,40],cherry:[230,160,190],pale_oak:[160,166,150],mangrove:[80,120,40]};
  for(const w in SAPC)def(w+'_sapling',t=>{clear(t);const c=SAPC[w];for(let y=8;y<16;y++)set(t,7+(y>12?0:0),y,110,82,46);
    for(let i=0;i<40;i++){const a=rnd()*6.28,r=rnd()*5;const x=(7.5+Math.cos(a)*r)|0,y=(6+Math.sin(a)*r*0.9)|0;const k=(rnd()-0.5)*30;set(t,x,y,c[0]+k,c[1]+k,c[2]+k);}});
  // ---------- misc blocks ----------
  def('glass',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const e=x===0||y===0||x===15||y===15,st=(x-y===4||x-y===5||x-y===-7);set(t,x,y,e?200:230,e?225:245,e?230:255,e?255:(st?140:0));}});
  def('ice',t=>{fill(t,[140,180,250],16,190);for(let i=0;i<5;i++){const y=(rnd()*16)|0;for(let x=0;x<16;x++)if(rnd()<0.5)set(t,x,y,200,225,255,200);}});
  def('packed_ice',t=>{fill(t,[150,182,240],12);});
  def('snow',t=>fill(t,[240,248,252],10));
  def('water',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const w=Math.sin((x+y*0.5)*0.8)*10+(rnd()-0.5)*12;set(t,x,y,46+w,96+w,210+w,170);}});
  def('lava',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const w=Math.sin(x*0.9+Math.cos(y*0.7)*2)*0.5+0.5,k=rnd()*25;set(t,x,y,210+w*45,70+w*110+k,10+k*0.5);}});
  def('crafting_table_top',t=>{copy(t,base('oak_planks'));for(let i=2;i<14;i++){set(t,i,2,80,56,30);set(t,i,13,80,56,30);set(t,2,i,80,56,30);set(t,13,i,80,56,30);set(t,i,7,90,62,34);set(t,7,i,90,62,34);}});
  def('crafting_table_side',t=>{copy(t,base('oak_planks'));for(let x=3;x<13;x++){set(t,x,4,70,70,74);set(t,x,5,120,120,126);}for(let y=6;y<11;y++){set(t,4,y,96,70,40);set(t,11,y,150,150,150);}});
  def('crafting_table_front',t=>{copy(t,base('oak_planks'));for(let x=3;x<13;x++)set(t,x,4,150,150,150);for(let y=4;y<12;y++){set(t,7,y,96,70,40);}for(let x=5;x<10;x++)set(t,x,5,120,120,126);});
  def('furnace_side',t=>{copy(t,base('stone'));for(let x=0;x<16;x++){set(t,x,0,90,90,90);set(t,x,15,90,90,90);}});
  def('furnace_top',t=>{copy(t,base('stone'));for(let i=0;i<16;i++){set(t,i,0,96,96,96);set(t,i,15,96,96,96);set(t,0,i,96,96,96);set(t,15,i,96,96,96);}});
  def('furnace_front',t=>{copy(t,base('furnace_side'));for(let x=3;x<13;x++)for(let y=8;y<13;y++)set(t,x,y,30,30,30);for(let x=4;x<12;x++)set(t,x,3,70,70,70);});
  def('furnace_front_on',t=>{copy(t,base('furnace_front'));for(let x=4;x<12;x++)for(let y=9;y<13;y++){const k=rnd();set(t,x,y,255,120+k*120,20);}});
  def('chest_top',t=>{fill(t,[160,112,44],14);for(let i=0;i<16;i++){set(t,i,0,70,46,20);set(t,i,15,70,46,20);set(t,0,i,70,46,20);set(t,15,i,70,46,20);}});
  def('chest_side',t=>{copy(t,base('chest_top'));for(let x=0;x<16;x++)set(t,x,5,70,46,20);});
  def('chest_front',t=>{copy(t,base('chest_side'));for(let x=7;x<9;x++)for(let y=4;y<8;y++)set(t,x,y,200,200,210);});
  def('bookshelf',t=>{copy(t,base('oak_planks'));const cols=[[160,40,40],[40,70,160],[50,130,50],[170,140,60],[110,40,120]];
    for(const row of [1,9])for(let x=1;x<15;x++){const c=cols[(rnd()*5)|0];for(let y=row;y<row+6;y++)set(t,x,y,c[0]*(0.8+rnd()*0.3),c[1]*(0.8+rnd()*0.3),c[2]);}});
  def('tnt_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const band=y>=5&&y<=10;const k=(rnd()-0.5)*20;
    if(band)set(t,x,y,230,230,220);else set(t,x,y,200+k,40,30);}for(let x=4;x<12;x++){set(t,x,7,30,30,30);}set(t,5,8,30,30,30);set(t,8,8,30,30,30);set(t,11,8,30,30,30);});
  def('tnt_top',t=>{fill(t,[200,40,30],20);for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,60,60,60);});
  def('tnt_bottom',t=>fill(t,[200,40,30],20));
  def('pumpkin_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%4===0)?-30:0,k=(rnd()-0.5)*14;set(t,x,y,220+s+k,130+s+k,20);}});
  def('pumpkin_top',t=>{copy(t,base('pumpkin_side'));for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,90,110,40);});
  def('pumpkin_face',t=>{copy(t,base('pumpkin_side'));for(const [x,y] of [[4,5],[5,5],[10,5],[11,5],[4,6],[11,6]])set(t,x,y,40,20,0);for(let x=3;x<13;x++)set(t,x,10,40,20,0);for(let x=4;x<12;x++)set(t,x,11,40,20,0);});
  def('melon_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%4<2)?-26:0,k=(rnd()-0.5)*14;set(t,x,y,110+s+k,160+s+k,40);}});
  def('melon_top',t=>{fill(t,[110,150,40],18);});
  def('hay_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const k=(rnd()-0.5)*30,b=(y===3||y===12)?-60:0;set(t,x,y,200+k+b,170+k+b,40);}});
  def('hay_top',t=>{fill(t,[190,160,40],30);});
  def('white_wool',t=>{fill(t,[234,236,236],14);for(let i=0;i<30;i++)set(t,(rnd()*16)|0,(rnd()*16)|0,210,212,212);});
  def('slime',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const e=x<2||y<2||x>13||y>13;set(t,x,y,110,190,90,e?230:150);}});
  def('honey',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const e=x<1||y<1||x>14||y>14;set(t,x,y,240,170,30,e?240:180);}});
  def('spawner',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const bar=x%4===0||y%4===0;set(t,x,y,bar?30:0,bar?40:0,bar?60:0,bar?255:0);}});
  def('farmland_dry',t=>{fill(t,[112,76,48],16);for(let y=0;y<16;y+=4)for(let x=0;x<16;x++)set(t,x,y,86,58,36);});
  def('farmland_wet',t=>{fill(t,[72,44,24],12);for(let y=0;y<16;y+=4)for(let x=0;x<16;x++)set(t,x,y,52,30,16);});
  // crops (transparent)
  for(let s=0;s<8;s++)def('wheat_'+s,t=>{clear(t);const h=2+s*1.7;for(let x=1;x<16;x+=3)for(let y=15;y>15-h;y--){const ripe=s===7;set(t,x,y,ripe?200:60+s*10,ripe?170:150,ripe?60:40);
    if(y<16-h+2&&s>4)set(t,x+1,y,ripe?220:120,ripe?180:150,40);}});
  for(let s=0;s<4;s++){def('carrots_'+s,t=>{clear(t);for(let x=2;x<15;x+=4)for(let y=15;y>13-s*3;y--)set(t,x,y,50,150,40);if(s===3)for(let x=2;x<15;x+=4){set(t,x,15,240,130,20);set(t,x+1,15,240,130,20);}});
    def('potatoes_'+s,t=>{clear(t);for(let x=2;x<15;x+=4)for(let y=15;y>13-s*3;y--)set(t,x,y,60,140,40);if(s===3)for(let x=2;x<15;x+=4){set(t,x,14,200,170,90);set(t,x+1,15,200,170,90);}});}
  def('sugar_cane',t=>{clear(t);for(const x0 of [3,8,12])for(let y=0;y<16;y++){const joint=y%5===0;set(t,x0,y,joint?150:170,joint?190:210,joint?110:130);set(t,x0+1,y,140,190,110);}});
  def('cactus_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%5===0)?-25:0,k=(rnd()-0.5)*16;if(x===0||x===15){set(t,x,y,0,0,0,0);continue;}
    if((x%5===2)&&(y%4===1))set(t,x,y,30,40,20);else set(t,x,y,62+s+k,128+s+k,44+s+k);}});
  def('cactus_top',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5)),k=(rnd()-0.5)*12;set(t,x,y,d>6.5?50:90+k,d>6.5?100:150+k,d>6.5?36:60+k);}});
  const plantPix=(n,fn)=>def(n,t=>{clear(t);fn(t);});
  plantPix('short_grass',t=>{for(let x=1;x<15;x++){const h=6+((rnd()*8)|0);for(let y=15;y>15-h;y--)if(rnd()<0.75)set(t,x,y,150+(rnd()-0.5)*40,150+(rnd()-0.5)*40,150+(rnd()-0.5)*40);}});
  plantPix('fern',t=>{for(let y=3;y<16;y++){set(t,7,y,140,140,140);const w=(16-y)>>1;if(y%2)for(let k=1;k<Math.min(6,w+2);k++){set(t,7-k,y-1,150,150,150);set(t,7+k,y-1,150,150,150);}}});
  const flower=(n,c,c2)=>plantPix(n,t=>{for(let y=8;y<16;y++)set(t,7,y,50,130,40);set(t,6,12,50,130,40);set(t,8,11,50,130,40);
    for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])set(t,7+dx,6+dy,...(dx||dy?c:c2));});
  flower('dandelion',[250,220,40],[250,190,20]);flower('poppy',[220,30,30],[40,20,20]);flower('cornflower',[80,110,230],[40,60,160]);
  flower('blue_orchid',[40,170,230],[200,230,250]);flower('allium',[190,110,230],[230,170,250]);
  plantPix('dead_bush',t=>{for(let i=0;i<30;i++){const a=-Math.PI/2+(rnd()-0.5)*2.2,l=rnd()*8;set(t,(7.5+Math.cos(a)*l)|0,(15+Math.sin(a)*l)|0,130,90,40);}});
  plantPix('brown_mushroom',t=>{for(let y=11;y<16;y++)set(t,7,y,210,200,180);for(let x=4;x<12;x++)for(let y=8;y<11;y++)set(t,x,y,150,110,80);});
  plantPix('red_mushroom',t=>{for(let y=11;y<16;y++)set(t,7,y,210,200,180);for(let x=4;x<12;x++)for(let y=7;y<11;y++)set(t,x,y,210,30,30);set(t,6,8,240,240,240);set(t,9,9,240,240,240);});
  plantPix('lily_pad',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x-7.5,y-7.5);if(d<7.5&&!(x>7&&Math.abs(y-7.5)<1))set(t,x,y,150+(rnd()-0.5)*30,150+(rnd()-0.5)*30,150);}});
  plantPix('vine',t=>{for(let i=0;i<70;i++){const x=(rnd()*16)|0,y=(rnd()*16)|0;set(t,x,y,150,150,150);}});
  plantPix('cobweb',t=>{for(let i=0;i<16;i++){set(t,i,i,230,230,230,200);set(t,15-i,i,230,230,230,200);set(t,i,8,230,230,230,200);set(t,8,i,230,230,230,200);}});
  def('pale_moss',t=>fill(t,[150,160,150],16));def('moss_block',t=>{fill(t,[90,120,50],20);speck(t,20,[70,100,40]);});
  def('mushroom_stem',t=>fill(t,[220,210,190],10));
  def('red_mushroom_block',t=>{fill(t,[200,40,36],14);blotch(t,5,[230,230,220],1);});
  def('brown_mushroom_block',t=>fill(t,[150,112,80],14));
  // ---------- redstone & mechanisms ----------
  def('torch',t=>{clear(t);for(let y=6;y<16;y++){set(t,7,y,120,90,50);set(t,8,y,100,74,40);}set(t,7,6,255,230,120);set(t,8,6,255,200,60);set(t,7,7,255,160,40);set(t,8,7,255,200,60);});
  def('redstone_torch',t=>{clear(t);for(let y=6;y<16;y++){set(t,7,y,120,90,50);set(t,8,y,100,74,40);}set(t,7,6,255,60,40);set(t,8,6,255,30,20);set(t,7,7,230,30,20);set(t,8,7,255,60,40);});
  def('redstone_torch_off',t=>{clear(t);for(let y=6;y<16;y++){set(t,7,y,120,90,50);set(t,8,y,100,74,40);}set(t,7,6,100,30,30);set(t,8,6,90,20,20);set(t,7,7,90,20,20);set(t,8,7,100,30,30);});
  def('redstone_dust_dot',t=>{clear(t);for(let y=5;y<11;y++)for(let x=5;x<11;x++)if(Math.hypot(x-7.5,y-7.5)<3.2)set(t,x,y,255,255,255,rnd()<0.85?255:0);});
  def('redstone_dust_line',t=>{clear(t);for(let y=0;y<16;y++)for(let x=6;x<10;x++)if(rnd()<0.85)set(t,x,y,255,255,255);});
  def('lever',t=>{clear(t);for(let y=0;y<16;y++)for(let x=7;x<9;x++)set(t,x,y,120,90,50);});
  def('repeater',t=>{copy(t,base('stone'));for(let y=3;y<13;y++)set(t,8,y,120,20,20);for(let k=0;k<3;k++){set(t,8-k,3+k,120,20,20);set(t,8+k,3+k,120,20,20);}});
  def('repeater_on',t=>{copy(t,base('stone'));for(let y=3;y<13;y++)set(t,8,y,250,40,30);for(let k=0;k<3;k++){set(t,8-k,3+k,250,40,30);set(t,8+k,3+k,250,40,30);}});
  def('redstone_lamp',t=>{fill(t,[90,56,30],16);for(let i=2;i<14;i++){set(t,i,2,140,90,50);set(t,2,i,140,90,50);}});
  def('redstone_lamp_on',t=>{fill(t,[250,200,120],30);for(let i=2;i<14;i++){set(t,i,2,255,240,200);set(t,2,i,255,240,200);}});
  def('piston_side',t=>{copy(t,base('cobblestone'));for(let y=0;y<4;y++)for(let x=0;x<16;x++){const k=(rnd()-0.5)*12;set(t,x,y,166+k,140+k,96+k);}});
  def('piston_top',t=>{copy(t,base('oak_planks'));for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,150,150,150);});
  def('piston_top_sticky',t=>{copy(t,base('piston_top'));blotch(t,6,[110,190,90],2);});
  def('piston_bottom',t=>{copy(t,base('cobblestone'));for(let x=5;x<11;x++)for(let y=5;y<11;y++)set(t,x,y,90,90,90);});
  def('piston_inner',t=>{copy(t,base('cobblestone'));for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,166,140,96);});
  def('observer_front',t=>{copy(t,base('stone'));for(let y=5;y<11;y++)for(let x=2;x<14;x++)set(t,x,y,40,40,40);for(let x=4;x<12;x+=4)set(t,x,8,120,120,120);});
  def('observer_back',t=>{copy(t,base('stone'));for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,90,20,20);});
  def('observer_back_on',t=>{copy(t,base('stone'));for(let x=6;x<10;x++)for(let y=6;y<10;y++)set(t,x,y,250,40,30);});
  def('observer_side',t=>{copy(t,base('stone'));for(let x=0;x<16;x++)set(t,x,8,60,60,60);});
  def('rail',t=>{clear(t);for(let y=0;y<16;y++){set(t,3,y,150,150,150);set(t,12,y,150,150,150);if(y%4===1)for(let x=1;x<15;x++)set(t,x,y,120,90,50);}});
  def('rail_corner',t=>{clear(t);for(let a=0;a<=90;a+=3){const r1=12.5,r2=3.5,rad=a*Math.PI/180;set(t,(Math.cos(rad)*r1)|0,(Math.sin(rad)*r1)|0,150,150,150);set(t,(Math.cos(rad)*r2)|0,(Math.sin(rad)*r2)|0,150,150,150);}
    for(let a=10;a<=80;a+=20){const rad=a*Math.PI/180;for(let r=2;r<14;r++)if(!get(t,(Math.cos(rad)*r)|0,(Math.sin(rad)*r)|0)[3])set(t,(Math.cos(rad)*r)|0,(Math.sin(rad)*r)|0,120,90,50);}});
  const door=(n,c,win)=>def(n,t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const e=x<2||x>13||y<1||(n.endsWith('bottom')&&y>14);const k=(rnd()-0.5)*12;
    if(win&&x>=4&&x<=11&&y>=3&&y<=9)set(t,x,y,0,0,0,0);else set(t,x,y,c[0]*(e?0.75:1)+k,c[1]*(e?0.75:1)+k,c[2]*(e?0.75:1)+k);}if(n.endsWith('bottom'))set(t,12,2,40,40,40);});
  door('door_oak_top',[170,130,76],true);door('door_oak_bottom',[170,130,76],false);door('door_iron_top',[200,200,204],true);door('door_iron_bottom',[200,200,204],false);
  def('trapdoor_oak',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const hole=(x===4||x===5||x===10||x===11)&&y>2&&y<13;const k=(rnd()-0.5)*14;
    if(hole)set(t,x,y,0,0,0,0);else set(t,x,y,164+k,124+k,72+k);}});
  def('ladder',t=>{clear(t);for(let y=0;y<16;y++){set(t,2,y,130,96,54);set(t,13,y,130,96,54);}for(let y=1;y<16;y+=4)for(let x=2;x<14;x++)set(t,x,y,150,112,64);});
  def('bed_head',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const pillow=y<6&&x>1&&x<14;set(t,x,y,pillow?240:170,pillow?240:30,pillow?240:30);}});
  def('bed_foot',t=>{fill(t,[170,30,30],14);});
  def('bed_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){if(y<7)set(t,x,y,0,0,0,0);else if(y<11)set(t,x,y,170,30,30);else set(t,x,y,150,110,60);}});
  def('enchant_top',t=>{fill(t,[150,30,30],14);for(let i=0;i<16;i++){set(t,i,0,30,200,190);set(t,i,15,30,200,190);set(t,0,i,30,200,190);set(t,15,i,30,200,190);}});
  def('enchant_side',t=>{copy(t,base('obsidian'));for(let y=0;y<4;y++)for(let x=0;x<16;x++)set(t,x,y,150,30,30);});
  // ---------- nether & end ----------
  def('netherrack',t=>{fill(t,[114,52,52],34);speck(t,24,[82,30,30]);});
  def('nether_bricks',t=>bricksT(t,[48,24,28],[26,12,14],4,8,10));
  def('quartz_ore',t=>{copy(t,base('netherrack'));blotch(t,5,[236,230,222],1);});
  def('soul_sand',t=>{fill(t,[84,64,50],18);for(let i=0;i<4;i++){const x=2+((rnd()*11)|0),y=2+((rnd()*11)|0);set(t,x,y,40,28,20);set(t,x+2,y,40,28,20);set(t,x+1,y+2,40,28,20);}});
  def('soul_soil',t=>{fill(t,[76,58,46],16);});
  def('crimson_nylium',t=>{fill(t,[140,20,20],30);});def('warped_nylium',t=>{fill(t,[30,110,100],30);});
  def('crimson_nylium_side',t=>{copy(t,base('netherrack'));for(let x=0;x<16;x++)for(let y=0;y<4;y++)set(t,x,y,140+(rnd()-0.5)*30,20,20);});
  def('warped_nylium_side',t=>{copy(t,base('netherrack'));for(let x=0;x<16;x++)for(let y=0;y<4;y++)set(t,x,y,30,110+(rnd()-0.5)*30,100);});
  def('crimson_stem',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%3===0)?-30:0,k=(rnd()-0.5)*16;set(t,x,y,110+s+k,30+s*0.3,50+s*0.3);}});
  def('crimson_stem_top',t=>{fill(t,[150,60,80],14);});
  def('warped_stem',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%3===0)?-30:0,k=(rnd()-0.5)*16;set(t,x,y,40+s*0.3,90+s+k,90+s);}});
  def('warped_stem_top',t=>{fill(t,[60,150,140],14);});
  def('nether_wart_block',t=>fill(t,[120,10,10],30));def('warped_wart_block',t=>fill(t,[20,130,120],30));
  def('shroomlight',t=>{fill(t,[250,160,70],30);speck(t,20,[255,210,120]);});
  def('basalt_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const s=(x%4===0)?-20:0,k=(rnd()-0.5)*14;set(t,x,y,80+s+k,80+s+k,86+s+k);}});
  def('basalt_top',t=>fill(t,[70,70,76],16));def('blackstone',t=>{fill(t,[42,36,42],16);speck(t,14,[60,54,60]);});
  def('ancient_debris_side',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const k=(rnd()-0.5)*20,s=(y%5===0)?-20:0;set(t,x,y,96+s+k,70+s+k,62+s+k);}});
  def('ancient_debris_top',t=>{fill(t,[96,72,64],20);});
  def('glowstone',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const r=rnd();if(r<0.25)set(t,x,y,150,110,50);else{const k=rnd()*40;set(t,x,y,240,190+k,110+k);}}});
  def('nether_portal',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const w=Math.sin((x+y)*0.8)*0.5+0.5;set(t,x,y,120+w*60,20,200+w*50,190);}});
  def('magma',t=>{fill(t,[150,50,20],20);for(let i=0;i<20;i++)set(t,(rnd()*16)|0,(rnd()*16)|0,255,140,30);});
  def('end_stone',t=>{fill(t,[220,222,160],16);speck(t,16,[196,198,136]);});
  def('end_frame_top',t=>{fill(t,[70,110,90],14);for(let x=4;x<12;x++)for(let y=4;y<12;y++)set(t,x,y,30,50,40);});
  def('end_frame_side',t=>{copy(t,base('end_stone'));for(let x=0;x<16;x++)for(let y=0;y<4;y++)set(t,x,y,70,110,90);});
  def('end_frame_eye',t=>{fill(t,[40,120,90],20);for(let x=5;x<11;x++)for(let y=5;y<11;y++)set(t,x,y,10,40,30);});
  def('end_portal',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const st=rnd()<0.06;set(t,x,y,st?120:6,st?220:10,st?200:22);}});
  def('purpur',t=>{bricksT(t,[168,122,168],[140,96,140],8,8,10);});
  def('dragon_egg',t=>{fill(t,[20,10,26],10);speck(t,10,[70,20,90]);});
  def('fire',t=>{clear(t);for(let x=0;x<16;x++){const h=8+rnd()*8;for(let y=15;y>15-h;y--){const f=(15-y)/h;set(t,x,y,255,220-f*170,60-f*60,f>0.9?0:230);}}});
  for(let s=0;s<10;s++)def('destroy_'+s,t=>{clear(t);});
  { // crack stages: random walks that grow with the stage
    seedFor('cracks');const walks=[];for(let w=0;w<8;w++){let x=4+rnd()*8,y=4+rnd()*8,ang=rnd()*6.28;const path=[];for(let s=0;s<18;s++){path.push([x|0,y|0]);ang+=(rnd()-0.5)*1.4;x+=Math.cos(ang);y+=Math.sin(ang);}walks.push(path);}
    for(let s=0;s<10;s++){const t=T['destroy_'+s],len=Math.ceil((s+1)/10*18),nw=Math.min(8,1+s);for(let w=0;w<nw;w++)for(let k=0;k<len;k++){const [x,y]=walks[w][k];set(t,x,y,15,15,15,210);}}
  }
  def('white',t=>fill(t,[225,225,225],24));
  function voronoi(t,c,var_,mortar){const pts=[];for(let i=0;i<11;i++)pts.push([rnd()*16,rnd()*16,(rnd()-0.5)*var_]);
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){let d1=1e9,d2=1e9,cc=0;
      for(const p of pts)for(let ox=-16;ox<=16;ox+=16)for(let oy=-16;oy<=16;oy+=16){const d=Math.hypot(x-p[0]-ox,y-p[1]-oy);if(d<d1){d2=d1;d1=d;cc=p[2];}else if(d<d2)d2=d;}
      const k=(rnd()-0.5)*12;if(d2-d1<1.1)set(t,x,y,mortar[0]+k,mortar[1]+k,mortar[2]+k);else set(t,x,y,c[0]+cc+k,c[1]+cc+k,c[2]+cc+k);}}
  function bricksT(t,c,m,rowH,brickW,var_=16){for(let y=0;y<16;y++)for(let x=0;x<16;x++){const row=Math.floor(y/rowH),mort=(y%rowH===rowH-1)||(((x+(row%2)*(brickW/2))%brickW)===brickW-1);
    const k=(rnd()-0.5)*var_;if(mort)set(t,x,y,m[0],m[1],m[2]);else set(t,x,y,c[0]+k,c[1]+k,c[2]+k);}}

  /* ---------------- item textures ---------------- */
  const IT={};
  const idef=(name,fn)=>{seedFor('item:'+name);const t=newTile();fn(t);IT[name]=t;return t;};
  const art=(t,rows,pal)=>{for(let y=0;y<rows.length;y++)for(let x=0;x<16;x++){const ch=rows[y][x];if(!ch||ch==='.')continue;const c=pal[ch];if(c)set(t,x,y,c[0],c[1],c[2],c[3]===undefined?255:c[3]);}};
  const TOOL_ART={
    sword:['..............hH','.............hHh','............hHh.','...........hHh..','..........hHh...','.........hHh....','........hHh.....','...ss..hHh......',
      '....sSHHh.......','.....sSh........','....sSss........','...sS...........','..sS............','.sS.............','................','................'],
    pickaxe:['....hhhhhh......','...hHHHHHHh.....','..........Hh....','.........sHHh...','........sS.hh...','.......sS...h...','......sS....h...','.....sS.........',
      '....sS..........','...sS...........','..sS............','.sS.............','sS..............','................','................','................'],
    axe:['......hh........','.....hHHh.......','....hHHHHs......','....hHHHsSh.....','.....hHsS.......','......sS........','.....sS.........','....sS..........',
      '...sS...........','..sS............','.sS.............','sS..............','................','................','................','................'],
    shovel:['...........hh...','..........hHHh..','.........hHHHh..','..........hHh...','.........sSh....','........sS......','.......sS.......','......sS........',
      '.....sS.........','....sS..........','...sS...........','..sS............','.sS.............','................','................','................'],
    hoe:['.......hhhh.....','......hHHHHs....','..........sS....','.........sS.....','........sS......','.......sS.......','......sS........','.....sS.........',
      '....sS..........','...sS...........','..sS............','.sS.............','................','................','................','................']};
  const TIER_COL={wooden:[[160,122,70],[110,82,46]],stone:[[140,140,140],[90,90,90]],iron:[[230,230,230],[160,160,166]],golden:[[250,220,70],[200,150,30]],
    diamond:[[110,236,226],[40,170,160]],netherite:[[80,72,78],[50,44,48]]};
  for(const tier in TIER_COL)for(const tool in TOOL_ART){const [a,b]=TIER_COL[tier];idef(tier+'_'+tool,t=>art(t,TOOL_ART[tool],{h:a,H:b,s:[130,96,54],S:[90,64,34]}));}
  const ARMOR_ART={
    helmet:['................','................','................','....mmmmmmmm....','...mMMMMMMMMm...','...mM......Mm...','...mM......Mm...','...mm......mm...'],
    chestplate:['................','..mm........mm..','..mMm......mMm..','..mMMmmmmmmMMm..','..mMMMMMMMMMMm..','...mMMMMMMMMm...','....mMMMMMMm....','....mMMMMMMm....',
      '....mMMMMMMm....','....mMMMMMMm....','....mmmmmmmm....'],
    leggings:['................','....mmmmmmmm....','....mMMMMMMm....','....mMMmmMMm....','....mMm..mMm....','....mMm..mMm....','....mMm..mMm....','....mMm..mMm....',
      '....mMm..mMm....','....mmm..mmm....'],
    boots:['................','................','................','................','................','................','................','...mmm....mmm...',
      '...mMm....mMm...','...mMm....mMm...','..mMMm....mMMm..','..mmmm....mmmm..']};
  const ARM_COL={leather:[[140,84,50],[176,110,70]],iron:[[160,160,166],[220,220,224]],golden:[[200,150,30],[250,220,70]],diamond:[[40,170,160],[110,236,226]],netherite:[[50,44,48],[90,80,86]]};
  for(const mat in ARM_COL)for(const slot in ARMOR_ART){const [m,M]=ARM_COL[mat];idef(mat+'_'+slot,t=>art(t,ARMOR_ART[slot],{m,M}));}
  const lump=(n,c,d)=>idef(n,t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const dd=Math.hypot(x-7.5,(y-8)*1.15);if(dd<5.6+Math.sin(x*2+y)*0.6){const k=rnd()*30-15;set(t,x,y,c[0]+k,c[1]+k,c[2]+k);}}if(d)blotch(t,3,d,1);});
  const ingot=(n,c)=>idef(n,t=>{for(let y=5;y<=11;y++)for(let x=0;x<16;x++){if(x>=2+(11-y)*0.5&&x<=13-(11-y)*0.5){const k=y===5?30:(y===11?-40:0);set(t,x,y,c[0]+k,c[1]+k,c[2]+k);}}});
  const gem=(n,c)=>idef(n,t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.abs(x-7.5)+Math.abs(y-7.5)*1.2;if(d<7){const k=d<3?50:0;set(t,x,y,c[0]+k,c[1]+k*0.5,c[2]+k*0.5);}}});
  const dust=(n,c)=>idef(n,t=>{for(let i=0;i<55;i++){const a=rnd()*6.28,r=Math.sqrt(rnd())*6;set(t,(7.5+Math.cos(a)*r)|0,(9+Math.sin(a)*r*0.7)|0,c[0]+(rnd()-0.5)*40,c[1]+(rnd()-0.5)*40,c[2]+(rnd()-0.5)*40);}});
  const rod=(n,c,c2)=>idef(n,t=>{for(let i=0;i<11;i++){set(t,3+i,13-i,...c);set(t,4+i,13-i,...(c2||c.map(v=>v*0.75)));}});
  lump('coal',[34,34,38]);lump('charcoal',[50,40,30]);lump('raw_iron',[210,170,140],[160,120,90]);lump('raw_gold',[240,200,60],[200,150,30]);lump('raw_copper',[210,120,80],[150,80,50]);
  ingot('iron_ingot',[216,216,220]);ingot('gold_ingot',[250,214,60]);ingot('copper_ingot',[220,120,80]);ingot('netherite_ingot',[70,62,66]);lump('netherite_scrap',[96,72,64]);
  gem('diamond',[90,220,225]);gem('emerald',[40,200,90]);gem('lapis_lazuli',[40,70,190]);gem('quartz',[236,230,222]);lump('flint',[60,60,64]);
  dust('redstone',[200,20,10]);dust('glowstone_dust',[250,210,90]);dust('sugar',[245,245,245]);dust('gunpowder',[80,80,80]);dust('bone_meal',[235,235,225]);dust('blaze_powder',[250,160,30]);
  rod('stick',[130,96,54]);rod('blaze_rod',[250,190,40],[220,130,20]);rod('bone',[236,232,216]);
  idef('feather',t=>{for(let i=0;i<12;i++){set(t,3+i,13-i,200,200,200);set(t,2+i,12-i,240,240,240);set(t,4+i,12-i,230,230,230);}});
  idef('string',t=>{for(let i=0;i<14;i++)set(t,1+i,8+Math.round(Math.sin(i*0.8)*3),240,240,240);});
  idef('leather',t=>{for(let y=3;y<13;y++)for(let x=3;x<13;x++)if(!((x===3||x===12)&&(y===3||y===12)))set(t,x,y,150+(rnd()-0.5)*20,90,50);});
  idef('paper',t=>{for(let y=2;y<14;y++)for(let x=3;x<13;x++)set(t,x,y,240,240,230);});
  idef('book',t=>{for(let y=2;y<14;y++)for(let x=3;x<13;x++)set(t,x,y,x<5?110:150,x<5?40:60,x<5?30:40);for(let y=3;y<13;y++)set(t,12,y,240,240,230);});
  idef('wheat',t=>{for(let k=0;k<3;k++)for(let i=0;i<10;i++)set(t,5+k*2+(i>6?1:0),13-i,210,180,70);});
  idef('wheat_seeds',t=>{for(let i=0;i<8;i++)set(t,4+((rnd()*8)|0),6+((rnd()*6)|0),90,160,50);});
  idef('carrot',t=>{for(let i=0;i<9;i++){set(t,4+i,12-i,240,130,20);set(t,5+i,12-i,220,110,20);}set(t,13,3,50,160,40);set(t,14,2,50,160,40);set(t,12,2,50,160,40);});
  lump('potato',[200,170,90]);lump('baked_potato',[220,170,70]);
  idef('bread',t=>{for(let y=6;y<12;y++)for(let x=2;x<14;x++)if(!((x===2||x===13)&&(y===6||y===11)))set(t,x,y,190+(rnd()-0.5)*20,130,60);});
  idef('apple',t=>{for(let y=4;y<14;y++)for(let x=3;x<13;x++)if(Math.hypot(x-7.5,y-9)<5)set(t,x,y,220,30,30);set(t,8,3,110,80,40);set(t,8,2,110,80,40);set(t,9,2,60,160,40);});
  idef('golden_apple',t=>{for(let y=4;y<14;y++)for(let x=3;x<13;x++)if(Math.hypot(x-7.5,y-9)<5)set(t,x,y,250,210,60);set(t,8,3,110,80,40);set(t,9,2,60,160,40);});
  const meat=(n,c,c2)=>idef(n,t=>{for(let y=4;y<13;y++)for(let x=2;x<14;x++)if(Math.hypot(x-7,(y-8)*1.4)<5.5)set(t,x,y,...c);for(let y=7;y<10;y++)set(t,12,y,...c2);set(t,13,8,240,240,230);});
  meat('porkchop',[240,150,150],[250,200,200]);meat('cooked_porkchop',[180,110,70],[220,170,120]);meat('beef',[210,60,50],[240,200,200]);meat('cooked_beef',[120,70,40],[170,120,80]);
  meat('chicken',[240,200,180],[250,230,220]);meat('cooked_chicken',[210,150,80],[230,190,120]);meat('mutton',[210,70,60],[240,220,210]);meat('cooked_mutton',[150,80,50],[190,140,90]);
  meat('rotten_flesh',[120,140,60],[150,90,60]);
  idef('melon_slice',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x-8,y-14);if(d<10&&y<14){set(t,x,y,d>8.5?60:230,d>8.5?150:60,d>8.5?40:60);if(d<8&&(x*7+y*3)%11===0)set(t,x,y,30,20,20);}}});
  lump('spider_eye',[160,40,50],[230,90,100]);lump('slime_ball',[110,200,90]);lump('snowball',[245,250,255]);lump('clay_ball',[160,166,178]);
  idef('brick',t=>{for(let y=5;y<11;y++)for(let x=1;x<15;x++)set(t,x,y,y===5?180:150,y===5?90:70,y===5?70:55);});
  idef('ender_pearl',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x-7.5,y-7.5);if(d<5)set(t,x,y,d<2?120:20,d<2?220:90,d<2?190:80);}});
  idef('eye_of_ender',t=>{for(let y=0;y<16;y++)for(let x=0;x<16;x++){const d=Math.hypot(x-7.5,y-7.5);if(d<5)set(t,x,y,d<2?20:60,d<2?60:150,d<2?40:90);}});
  const BUCKET=['................','................','...bbbbbbbbbb...','..b..........b..','..bffffffffffb..','..bffffffffffb..','...bffffffffb...','...bffffffffb...',
    '...bffffffffb...','....bffffffb....','....bffffffb....','.....bbbbbb.....'];
  idef('bucket',t=>art(t,BUCKET,{b:[180,180,186],f:[0,0,0,0]}));idef('water_bucket',t=>art(t,BUCKET,{b:[180,180,186],f:[50,90,220]}));
  idef('lava_bucket',t=>art(t,BUCKET,{b:[180,180,186],f:[240,120,20]}));idef('milk_bucket',t=>art(t,BUCKET,{b:[180,180,186],f:[245,245,245]}));
  idef('flint_and_steel',t=>{for(let i=0;i<7;i++){set(t,3+i,12-i,190,190,196);set(t,3+i,11-i,160,160,166);}for(let y=8;y<13;y++)for(let x=9;x<13;x++)set(t,x,y,60,60,64);});
  idef('shears',t=>{for(let i=0;i<9;i++){set(t,3+i,4+i,200,200,206);set(t,12-i,4+i,200,200,206);}for(const [x,y] of [[3,13],[4,13],[11,13],[12,13]])set(t,x,y,190,40,40);});
  idef('bow',t=>{for(let a=-60;a<=60;a+=4){const r=a*Math.PI/180;set(t,(4+Math.cos(r)*8)|0,(8+Math.sin(r)*7)|0,130,96,54);}for(let y=1;y<15;y++)set(t,4,y,230,230,230);});
  idef('arrow',t=>{for(let i=0;i<11;i++)set(t,3+i,13-i,130,96,54);set(t,13,2,200,200,200);set(t,12,2,200,200,200);set(t,13,3,200,200,200);set(t,3,12,240,240,240);set(t,2,13,240,240,240);set(t,4,13,240,240,240);});
  idef('oak_door',t=>{for(let y=1;y<15;y++)for(let x=4;x<12;x++)set(t,x,y,170,130,76);set(t,10,8,40,40,40);});
  idef('iron_door',t=>{for(let y=1;y<15;y++)for(let x=4;x<12;x++)set(t,x,y,200,200,204);set(t,10,8,40,40,40);});
  idef('bed',t=>{for(let y=6;y<12;y++)for(let x=1;x<15;x++)set(t,x,y,x<5?240:180,x<5?240:30,x<5?240:30);for(let y=12;y<14;y++){set(t,1,y,120,90,50);set(t,14,y,120,90,50);}});
  return {tiles:T,items:IT};
})();
const BLOCK_TILES=S.TEX_NAMES.map(n=>TEX.tiles[n]||TEX.tiles.white);
const ITEM_TEX_NAMES=Object.keys(TEX.items),ITEM_TEX={};ITEM_TEX_NAMES.forEach((n,i)=>ITEM_TEX[n]=i);
for(const it of ITEM){if(it&&!it.block&&ITEM_TEX[it.tex]===undefined)log('missing item texture',it.key);}
