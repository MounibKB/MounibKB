/* =====================================================================
   ITEMS: registry, tool tiers, armor, food, fuel, enchantments, ItemStack ops
   Item ids: 1..255 = block items (same id as the block), 256+ = items.
   ItemStack = {id, count, dmg?, ench?: {key:level}}
   ===================================================================== */
const ITEM=[],I={};
const TIERS={wood:{level:0,speed:2,dur:59,atk:0,ench:15},stone:{level:1,speed:4,dur:131,atk:1,ench:5},iron:{level:2,speed:6,dur:250,atk:2,ench:14},
  gold:{level:0,speed:12,dur:32,atk:0,ench:22},diamond:{level:3,speed:8,dur:1561,atk:3,ench:10},netherite:{level:4,speed:9,dur:2031,atk:4,ench:15}};
const TOOL_BASE={sword:{dmg:[4,5,6,4,7,8],spd:1.6},axe:{dmg:[7,9,9,7,9,10],spd:[0.8,0.8,0.9,1,1,1]},pickaxe:{dmg:[2,3,4,2,5,6],spd:1.2},
  shovel:{dmg:[2.5,3.5,4.5,2.5,5.5,6.5],spd:1},hoe:{dmg:[1,1,1,1,1,1],spd:[1,2,3,1,4,4]}};
const TIER_ORDER=['wood','stone','iron','gold','diamond','netherite'];
const ARMOR={leather:{def:[1,3,2,1],tough:0,base:5,ench:15},iron:{def:[2,6,5,2],tough:0,base:15,ench:9},gold:{def:[2,5,3,1],tough:0,base:7,ench:25},
  diamond:{def:[3,8,6,3],tough:2,base:33,ench:10},netherite:{def:[3,8,6,3],tough:3,base:37,kb:0.1,ench:15}};
const ARMOR_SLOTS=['helmet','chestplate','leggings','boots'],ARMOR_MUL=[11,16,15,13];
let nextItemId=256;
function item(key,o){const id=nextItemId++;const it=Object.assign({id,key,name:key.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '),tex:key,stack:64},o||{});
  ITEM[id]=it;I[key.toUpperCase()]=id;return it;}
// block items
for(let id=1;id<256;id++){const d=DEF[id];if(!d||!d.item)continue;ITEM[id]={id,key:d.key,name:d.name,block:id,stack:64};I[d.key.toUpperCase()]=id;}
ITEM[B.SAPLING].name='Oak Sapling';
// materials
for(const k of ['stick','coal','charcoal','raw_iron','raw_gold','raw_copper','iron_ingot','gold_ingot','copper_ingot','netherite_scrap','netherite_ingot',
  'diamond','emerald','lapis_lazuli','quartz','flint','feather','string','bone','bone_meal','gunpowder','leather','wheat','sugar','paper','book',
  'blaze_rod','blaze_powder','glowstone_dust','clay_ball','brick','slime_ball','spider_eye','rotten_flesh_x'])if(k!=='rotten_flesh_x')item(k);
item('redstone',{places:B.REDSTONE_WIRE,name:'Redstone Dust'});
item('wheat_seeds',{places:B.WHEAT,plant:true});
item('ender_pearl',{stack:16,use:'throw_pearl'});item('eye_of_ender',{use:'throw_eye'});
item('snowball',{stack:16,use:'throw_snowball'});
item('bucket',{stack:16,use:'bucket'});item('water_bucket',{stack:1,use:'bucket',fluid:B.WATER});item('lava_bucket',{stack:1,use:'bucket',fluid:B.LAVA});
item('milk_bucket',{stack:1,use:'drink_milk'});
item('flint_and_steel',{stack:1,durability:64,use:'ignite'});item('shears',{stack:1,durability:238,tool:{type:'shears',level:0,speed:1}});
item('bow',{stack:1,durability:384,use:'bow'});item('arrow');
item('oak_door_item',{places:B.OAK_DOOR,name:'Oak Door',tex:'oak_door'});item('iron_door_item',{places:B.IRON_DOOR,name:'Iron Door',tex:'iron_door'});
item('bed_item',{places:B.BED,name:'Red Bed',stack:1,tex:'bed'});
// food: [nutrition, saturation modifier*nutrition*2 => saturation]
const food=(k,n,sat,o)=>item(k,Object.assign({food:{n,s:sat}},o||{}));
food('apple',4,2.4);food('bread',5,6);food('baked_potato',5,6);food('carrot',3,3.6,{places:B.CARROTS,plant:true});food('potato',1,0.6,{places:B.POTATOES,plant:true});
food('porkchop',3,1.8);food('cooked_porkchop',8,12.8);food('beef',3,1.8);food('cooked_beef',8,12.8);food('chicken',2,1.2,{food:{n:2,s:1.2,effects:[['hunger',600,0,0.3]]}});
food('cooked_chicken',6,7.2);food('mutton',2,1.2);food('cooked_mutton',6,9.6);food('rotten_flesh',4,0.8,{food:{n:4,s:0.8,effects:[['hunger',600,0,0.8]]}});
food('melon_slice',2,1.2);food('golden_apple',4,9.6,{food:{n:4,s:9.6,always:true,effects:[['regeneration',100,1,1],['absorption',2400,0,1]]}});
ITEM[I.SPIDER_EYE].food={n:2,s:3.2,effects:[['poison',100,0,1]]};
// tools
for(const t of ['sword','axe','pickaxe','shovel','hoe'])TIER_ORDER.forEach((tier,ti)=>{
  const tb=TOOL_BASE[t];const tr=TIERS[tier];
  item((tier==='wood'?'wooden':(tier==='gold'?'golden':tier))+'_'+t,{stack:1,durability:tr.dur,tool:{type:t,tier,level:tr.level,speed:tr.speed},
    attack:tb.dmg[ti],attackSpeed:Array.isArray(tb.spd)?tb.spd[ti]:tb.spd,ench:tr.ench,fireproof:tier==='netherite'});});
// armor
for(const mat in ARMOR)ARMOR_SLOTS.forEach((slot,si)=>{const a=ARMOR[mat];
  item((mat==='gold'?'golden':mat)+'_'+slot,{stack:1,durability:a.base*ARMOR_MUL[si],armor:{slot:si,def:a.def[si],tough:a.tough,kb:a.kb||0},ench:a.ench,fireproof:mat==='netherite'});});
const itemKey=id=>ITEM[id]?ITEM[id].key:'?';
const itemName=st=>{if(!st)return '';const it=ITEM[st.id];if(!it)return 'Unknown';let n=st.name||it.name;return n;};
const maxStack=id=>ITEM[id]?ITEM[id].stack:64;
const maxDamage=id=>ITEM[id]&&ITEM[id].durability||0;
const FUEL={};
(()=>{const f=(k,t)=>{const id=I[k.toUpperCase()];if(id)FUEL[id]=t;};
  f('coal',1600);f('charcoal',1600);f('coal_block',16000);f('stick',100);f('sapling',100);f('lava_bucket',20000);f('blaze_rod',2400);
  for(const w of S.WOODS){f(w+'_log',300);f(w+'_planks',300);}
  f('crafting_table',300);f('bookshelf',300);f('chest',300);f('oak_slab',150);f('oak_stairs',300);f('oak_fence',300);f('white_wool',100);f('ladder',300);
  for(const t of ['sword','axe','pickaxe','shovel','hoe'])f('wooden_'+t,200);f('bow',300);})();
const SMELT={};
(()=>{const s=(a,b,xp)=>{SMELT[I[a.toUpperCase()]]={out:I[b.toUpperCase()],xp};};
  s('raw_iron','iron_ingot',0.7);s('iron_ore','iron_ingot',0.7);s('raw_gold','gold_ingot',1);s('gold_ore','gold_ingot',1);s('raw_copper','copper_ingot',0.7);
  s('copper_ore','copper_ingot',0.7);s('sand','glass',0.1);s('red_sand','glass',0.1);s('cobblestone','stone',0.1);s('clay_ball','brick',0.3);
  s('porkchop','cooked_porkchop',0.35);s('beef','cooked_beef',0.35);s('chicken','cooked_chicken',0.35);s('mutton','cooked_mutton',0.35);
  s('potato','baked_potato',0.35);s('ancient_debris','netherite_scrap',2);s('nether_quartz_ore','quartz',0.2);s('diamond_ore','diamond',1);
  s('clay','terracotta',0.35);
  for(const w of S.WOODS)s(w+'_log','charcoal',0.15);})();

/* ---------------- enchantments ---------------- */
const ENCH={
  efficiency:{name:'Efficiency',max:5,on:['pickaxe','axe','shovel','hoe','shears']},
  unbreaking:{name:'Unbreaking',max:3,on:['*']},
  fortune:{name:'Fortune',max:3,on:['pickaxe','axe','shovel','hoe'],excl:'silk_touch'},
  silk_touch:{name:'Silk Touch',max:1,on:['pickaxe','axe','shovel','hoe'],excl:'fortune'},
  sharpness:{name:'Sharpness',max:5,on:['sword','axe']},
  knockback:{name:'Knockback',max:2,on:['sword']},
  fire_aspect:{name:'Fire Aspect',max:2,on:['sword']},
  looting:{name:'Looting',max:3,on:['sword']},
  protection:{name:'Protection',max:4,on:['armor']},
  feather_falling:{name:'Feather Falling',max:4,on:['boots']},
  respiration:{name:'Respiration',max:3,on:['helmet']},
  power:{name:'Power',max:5,on:['bow']},
  infinity:{name:'Infinity',max:1,on:['bow']},
};
function enchantCategories(id){const it=ITEM[id];if(!it)return [];const c=[];if(it.tool)c.push(it.tool.type);if(it.armor){c.push('armor');c.push(ARMOR_SLOTS[it.armor.slot]==='boots'?'boots':(it.armor.slot===0?'helmet':''));}
  if(it.key==='bow')c.push('bow');if(it.durability)c.push('*');return c;}
const enchLvl=(st,k)=>st&&st.ench&&st.ench[k]|0;
const ROMAN=['','I','II','III','IV','V'];

/* ---------------- ItemStack operations (all return leftovers; nothing is silently discarded) ---------------- */
const cloneStack=s=>s?Object.assign({},s,s.ench?{ench:Object.assign({},s.ench)}:{}):null;
function canStack(a,b){if(!a||!b||a.id!==b.id)return false;if((a.dmg|0)!==(b.dmg|0))return false;
  const ea=a.ench?JSON.stringify(a.ench):'',eb=b.ench?JSON.stringify(b.ench):'';return ea===eb&&(a.name||'')===(b.name||'');}
function mkStack(id,count=1,extra){const s={id,count};if(extra)Object.assign(s,extra);return s;}
// insert `stack` into slot array range [from,to) (merging first, then empty slots). Mutates slots, returns leftover stack or null.
function insertStack(slots,stack,from=0,to=slots.length,filter){
  if(!stack||stack.count<=0)return null;
  let s=cloneStack(stack);const ms=maxStack(s.id);
  for(let i=from;i<to&&s.count>0;i++){const t=slots[i];if(t&&canStack(t,s)&&t.count<ms){const k=Math.min(s.count,ms-t.count);t.count+=k;s.count-=k;}}
  for(let i=from;i<to&&s.count>0;i++){if(!slots[i]&&(!filter||filter(i,s))){const k=Math.min(s.count,ms);const n=cloneStack(s);n.count=k;slots[i]=n;s.count-=k;}}
  return s.count>0?s:null;
}
// how many of `stack` would fit (no mutation)
function fitCount(slots,stack,from=0,to=slots.length){
  if(!stack)return 0;const ms=maxStack(stack.id);let n=0;
  for(let i=from;i<to;i++){const t=slots[i];if(!t)n+=ms;else if(canStack(t,stack))n+=Math.max(0,ms-t.count);if(n>=stack.count)return stack.count;}
  return Math.min(n,stack.count);
}
function countId(slots,id){let n=0;for(const s of slots)if(s&&s.id===id)n+=s.count;return n;}
function removeId(slots,id,n){for(let i=slots.length-1;i>=0&&n>0;i--){const s=slots[i];if(s&&s.id===id){const k=Math.min(n,s.count);s.count-=k;n-=k;if(!s.count)slots[i]=null;}}return n;}
function sanitizeStack(o){ // untrusted -> valid stack or null
  if(!o||typeof o!=='object')return null;const id=o.id|0;if(!ITEM[id])return null;
  const count=clamp(Math.floor(finite(o.count,1)),1,maxStack(id));const s={id,count};
  const md=maxDamage(id);if(md&&o.dmg)s.dmg=clamp(Math.floor(finite(o.dmg,0)),0,md-1);
  if(o.ench&&typeof o.ench==='object'){const e={};for(const k in o.ench)if(ENCH[k])e[k]=clamp(o.ench[k]|0,1,ENCH[k].max);if(Object.keys(e).length)s.ench=e;}
  if(typeof o.name==='string'&&o.name.length<50)s.name=o.name;
  return s;
}
// V1 save item ids (0..25 blocks, 100..103 items) -> current ids
function migrateV1Item(id){if(id>=1&&id<=25)return id;return ({100:I.COAL,101:I.STICK,102:I.IRON_INGOT,103:I.DIAMOND})[id]||0;}
