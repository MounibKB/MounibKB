/* =====================================================================
   SHARED CODE — runs on the main thread AND inside the mesh workers.
   (Everything from 10_* to 19_* is the body of the SHARED function.)
   Voxel encoding: Uint16  v = id | state<<8   (id 0..255, state 0..255)
   ===================================================================== */
function SHARED(S){
'use strict';
const VID=v=>v&255, VST=v=>v>>8, V=(id,st=0)=>id|(st<<8);
// face order: 0 -x(W) 1 +x(E) 2 -y(D) 3 +y(U) 4 -z(N) 5 +z(S)
const FDIR=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
const OPP=[1,0,3,2,5,4];
// horizontal facing 0 N,1 E,2 S,3 W  -> face index / vector
const HFACE=[4,1,5,0], HVEC=[[0,-1],[1,0],[0,1],[-1,0]];
const FACE2H={4:0,1:1,5:2,0:3};

/* ---------------- texture layer names (block texture array) ---------------- */
const TEX_NAMES=('stone cobblestone mossy_cobblestone stone_bricks bricks dirt grass_top grass_side snowy_grass_side podzol_top podzol_side '+
 'mycelium_top mycelium_side sand red_sand gravel clay mud sandstone_top sandstone_side terracotta terracotta_red terracotta_orange '+
 'terracotta_yellow terracotta_white terracotta_brown bedrock obsidian crying_obsidian coal_ore iron_ore gold_ore diamond_ore redstone_ore lapis_ore '+
 'emerald_ore copper_ore coal_block iron_block gold_block diamond_block redstone_block lapis_block emerald_block copper_block '+
 'oak_log oak_log_top birch_log birch_log_top spruce_log spruce_log_top jungle_log jungle_log_top acacia_log acacia_log_top '+
 'cherry_log cherry_log_top pale_oak_log pale_oak_log_top mangrove_log mangrove_log_top '+
 'oak_planks birch_planks spruce_planks jungle_planks acacia_planks cherry_planks pale_oak_planks mangrove_planks '+
 'oak_leaves birch_leaves spruce_leaves jungle_leaves acacia_leaves cherry_leaves pale_oak_leaves mangrove_leaves '+
 'oak_sapling birch_sapling spruce_sapling jungle_sapling acacia_sapling cherry_sapling pale_oak_sapling mangrove_sapling '+
 'glass ice packed_ice snow water lava crafting_table_top crafting_table_side crafting_table_front furnace_front furnace_front_on '+
 'furnace_side furnace_top chest_top chest_side chest_front bookshelf tnt_top tnt_side tnt_bottom pumpkin_top pumpkin_side pumpkin_face '+
 'melon_top melon_side hay_top hay_side white_wool slime honey spawner farmland_dry farmland_wet '+
 'wheat_0 wheat_1 wheat_2 wheat_3 wheat_4 wheat_5 wheat_6 wheat_7 carrots_0 carrots_1 carrots_2 carrots_3 potatoes_0 potatoes_1 potatoes_2 potatoes_3 '+
 'sugar_cane cactus_top cactus_side short_grass fern dandelion poppy cornflower blue_orchid allium dead_bush brown_mushroom red_mushroom '+
 'lily_pad vine pale_moss moss_block mushroom_stem red_mushroom_block brown_mushroom_block '+
 'torch redstone_torch redstone_torch_off redstone_dust_dot redstone_dust_line lever repeater repeater_on redstone_lamp redstone_lamp_on '+
 'piston_top piston_top_sticky piston_side piston_bottom piston_inner observer_front observer_back observer_back_on observer_side '+
 'rail rail_corner door_oak_top door_oak_bottom door_iron_top door_iron_bottom trapdoor_oak ladder bed_head bed_foot bed_side '+
 'enchant_top enchant_side netherrack nether_bricks quartz_ore soul_sand soul_soil crimson_nylium crimson_nylium_side warped_nylium '+
 'warped_nylium_side crimson_stem crimson_stem_top warped_stem warped_stem_top nether_wart_block warped_wart_block shroomlight '+
 'basalt_side basalt_top blackstone ancient_debris_side ancient_debris_top glowstone nether_portal magma end_stone end_frame_top '+
 'end_frame_side end_frame_eye end_portal purpur dragon_egg fire cobweb destroy_0 destroy_1 destroy_2 destroy_3 destroy_4 destroy_5 '+
 'destroy_6 destroy_7 destroy_8 destroy_9 white').split(' ');
const T={};TEX_NAMES.forEach((n,i)=>T[n]=i);
if(TEX_NAMES.length>255)throw new Error('too many block textures');

/* ---------------- block registry ---------------- */
const KEYS=('air stone dirt grass_block oak_log oak_leaves sand gravel coal_ore iron_ore diamond_ore water lava bedrock oak_planks cobblestone '+
 'glass torch bricks snow_block glowstone stone_bricks iron_block diamond_block sandstone cactus '+
 'birch_log spruce_log jungle_log acacia_log cherry_log pale_oak_log mangrove_log '+
 'birch_leaves spruce_leaves jungle_leaves acacia_leaves cherry_leaves pale_oak_leaves mangrove_leaves '+
 'birch_planks spruce_planks jungle_planks acacia_planks cherry_planks pale_oak_planks mangrove_planks sapling '+
 'gold_ore redstone_ore lapis_ore emerald_ore copper_ore coal_block gold_block redstone_block lapis_block emerald_block copper_block '+
 'obsidian crafting_table furnace chest farmland wheat carrots potatoes sugar_cane short_grass fern dandelion poppy cornflower '+
 'blue_orchid allium dead_bush brown_mushroom red_mushroom stone_slab oak_slab cobblestone_slab oak_stairs cobblestone_stairs '+
 'stone_brick_stairs oak_fence cobblestone_wall glass_pane oak_door iron_door oak_trapdoor ladder bed tnt bookshelf mossy_cobblestone '+
 'spawner rail snow ice packed_ice clay terracotta red_terracotta orange_terracotta yellow_terracotta white_terracotta brown_terracotta '+
 'red_sand mycelium podzol moss_block pale_moss_block mud pumpkin melon hay_block white_wool slime_block honey_block lily_pad vine '+
 'mushroom_stem red_mushroom_block brown_mushroom_block netherrack nether_bricks nether_quartz_ore soul_sand soul_soil crimson_nylium '+
 'warped_nylium crimson_stem warped_stem nether_wart_block warped_wart_block shroomlight basalt blackstone ancient_debris nether_portal '+
 'magma_block end_stone end_portal_frame end_portal purpur_block dragon_egg fire redstone_wire redstone_torch lever stone_button '+
 'stone_pressure_plate redstone_lamp repeater piston sticky_piston piston_head observer enchanting_table cobweb crying_obsidian').split(' ');
const B={};KEYS.forEach((k,i)=>B[k.toUpperCase()]=i);
const DEF=new Array(256).fill(null);
const WOODS=['oak','birch','spruce','jungle','acacia','cherry','pale_oak','mangrove'];
const WOOD_LOG=[B.OAK_LOG,B.BIRCH_LOG,B.SPRUCE_LOG,B.JUNGLE_LOG,B.ACACIA_LOG,B.CHERRY_LOG,B.PALE_OAK_LOG,B.MANGROVE_LOG];
const WOOD_LEAVES=[B.OAK_LEAVES,B.BIRCH_LEAVES,B.SPRUCE_LEAVES,B.JUNGLE_LEAVES,B.ACACIA_LEAVES,B.CHERRY_LEAVES,B.PALE_OAK_LEAVES,B.MANGROVE_LEAVES];
const WOOD_PLANKS=[B.OAK_PLANKS,B.BIRCH_PLANKS,B.SPRUCE_PLANKS,B.JUNGLE_PLANKS,B.ACACIA_PLANKS,B.CHERRY_PLANKS,B.PALE_OAK_PLANKS,B.MANGROVE_PLANKS];

// box helper: [x0,y0,z0,x1,y1,z1] in 1/16 units, t = texture name or 6 face names, uv = optional 6 [u0,v0,u1,v1], rot = optional 6 uv rotations (0..3)
const bx=(x0,y0,z0,x1,y1,z1,t,o)=>Object.assign({b:[x0,y0,z0,x1,y1,z1],t},o||{});
function rotY(bo,r){ // rotate a box clockwise (seen from above) r*90deg; face textures permuted
  let [x0,y0,z0,x1,y1,z1]=bo.b;let t=bo.t,uv=bo.uv,rt=bo.rot;
  for(let i=0;i<(r&3);i++){
    const nx0=16-z1,nx1=16-z0,nz0=x0,nz1=x1;x0=nx0;x1=nx1;z0=nz0;z1=nz1;
    // clockwise: old N(4)->E(1), old E(1)->S(5), old S(5)->W(0), old W(0)->N(4)
    // new[W]=old[S], new[E]=old[N], new[N]=old[W], new[S]=old[E]
    if(Array.isArray(t))t=[t[5],t[4],t[2],t[3],t[0],t[1]];
    if(uv)uv=[uv[5],uv[4],uv[2],uv[3],uv[0],uv[1]];
    if(rt){rt=[rt[5],rt[4],rt[2],(rt[3]+1)&3,rt[0],rt[1]];}
    else if(bo.rotTop){rt=[0,0,0,(i+1)&3,0,0];}
  }
  const o=Object.assign({},bo,{b:[x0,y0,z0,x1,y1,z1],t});if(uv)o.uv=uv;if(rt)o.rot=rt;return o;
}
function rotUp(bo,down){ // canonical box pointing to -z  ->  pointing to +y (or -y)
  let [x0,y0,z0,x1,y1,z1]=bo.b,t=bo.t;
  let ny0,ny1,nz0,nz1;
  if(!down){ny0=16-z1;ny1=16-z0;nz0=y0;nz1=y1;} else {ny0=z0;ny1=z1;nz0=16-y1;nz1=16-y0;}
  if(Array.isArray(t)){ // up: old N->U, old U->S, old S->D, old D->N ; down: old N->D, D->S, S->U, U->N
    t=!down?[t[0],t[1],t[5],t[4],t[2],t[3]]:[t[0],t[1],t[4],t[5],t[3],t[2]];}
  return Object.assign({},bo,{b:[x0,ny0,nz0,x1,ny1,nz1],t,uv:undefined});
}
function orient6(boxes,f){ // canonical boxes face -z (N); orient to face index f
  if(f===4)return boxes; if(f===3)return boxes.map(b=>rotUp(b,false)); if(f===2)return boxes.map(b=>rotUp(b,true));
  return boxes.map(b=>rotY(b,FACE2H[f]));
}
const orientH=(boxes,h)=>h?boxes.map(b=>rotY(b,h)):boxes;

function def(key,p){
  const id=B[key.toUpperCase()];
  const d=Object.assign({key,id,name:p.name||key.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),model:'cube',opaque:true,solid:true,
    hard:1,resist:null,tool:null,level:0,needTool:false,sound:'stone',light:0,filter:0,replaceable:false,tint:0,slip:0.6,speed:1,jump:1,
    climb:false,gravity:false,flammable:0,burn:0,translucent:false,selfcull:false,liquid:false,ao:null,cube:null,item:true},p);
  if(d.resist===null)d.resist=d.hard<0?3600000:d.hard;
  DEF[id]=d;return d;
}
const W='wood',GR='grass',GV='gravel',SA='sand',GL='glass',WO='wool',ME='metal',SN='snow';
const cubeT=(top,side,bottom)=>({tex:(s,f)=>f===3?top:(f===2?(bottom||top):side)});
const axisTex=(side,top)=>({tex:(s,f)=>{const ax=s&3;const along=ax===0?(f===2||f===3):(ax===1?(f===0||f===1):(f===4||f===5));return along?top:side;},
  uvrot:(s,f)=>{const ax=s&3;if(ax===1)return (f===4||f===5||f===2||f===3)?1:0;if(ax===2)return (f===0||f===1)?1:0;return 0;}});
const facingTex=(front,side,top,bottom)=>({tex:(s,f)=>f===3?top:(f===2?(bottom||top):(f===HFACE[s&3]?front:side))});

def('air',{model:'none',opaque:false,solid:false,replaceable:true,hard:0,item:false});
def('stone',{tex:'stone',hard:1.5,resist:6,tool:'pickaxe',needTool:true,drop:'cobblestone'});
def('dirt',{tex:'dirt',hard:0.5,tool:'shovel',sound:GV});
def('grass_block',Object.assign({tex:(s,f)=>f===3?'grass_top':(f===2?'dirt':(s&1?'snowy_grass_side':'grass_side')),hard:0.6,tool:'shovel',sound:GR,drop:'dirt',randomTick:true,tintTop:true}));
def('sand',{tex:'sand',hard:0.5,tool:'shovel',sound:SA,gravity:true});
def('red_sand',{tex:'red_sand',hard:0.5,tool:'shovel',sound:SA,gravity:true});
def('gravel',{tex:'gravel',hard:0.6,tool:'shovel',sound:GV,gravity:true,drop:'gravel'});
const ore=(k,lvl,drop,xp)=>def(k,{tex:k,hard:3,resist:3,tool:'pickaxe',level:lvl,needTool:true,drop,xp,fortune:!!drop});
ore('coal_ore',0,'coal',[0,2]);ore('iron_ore',1,'raw_iron');ore('gold_ore',2,'raw_gold');ore('diamond_ore',2,'diamond',[3,7]);
ore('redstone_ore',2,'redstone',[1,5]);ore('lapis_ore',1,'lapis_lazuli',[2,5]);ore('emerald_ore',2,'emerald',[3,7]);ore('copper_ore',1,'raw_copper');
DEF[B.REDSTONE_ORE].dropCount=[4,5];DEF[B.LAPIS_ORE].dropCount=[4,9];DEF[B.COPPER_ORE].dropCount=[2,5];
def('nether_quartz_ore',{tex:'quartz_ore',hard:3,tool:'pickaxe',needTool:true,drop:'quartz',xp:[2,5],fortune:true});
def('ancient_debris',{tex:(s,f)=>f>=2&&f<=3?'ancient_debris_top':'ancient_debris_side',hard:30,resist:1200,tool:'pickaxe',level:3,needTool:true,sound:ME});
const mblock=(k,lvl)=>def(k,{tex:k,hard:5,resist:6,tool:'pickaxe',level:lvl,needTool:true,sound:ME});
mblock('iron_block',1);mblock('gold_block',2);mblock('diamond_block',2);mblock('emerald_block',2);mblock('copper_block',1);
mblock('lapis_block',1);mblock('redstone_block',0);mblock('coal_block',0);
DEF[B.REDSTONE_BLOCK].power=15;DEF[B.COAL_BLOCK].flammable=5;
def('water',{model:'fluid',opaque:false,solid:false,liquid:true,translucent:true,selfcull:true,replaceable:true,tex:'water',hard:-1,resist:100,filter:2,item:false});
def('lava',{model:'fluid',opaque:false,solid:false,liquid:true,selfcull:true,replaceable:true,tex:'lava',hard:-1,resist:100,light:15,item:false});
def('bedrock',{tex:'bedrock',hard:-1});
def('obsidian',{tex:'obsidian',hard:50,resist:1200,tool:'pickaxe',level:3,needTool:true});
def('crying_obsidian',{tex:'crying_obsidian',hard:50,resist:1200,tool:'pickaxe',level:3,needTool:true,light:10});
for(let i=0;i<8;i++){
  const w=WOODS[i];
  def(w+'_log',Object.assign(axisTex(w+'_log',w+'_log_top'),{hard:2,tool:'axe',sound:W,flammable:5,burn:5,place:'axis',wood:i}));
  def(w+'_planks',{tex:w+'_planks',hard:2,resist:3,tool:'axe',sound:W,flammable:5,burn:20,wood:i});
  // leaves: state bit0 persistent (player placed), bits1-3 distance to log (1..7)
  def(w+'_leaves',{tex:w+'_leaves',opaque:false,hard:0.2,tool:'hoe',sound:GR,filter:1,flammable:30,burn:60,ao:true,
    tint:i===1?4:(i===2?3:(i===5||i===6?0:2)),randomTick:true,wood:i,drop:'__leaves'});
}
DEF[B.PALE_OAK_LEAVES].tint=0;DEF[B.CHERRY_LEAVES].tint=0;
def('sapling',{model:'cross',opaque:false,solid:false,hard:0,sound:GR,tex:s=>WOODS[s&7]+'_sapling',randomTick:true,support:'soil',replaceable:false,name:'Sapling'});
def('cobblestone',{tex:'cobblestone',hard:2,resist:6,tool:'pickaxe',needTool:true});
def('mossy_cobblestone',{tex:'mossy_cobblestone',hard:2,resist:6,tool:'pickaxe',needTool:true});
def('stone_bricks',{tex:'stone_bricks',hard:1.5,resist:6,tool:'pickaxe',needTool:true});
def('bricks',{tex:'bricks',hard:2,resist:6,tool:'pickaxe',needTool:true});
def('glass',{tex:'glass',opaque:false,selfcull:true,hard:0.3,sound:GL,drop:null,ao:false});
def('ice',{tex:'ice',opaque:false,translucent:true,selfcull:true,hard:0.5,sound:GL,slip:0.98,drop:null,filter:2,tool:'pickaxe',randomTick:true});
def('packed_ice',{tex:'packed_ice',hard:0.5,sound:GL,slip:0.98,tool:'pickaxe',drop:null});
def('snow_block',{tex:'snow',hard:0.2,tool:'shovel',needTool:true,sound:SN,drop:'snowball',dropCount:[4,4]});
def('clay',{tex:'clay',hard:0.6,tool:'shovel',sound:GV,drop:'clay_ball',dropCount:[4,4]});
def('mud',{tex:'mud',hard:0.5,tool:'shovel',sound:GV});
def('terracotta',{tex:'terracotta',hard:1.25,resist:4.2,tool:'pickaxe',needTool:true});
for(const c of ['red','orange','yellow','white','brown'])def(c+'_terracotta',{tex:'terracotta_'+c,hard:1.25,resist:4.2,tool:'pickaxe',needTool:true});
def('mycelium',Object.assign(cubeT('mycelium_top','mycelium_side','dirt'),{hard:0.6,tool:'shovel',sound:GR,drop:'dirt',randomTick:true}));
def('podzol',Object.assign(cubeT('podzol_top','podzol_side','dirt'),{hard:0.5,tool:'shovel',sound:GV,drop:'dirt'}));
def('moss_block',{tex:'moss_block',hard:0.1,tool:'hoe',sound:GR});
def('pale_moss_block',{tex:'pale_moss',hard:0.1,tool:'hoe',sound:GR});
def('sandstone',Object.assign(cubeT('sandstone_top','sandstone_side'),{hard:0.8,tool:'pickaxe',needTool:true}));
def('glowstone',{tex:'glowstone',hard:0.3,sound:GL,light:15,drop:'glowstone_dust',dropCount:[2,4],fortune:true});
def('snow',{model:'boxes',opaque:false,hard:0.1,tool:'shovel',needTool:true,sound:SN,replaceable:s=>(s&7)===0,tex:'snow',drop:'snowball',
  boxes:s=>[bx(0,0,0,16,((s&7)+1)*2,16,'snow')],collide:s=>(s&7)===0?[]:[[0,0,0,16,(s&7)*2,16]],place:'snowlayer',support:'solidTop'});
def('cactus',{model:'boxes',opaque:false,hard:0.4,sound:WO,randomTick:true,support:'cactus',
  boxes:()=>[bx(1,0,1,15,16,15,['cactus_side','cactus_side','cactus_top','cactus_top','cactus_side','cactus_side'])],
  collide:()=>[[1,0,1,15,15,15]]});
def('crafting_table',Object.assign({tex:(s,f)=>f===3?'crafting_table_top':(f===2?'oak_planks':(f===4||f===5?'crafting_table_front':'crafting_table_side'))},{hard:2.5,tool:'axe',sound:W,flammable:5,use:'crafting'}));
def('furnace',Object.assign({tex:(s,f)=>f===3||f===2?'furnace_top':(f===HFACE[s&3]?((s&4)?'furnace_front_on':'furnace_front'):'furnace_side')},
  {hard:3.5,tool:'pickaxe',needTool:true,light:s=>(s&4)?13:0,place:'facingOpp',use:'furnace',be:'furnace'}));
def('chest',{model:'boxes',opaque:false,hard:2.5,tool:'axe',sound:W,place:'facingOpp',use:'chest',be:'chest',
  boxes:s=>orientH([bx(1,0,1,15,14,15,['chest_side','chest_side','chest_top','chest_top','chest_front','chest_side'])],(s&3))});
def('bookshelf',Object.assign(cubeT('oak_planks','bookshelf'),{hard:1.5,tool:'axe',sound:W,flammable:30,burn:20,drop:'book',dropCount:[3,3]}));
def('tnt',Object.assign(cubeT('tnt_top','tnt_side','tnt_bottom'),{hard:0,sound:GR,flammable:15,burn:100,tnt:true}));
def('pumpkin',Object.assign(facingTex('pumpkin_face','pumpkin_side','pumpkin_top'),{hard:1,tool:'axe',sound:W,place:'facingOpp'}));
def('melon',Object.assign(cubeT('melon_top','melon_side'),{hard:1,tool:'axe',sound:W,drop:'melon_slice',dropCount:[3,7]}));
def('hay_block',Object.assign(axisTex('hay_side','hay_top'),{hard:0.5,tool:'hoe',sound:GR,place:'axis',flammable:60,burn:20,fallMul:0.2}));
def('white_wool',{tex:'white_wool',hard:0.8,tool:'shears',sound:WO,flammable:30,burn:60});
def('slime_block',{tex:'slime',opaque:false,translucent:true,hard:0,sound:'slime',bounce:true,filter:1,fallMul:0,ao:false});
def('honey_block',{model:'boxes',opaque:false,translucent:true,hard:0,sound:'slime',speed:0.4,jump:0.5,fallMul:0.2,
  boxes:()=>[bx(0,0,0,16,16,16,'honey')],collide:()=>[[1,0,1,15,15,15]]});
def('spawner',{tex:'spawner',opaque:false,hard:5,tool:'pickaxe',needTool:true,drop:null,xp:[15,43],sound:ME,item:false,be:'spawner',ao:false});
def('farmland',{model:'boxes',opaque:false,hard:0.6,tool:'shovel',sound:GV,drop:'dirt',randomTick:true,
  boxes:s=>[bx(0,0,0,16,15,16,['dirt','dirt','dirt',(s&7)===7?'farmland_wet':'farmland_dry','dirt','dirt'])],support:'farmland'});
const crop=(k,stages,texf,drop)=>def(k,{model:'crop',opaque:false,solid:false,hard:0,sound:GR,tex:texf,randomTick:true,support:'farmland',
  replaceable:false,drop,item:false,crop:stages});
crop('wheat',7,s=>'wheat_'+Math.min(7,s&7),'__wheat');
crop('carrots',7,s=>'carrots_'+[0,0,1,1,2,2,2,3][s&7],'__carrots');
crop('potatoes',7,s=>'potatoes_'+[0,0,1,1,2,2,2,3][s&7],'__potatoes');
def('sugar_cane',{model:'cross',opaque:false,solid:false,hard:0,sound:GR,tex:'sugar_cane',randomTick:true,support:'cane',tint:1});
const plant=(k,t,o)=>def(k,Object.assign({model:'cross',opaque:false,solid:false,hard:0,sound:GR,tex:t,support:'soil',flammable:60,burn:100},o||{}));
plant('short_grass','short_grass',{tint:1,replaceable:true,drop:'__grass'});plant('fern','fern',{tint:1,replaceable:true,drop:'__grass'});
plant('dandelion','dandelion');plant('poppy','poppy');plant('cornflower','cornflower');plant('blue_orchid','blue_orchid');plant('allium','allium');
plant('dead_bush','dead_bush',{support:'sandy',replaceable:true,drop:'stick',dropCount:[0,2]});
plant('brown_mushroom','brown_mushroom',{support:'mushroom',light:1,randomTick:true});plant('red_mushroom','red_mushroom',{support:'mushroom',randomTick:true});
def('lily_pad',{model:'boxes',opaque:false,hard:0,sound:GR,tint:7,support:'water',boxes:()=>[bx(0,0,0,16,1,16,['lily_pad','lily_pad','lily_pad','lily_pad','lily_pad','lily_pad'],{nosides:true})],collide:()=>[[1,0,1,15,1.5,15]]});
def('vine',{model:'vine',opaque:false,solid:false,hard:0.2,tool:'shears',sound:GR,tex:'vine',tint:2,climb:true,replaceable:true,randomTick:true,flammable:15,burn:100,drop:null,place:'vine'});
def('mushroom_stem',{tex:'mushroom_stem',hard:0.2,tool:'axe',sound:W,drop:null});
def('red_mushroom_block',{tex:'red_mushroom_block',hard:0.2,tool:'axe',sound:W,drop:'red_mushroom',dropCount:[0,2]});
def('brown_mushroom_block',{tex:'brown_mushroom_block',hard:0.2,tool:'axe',sound:W,drop:'brown_mushroom',dropCount:[0,2]});
// slabs: state 0 bottom 1 top 2 double
const slab=(k,t,o)=>def(k,Object.assign({model:'boxes',opaque:s=>(s&3)===2,cube:s=>(s&3)===2,tex:t,place:'slab',
  boxes:s=>(s&3)===0?[bx(0,0,0,16,8,16,t)]:((s&3)===1?[bx(0,8,0,16,16,16,t)]:[bx(0,0,0,16,16,16,t)])},o));
slab('stone_slab','stone',{hard:2,resist:6,tool:'pickaxe',needTool:true});
slab('oak_slab','oak_planks',{hard:2,tool:'axe',sound:W,flammable:5});
slab('cobblestone_slab','cobblestone',{hard:2,resist:6,tool:'pickaxe',needTool:true});
// stairs: state facing(0..3) | half(4 = upside down)
const stairs=(k,t,o)=>def(k,Object.assign({model:'boxes',opaque:false,place:'stairs',tex:t,
  boxes:s=>{const top=s&4;const bs=top?[bx(0,8,0,16,16,16,t),bx(0,0,0,16,8,8,t)]:[bx(0,0,0,16,8,16,t),bx(0,8,0,16,16,8,t)];return orientH(bs,s&3);}},o));
stairs('oak_stairs','oak_planks',{hard:2,tool:'axe',sound:W,flammable:5});
stairs('cobblestone_stairs','cobblestone',{hard:2,resist:6,tool:'pickaxe',needTool:true});
stairs('stone_brick_stairs','stone_bricks',{hard:1.5,resist:6,tool:'pickaxe',needTool:true});
def('oak_fence',{model:'fence',opaque:false,hard:2,tool:'axe',sound:W,tex:'oak_planks',flammable:5,conn:'fence'});
def('cobblestone_wall',{model:'wall',opaque:false,hard:2,resist:6,tool:'pickaxe',needTool:true,tex:'cobblestone',conn:'wall'});
def('glass_pane',{model:'pane',opaque:false,hard:0.3,sound:GL,tex:'glass',drop:null,conn:'pane'});
// doors: facing(0..3) | open 4 | upper 8 | hinge-right 16
const doorBoxes=(s,tex)=>{const f=s&3,open=s&4,hinge=s&16,tt=(s&8)?tex[0]:tex[1];
  let b=bx(0,0,13,16,16,16,tt);if(open)b=hinge?bx(0,0,0,3,16,16,tt):bx(13,0,0,16,16,16,tt);return orientH([b],f);};
def('oak_door',{model:'boxes',opaque:false,hard:3,tool:'axe',sound:W,place:'door',use:'door',boxes:s=>doorBoxes(s,['door_oak_top','door_oak_bottom']),drop:'__door',item:false,flammable:0});
def('iron_door',{model:'boxes',opaque:false,hard:5,tool:'pickaxe',needTool:true,sound:ME,place:'door',boxes:s=>doorBoxes(s,['door_iron_top','door_iron_bottom']),drop:'__door',item:false});
def('oak_trapdoor',{model:'boxes',opaque:false,hard:3,tool:'axe',sound:W,place:'trapdoor',use:'trapdoor',
  boxes:s=>{const t='trapdoor_oak';let b;if(s&4)b=bx(0,0,13,16,16,16,t);else b=(s&8)?bx(0,13,0,16,16,16,t):bx(0,0,0,16,3,16,t);return orientH([b],s&3);},climbIfOpen:true});
def('ladder',{model:'boxes',opaque:false,hard:0.4,tool:'axe',sound:W,climb:true,place:'wallH',support:'wallH',
  boxes:s=>orientH([bx(0,0,0,16,16,1,['ladder','ladder','ladder','ladder','ladder','ladder'],{nosides:true})],s&3),collide:s=>orientH([bx(0,0,0,16,16,3,'ladder')],s&3).map(b=>b.b)});
// bed: facing(0..3) | head 4
def('bed',{model:'boxes',opaque:false,hard:0.2,sound:WO,place:'bed',use:'bed',drop:'__bed',item:false,
  boxes:s=>orientH([bx(0,0,0,16,9,16,['bed_side','bed_side','oak_planks',(s&4)?'bed_head':'bed_foot','bed_side','bed_side'],{rotTop:true})],s&3),fallMul:0.5,bounceBed:true});
def('torch',{model:'boxes',opaque:false,solid:false,hard:0,sound:W,light:14,place:'torch',support:'torch',
  boxes:s=>torchBoxes(s,'torch'),select:s=>torchSel(s)});
function torchBoxes(s,t){const a=s&7;const tb=[t,t,t,t,t,t];
  const uv=[[7,6,9,16],[7,6,9,16],[7,14,9,16],[7,6,9,8],[7,6,9,16],[7,6,9,16]];
  if(a===0||a>4)return [bx(7,0,7,9,10,9,tb,{uv})];
  return orientH([bx(7,3,1,9,13,3,tb,{uv})],a-1);}
function torchSel(s){const a=s&7;if(a===0||a>4)return [[6,0,6,10,10,10]];return orientH([bx(5,3,0,11,13,5,'torch')],a-1).map(b=>b.b);}
def('fire',{model:'crop',opaque:false,solid:false,hard:0,tex:'fire',light:15,replaceable:true,drop:null,item:false,sound:'fire',anim:3});
def('cobweb',{model:'cross',opaque:false,solid:false,hard:4,tool:'sword',tex:'cobweb',sound:WO,drop:'string',web:true});
def('rail',{model:'boxes',opaque:false,solid:false,hard:0.7,tool:'pickaxe',sound:ME,place:'rail',support:'solidTop',
  boxes:s=>{const sh=s&7;if(sh<=1)return [bx(0,0,0,16,1,16,sh?'rail':'rail',{nosides:true,rot:[0,0,0,sh?1:0,0,0]})];
    return [bx(0,0,0,16,1,16,'rail_corner',{nosides:true,rot:[0,0,0,sh-2,0,0]})];},select:()=>[[0,0,0,16,2,16]]});
def('netherrack',{tex:'netherrack',hard:0.4,tool:'pickaxe',needTool:true,eternalFire:true});
def('nether_bricks',{tex:'nether_bricks',hard:2,resist:6,tool:'pickaxe',needTool:true});
def('soul_sand',{model:'boxes',opaque:true,cube:true,tex:'soul_sand',hard:0.5,tool:'shovel',sound:SA,speed:0.4,
  boxes:()=>[bx(0,0,0,16,16,16,'soul_sand')],collide:()=>[[0,0,0,16,14,16]]});
def('soul_soil',{tex:'soul_soil',hard:0.5,tool:'shovel',sound:SA});
def('crimson_nylium',Object.assign(cubeT('crimson_nylium','crimson_nylium_side','netherrack'),{hard:0.4,tool:'pickaxe',needTool:true,drop:'netherrack'}));
def('warped_nylium',Object.assign(cubeT('warped_nylium','warped_nylium_side','netherrack'),{hard:0.4,tool:'pickaxe',needTool:true,drop:'netherrack'}));
def('crimson_stem',Object.assign(axisTex('crimson_stem','crimson_stem_top'),{hard:2,tool:'axe',sound:W,place:'axis'}));
def('warped_stem',Object.assign(axisTex('warped_stem','warped_stem_top'),{hard:2,tool:'axe',sound:W,place:'axis'}));
def('nether_wart_block',{tex:'nether_wart_block',hard:1,tool:'hoe',sound:GR});
def('warped_wart_block',{tex:'warped_wart_block',hard:1,tool:'hoe',sound:GR});
def('shroomlight',{tex:'shroomlight',hard:1,tool:'hoe',sound:GR,light:15});
def('basalt',Object.assign(axisTex('basalt_side','basalt_top'),{hard:1.25,resist:4.2,tool:'pickaxe',needTool:true,place:'axis'}));
def('blackstone',{tex:'blackstone',hard:1.5,resist:6,tool:'pickaxe',needTool:true});
def('magma_block',{tex:'magma',hard:0.5,tool:'pickaxe',needTool:true,light:3,hot:true});
def('nether_portal',{model:'boxes',opaque:false,solid:false,translucent:true,hard:-1,light:11,drop:null,item:false,sound:GL,anim:2,
  boxes:s=>(s&1)?[bx(6,0,0,10,16,16,'nether_portal')]:[bx(0,0,6,16,16,10,'nether_portal')],portal:'nether'});
def('end_stone',{tex:'end_stone',hard:3,resist:9,tool:'pickaxe',needTool:true});
def('purpur_block',{tex:'purpur',hard:1.5,resist:6,tool:'pickaxe',needTool:true});
def('end_portal_frame',{model:'boxes',opaque:false,hard:-1,light:1,item:false,use:'endframe',
  boxes:s=>{const b=[bx(0,0,0,16,13,16,['end_frame_side','end_frame_side','end_stone','end_frame_top','end_frame_side','end_frame_side'])];
    if(s&4)b.push(bx(4,13,4,12,16,12,'end_frame_eye'));return b;}});
def('end_portal',{model:'boxes',opaque:false,solid:false,hard:-1,light:15,item:false,drop:null,anim:2,boxes:()=>[bx(0,12,0,16,12,16,'end_portal',{nosides:true})],portal:'end'});
def('dragon_egg',{model:'boxes',opaque:false,hard:3,resist:9,light:1,boxes:()=>[bx(3,0,3,13,14,13,'dragon_egg')]});
def('enchanting_table',{model:'boxes',opaque:false,hard:5,resist:1200,tool:'pickaxe',needTool:true,light:7,use:'enchanting',
  boxes:()=>[bx(0,0,0,16,12,16,['enchant_side','enchant_side','obsidian','enchant_top','enchant_side','enchant_side'])]});
/* ---------- redstone ---------- */
def('redstone_wire',{model:'wire',opaque:false,solid:false,hard:0,tex:'redstone_dust_dot',tint:5,support:'solidTop',drop:'redstone',item:false,redstone:'wire'});
def('redstone_torch',{model:'boxes',opaque:false,solid:false,hard:0,sound:W,light:s=>(s&8)?0:7,place:'torch',support:'torch',redstone:'torch',
  boxes:s=>torchBoxes(s,(s&8)?'redstone_torch_off':'redstone_torch'),select:s=>torchSel(s)});
const attachBoxes=(face,boxN,boxFloor,boxCeil)=>face===0?boxFloor:(face===1?boxCeil:orientH(boxN,face-2));
def('lever',{model:'boxes',opaque:false,solid:false,hard:0.5,sound:W,place:'attach6',support:'attach6',use:'lever',redstone:'lever',
  boxes:s=>{const f=s&7,on=s&8;return attachBoxes(f,[bx(5,4,0,11,12,3,'cobblestone'),on?bx(7,4,3,9,8,9,'lever'):bx(7,8,3,9,12,9,'lever')],
    [bx(4,0,5,12,3,11,'cobblestone'),on?bx(7,3,3,9,9,5,'lever'):bx(7,3,11,9,9,13,'lever')],
    [bx(4,13,5,12,16,11,'cobblestone'),on?bx(7,7,3,9,13,5,'lever'):bx(7,7,11,9,13,13,'lever')]);}});
def('stone_button',{model:'boxes',opaque:false,solid:false,hard:0.5,tool:'pickaxe',place:'attach6',support:'attach6',use:'button',redstone:'button',
  boxes:s=>{const f=s&7,d=(s&8)?1:2;return attachBoxes(f,[bx(5,6,0,11,10,d,'stone')],[bx(5,0,6,11,d,10,'stone')],[bx(5,16-d,6,11,16,10,'stone')]);}});
def('stone_pressure_plate',{model:'boxes',opaque:false,solid:false,hard:0.5,tool:'pickaxe',needTool:true,support:'solidTop',redstone:'plate',
  boxes:s=>[bx(1,0,1,15,(s&1)?1:1,15,'stone',{nosides:false})]});
def('redstone_lamp',{tex:s=>(s&1)?'redstone_lamp_on':'redstone_lamp',hard:0.3,sound:GL,light:s=>(s&1)?15:0,redstone:'lamp'});
def('repeater',{model:'boxes',opaque:false,hard:0,sound:W,place:'facingSame',use:'repeater',support:'solidTop',redstone:'repeater',drop:'repeater',
  boxes:s=>{const on=s&16,d=(s>>2)&3,tt=on?'redstone_torch':'redstone_torch_off';
    return orientH([bx(0,0,0,16,2,16,['stone','stone','stone',on?'repeater_on':'repeater','stone','stone'],{rotTop:true}),
      bx(7,2,2,9,7,4,tt),bx(7,2,6+d*2,9,7,8+d*2,tt)],s&3);},light:s=>(s&16)?5:0});
const pistonBoxes=(s,sticky)=>{const f=s&7,ext=s&8,top=sticky?'piston_top_sticky':'piston_top';
  if(!ext)return null;return orient6([bx(0,0,4,16,16,16,['piston_side','piston_side','piston_side','piston_side','piston_inner','piston_bottom'])],f);};
def('piston',{model:s=>(s&8)?'boxes':'cube',opaque:s=>!(s&8),tex:(s,f)=>f===(s&7)?'piston_top':(f===OPP[s&7]?'piston_bottom':'piston_side'),
  hard:1.5,tool:'pickaxe',place:'facing6',redstone:'piston',boxes:s=>pistonBoxes(s,false)});
def('sticky_piston',{model:s=>(s&8)?'boxes':'cube',opaque:s=>!(s&8),tex:(s,f)=>f===(s&7)?'piston_top_sticky':(f===OPP[s&7]?'piston_bottom':'piston_side'),
  hard:1.5,tool:'pickaxe',place:'facing6',redstone:'piston',boxes:s=>pistonBoxes(s,true)});
def('piston_head',{model:'boxes',opaque:false,hard:1.5,item:false,drop:null,
  boxes:s=>orient6([bx(0,0,0,16,16,4,[ 'piston_side','piston_side','piston_side','piston_side',(s&8)?'piston_top_sticky':'piston_top','piston_top']),
    bx(6,6,4,10,10,16,'piston_side')],s&7)});
def('observer',{tex:(s,f)=>f===(s&7)?'observer_front':(f===OPP[s&7]?((s&8)?'observer_back_on':'observer_back'):'observer_side'),
  hard:3,tool:'pickaxe',needTool:true,place:'facing6obs',redstone:'observer'});
// piston/observer "facing" for tex is a face index 0..5; torches etc use attach codes.

/* ---------- per-voxel lookup tables (65536 entries) ---------- */
const F_OPAQUE=1,F_SOLID=2,F_CUBE=4,F_SELFCULL=8,F_AO=16,F_LIQUID=32,F_REPL=64,F_TRANS=128,F_CLIMB=256,F_FULLCOL=512,F_RTICK=1024,F_EXISTS=2048;
const MODEL_IDS={none:0,cube:1,cross:2,crop:3,boxes:4,fluid:5,wire:6,fence:7,pane:8,wall:9,vine:10};
const FLAGS=new Uint16Array(65536),LIGHT=new Uint8Array(65536),FILTER=new Uint8Array(65536),MODEL=new Uint8Array(65536),
  TEXV=new Uint8Array(65536*6),UVROT=new Uint8Array(65536*6),TINT=new Uint8Array(65536);
const val=(x,s,f)=>typeof x==='function'?x(s,f):x;
const boxCache=new Map();
function staticBoxes(v){ // render boxes (static per voxel)
  let r=boxCache.get(v);if(r)return r;
  const d=DEF[v&255];r=(d&&d.boxes)?(d.boxes(v>>8)||[]):[];boxCache.set(v,r);return r;
}
for(let id=0;id<256;id++){
  const d=DEF[id];if(!d)continue;
  for(let s=0;s<256;s++){
    const v=id|(s<<8);
    const model=MODEL_IDS[val(d.model,s)];
    const opaque=!!val(d.opaque,s);
    const cube=d.cube!==null?!!val(d.cube,s):(model===1);
    let fl=F_EXISTS;
    if(opaque)fl|=F_OPAQUE;
    if(d.solid)fl|=F_SOLID;
    if(cube)fl|=F_CUBE;
    if(d.selfcull)fl|=F_SELFCULL;
    if(d.ao===true||(d.ao===null&&opaque))fl|=F_AO;
    if(d.liquid)fl|=F_LIQUID;
    if(val(d.replaceable,s))fl|=F_REPL;
    if(d.translucent)fl|=F_TRANS;
    if(d.climb)fl|=F_CLIMB;
    if(d.solid&&cube&&!d.collide)fl|=F_FULLCOL;
    if(d.randomTick)fl|=F_RTICK;
    FLAGS[v]=fl;MODEL[v]=model;
    LIGHT[v]=val(d.light,s)||0;
    FILTER[v]=opaque?15:(d.filter||0);
    TINT[v]=d.tint||0;
    for(let f=0;f<6;f++){
      let t=d.tex;if(typeof t==='function')t=t(s,f);
      if(t&&typeof t==='object')t=t[f];
      const li=T[t];TEXV[v*6+f]=li===undefined?T.white:li;
      if(d.uvrot)UVROT[v*6+f]=d.uvrot(s,f);
    }
  }
}

// box-model blocks: derive the "particle"/icon texture from their first box so breaking particles and icons are right
for(let id=0;id<256;id++){const d=DEF[id];if(!d||!d.boxes)continue;
  for(let s=0;s<256;s++){const v=id|(s<<8);if(TEXV[v*6+1]!==T.white)continue;let bs;try{bs=d.boxes(s)||[];}catch(e){bs=[];}if(!bs.length)continue;
    const t=bs[0].t;for(let f=0;f<6;f++){const n=Array.isArray(t)?t[f]:t;TEXV[v*6+f]=T[n]!==undefined?T[n]:T.white;}}}
/* ---------- shapes: render / collision / selection ---------- */
// connection mask for fence/pane/wall (bits N=1 E=2 S=4 W=8), nb(dx,dy,dz) -> voxel or -1
function connMask(v,nb){
  const d=DEF[v&255],kind=d.conn;let m=0;
  for(let h=0;h<4;h++){
    const n=nb(HVEC[h][0],0,HVEC[h][1]);if(n<0)continue;
    const nd=DEF[n&255];if(!nd)continue;
    const nf=FLAGS[n];
    let c=false;
    if(nd.conn===kind)c=true;
    else if(kind==='pane'&&(nd.conn==='wall'||n===B.GLASS))c=true;
    else if(kind==='wall'&&nd.conn==='pane')c=true;
    else if((nf&F_OPAQUE)&&(nf&F_CUBE))c=true;
    if(c)m|=1<<h;
  }
  return m;
}
function dynBoxes(v,m,forCollision){
  const d=DEF[v&255],t=d.tex,model=MODEL[v];const out=[];
  if(model===7){ // fence
    const hh=forCollision?24:16;out.push(bx(6,0,6,10,hh,10,t));
    const arm=forCollision?[bx(6,0,0,10,24,6,t)]:[bx(7,12,0,9,15,6,t),bx(7,6,0,9,9,6,t)];
    for(let h=0;h<4;h++)if(m&(1<<h))for(const a of arm)out.push(rotY(a,h));
  } else if(model===9){ // wall
    const hh=forCollision?24:16;out.push(bx(4,0,4,12,hh,12,t));
    for(let h=0;h<4;h++)if(m&(1<<h))out.push(rotY(bx(5,0,0,11,forCollision?24:14,4,t),h));
  } else if(model===8){ // pane
    out.push(bx(7,0,7,9,16,9,t));
    for(let h=0;h<4;h++)if(m&(1<<h))out.push(rotY(bx(7,0,0,9,16,7,t),h));
  }
  return out;
}
// returns boxes in 1/16 units as arrays [x0,y0,z0,x1,y1,z1]
function collisionBoxes(v,nb){
  const f=FLAGS[v];if(!(f&F_SOLID))return EMPTY;
  if(f&F_FULLCOL)return FULL;
  const d=DEF[v&255],m=MODEL[v];
  if(m===7||m===8||m===9)return dynBoxes(v,connMask(v,nb),true).map(b=>b.b);
  if(d.collide)return d.collide(v>>8);
  if(m===4)return staticBoxes(v).map(b=>b.b);
  return FULL;
}
function selectionBoxes(v,nb){
  const d=DEF[v&255];if(!d||!v)return EMPTY;
  const m=MODEL[v];
  if(d.select)return d.select(v>>8);
  if(m===7||m===8||m===9)return dynBoxes(v,connMask(v,nb),false).map(b=>b.b);
  if(m===4)return staticBoxes(v).map(b=>b.b);
  if(m===2||m===3)return [[2,0,2,14,13,14]];
  if(m===6)return [[0,0,0,16,1,16]];
  if(m===10)return [[0,0,0,16,16,16]];
  return FULL;
}
const FULL=[[0,0,0,16,16,16]],EMPTY=[];
// redstone wire connection mask: N E S W, plus "up" bits (<<4) where the wire climbs
function wireConn(nb){
  let m=0;
  for(let h=0;h<4;h++){
    const [dx,dz]=HVEC[h];const n=nb(dx,0,dz);if(n<0)continue;
    if(connectsWire(n,h))m|=1<<h;
    else{
      const up=nb(dx,1,dz),above=nb(0,1,0);
      if(up>=0&&(up&255)===B.REDSTONE_WIRE&&!(above>=0&&(FLAGS[above]&F_OPAQUE)))m|=(1<<h)|(16<<h);
      else if(!(FLAGS[n]&F_OPAQUE)){const dn=nb(dx,-1,dz);if(dn>=0&&(dn&255)===B.REDSTONE_WIRE)m|=1<<h;}
    }
  }
  return m;
}
function connectsWire(n,h){
  const id=n&255,d=DEF[id];if(!d)return false;
  if(id===B.REDSTONE_WIRE)return true;
  if(d.redstone==='torch'||d.redstone==='lever'||d.redstone==='button'||d.redstone==='plate'||id===B.REDSTONE_BLOCK)return true;
  if(id===B.REPEATER){const f=(n>>8)&3;return f===h||((f+2)&3)===h;}
  if(id===B.OBSERVER){const f=(n>>8)&7;return f===OPP[HFACE[h]];}
  return false;
}
function vineFaces(s){return s&15;} // bits: N E S W attached walls

/* ---------------- tint palette helpers ---------------- */
// tint kinds: 1 grass(biome) 2 foliage(biome) 3 spruce 4 birch 5 redstone(power) 7 lily
const FIXED_TINT={3:[0x61,0x99,0x61],4:[0x80,0xa7,0x55],7:[0x20,0x80,0x30]};
function redstoneColor(p){const f=p/15;return [Math.round(f*0.6*255+(p>0?0.4*255:0.3*255)),Math.round(Math.max(0,f*f*0.7-0.5)*255),Math.round(Math.max(0,f*f*0.6-0.7)*255)];}

Object.assign(S,{VID,VST,V,FDIR,OPP,HFACE,HVEC,FACE2H,TEX_NAMES,T,KEYS,B,DEF,WOODS,WOOD_LOG,WOOD_LEAVES,WOOD_PLANKS,
  F_OPAQUE,F_SOLID,F_CUBE,F_SELFCULL,F_AO,F_LIQUID,F_REPL,F_TRANS,F_CLIMB,F_FULLCOL,F_RTICK,F_EXISTS,MODEL_IDS,
  FLAGS,LIGHT,FILTER,MODEL,TEXV,UVROT,TINT,staticBoxes,connMask,dynBoxes,collisionBoxes,selectionBoxes,wireConn,connectsWire,vineFaces,
  FIXED_TINT,redstoneColor,bx,rotY,orientH,orient6});
