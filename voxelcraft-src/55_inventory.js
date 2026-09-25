/* =====================================================================
   INVENTORY, RECIPES, SMELTING, LOOT
   Every mutation either completes fully or leaves state untouched; anything
   that does not fit is returned to the caller (which drops it as an entity).
   ===================================================================== */
class PlayerInventory{
  constructor(){this.main=new Array(36).fill(null);this.armor=new Array(4).fill(null);this.offhand=[null];this.sel=0;}
  held(){return this.main[this.sel];}
  // pickup order: merge into existing stacks (hotbar first), then empty hotbar slots, then main inventory
  insert(stack){
    if(!stack)return null;let s=cloneStack(stack);const ms=maxStack(s.id);
    const order=[...Array(9).keys(),...Array.from({length:27},(_,i)=>i+9)];
    for(const i of order){const t=this.main[i];if(t&&canStack(t,s)&&t.count<ms){const k=Math.min(s.count,ms-t.count);t.count+=k;s.count-=k;if(!s.count)break;}}
    if(s.count&&this.offhand[0]&&canStack(this.offhand[0],s)&&this.offhand[0].count<ms){const k=Math.min(s.count,ms-this.offhand[0].count);this.offhand[0].count+=k;s.count-=k;}
    for(const i of order){if(!s.count)break;if(!this.main[i]){const k=Math.min(s.count,ms);const n=cloneStack(s);n.count=k;this.main[i]=n;s.count-=k;}}
    if(s.count<stack.count)onInventoryChanged();
    return s.count>0?s:null;
  }
  fits(stack){return fitCount(this.main,stack)>=stack.count;}
  count(id){return countId(this.main,id)+countId(this.offhand,id);}
  remove(id,n){const left=removeId(this.main,id,n);const l2=left>0?removeId(this.offhand,id,left):0;onInventoryChanged();return l2;}
  all(){return [...this.main,...this.armor,...this.offhand];}
  clear(){this.main.fill(null);this.armor.fill(null);this.offhand[0]=null;onInventoryChanged();}
  save(){return {main:this.main.map(cloneStack),armor:this.armor.map(cloneStack),off:cloneStack(this.offhand[0]),sel:this.sel};}
  load(o){if(!o)return;const arr=(a,n)=>Array.from({length:n},(_,i)=>Array.isArray(a)?sanitizeStack(a[i]):null);
    this.main=arr(o.main,36);this.armor=arr(o.armor,4);this.offhand=[sanitizeStack(o.off)];this.sel=clamp(o.sel|0,0,8);
    for(let i=0;i<4;i++){const s=this.armor[i];if(s&&!(ITEM[s.id].armor&&ITEM[s.id].armor.slot===i)&&!(i===0&&s.id===B.PUMPKIN)){const l=this.insert(s);this.armor[i]=null;if(l)pendingDrops.push(l);}}}
}
const pendingDrops=[];
/* ---------------- recipes ---------------- */
const TAGS={planks:S.WOOD_PLANKS,logs:S.WOOD_LOG.concat([B.CRIMSON_STEM,B.WARPED_STEM]),stone_crafting:[B.COBBLESTONE,B.BLACKSTONE],coals:[I.COAL,I.CHARCOAL]};
const RECIPES=[];
const ing=x=>{if(x==null)return null;if(Array.isArray(x))return x;if(typeof x==='string'){if(x[0]==='#')return TAGS[x.slice(1)];const id=I[x.toUpperCase()];if(!id)throw new Error('bad ingredient '+x);return [id];}return [x];};
function shaped(out,n,pattern,key,o){const P=pattern.map(r=>r.split(''));const K={};for(const k in key)K[k]=ing(key[k]);
  const outId=typeof out==='number'?out:I[out.toUpperCase()];if(!outId)throw new Error('bad output '+out);
  RECIPES.push(Object.assign({type:'shaped',out:outId,n,w:P[0].length,h:P.length,cells:P.map(r=>r.map(c=>c===' '?null:K[c])),id:RECIPES.length},o||{}));}
function shapeless(out,n,list,o){const outId=typeof out==='number'?out:I[out.toUpperCase()];if(!outId)throw new Error('bad output '+out);
  RECIPES.push(Object.assign({type:'shapeless',out:outId,n,list:list.map(ing),id:RECIPES.length},o||{}));}
(()=>{
  S.WOODS.forEach((w,i)=>{shapeless(S.WOOD_PLANKS[i],4,[S.WOOD_LOG[i]]);});
  shaped('stick',4,['P','P'],{P:'#planks'});
  shaped('crafting_table',1,['PP','PP'],{P:'#planks'});
  shaped('chest',1,['PPP','P P','PPP'],{P:'#planks'});
  shaped('furnace',1,['CCC','C C','CCC'],{C:'#stone_crafting'});
  shaped('torch',4,['C','S'],{C:'#coals',S:'stick'});
  const mats={wooden:'#planks',stone:'#stone_crafting',iron:'iron_ingot',golden:'gold_ingot',diamond:'diamond'};
  for(const t in mats){const M=mats[t];
    shaped(t+'_pickaxe',1,['MMM',' S ',' S '],{M,S:'stick'});shaped(t+'_axe',1,['MM','MS',' S'],{M,S:'stick'});shaped(t+'_shovel',1,['M','S','S'],{M,S:'stick'});
    shaped(t+'_sword',1,['M','M','S'],{M,S:'stick'});shaped(t+'_hoe',1,['MM',' S',' S'],{M,S:'stick'});}
  for(const t of ['sword','axe','pickaxe','shovel','hoe'])shapeless('netherite_'+t,1,['diamond_'+t,'netherite_ingot'],{keepData:true});
  const am={leather:'leather',iron:'iron_ingot',golden:'gold_ingot',diamond:'diamond'};
  for(const t in am){const M=am[t];shaped(t+'_helmet',1,['MMM','M M'],{M});shaped(t+'_chestplate',1,['M M','MMM','MMM'],{M});shaped(t+'_leggings',1,['MMM','M M','M M'],{M});shaped(t+'_boots',1,['M M','M M'],{M});}
  for(const t of ARMOR_SLOTS)shapeless('netherite_'+t,1,['diamond_'+t,'netherite_ingot'],{keepData:true});
  shaped('bow',1,[' ST','S T',' ST'],{S:'stick',T:'string'});shaped('arrow',4,['F','S','E'],{F:'flint',S:'stick',E:'feather'});
  shaped('bucket',1,['I I',' I '],{I:'iron_ingot'});shapeless('flint_and_steel',1,['iron_ingot','flint']);shaped('shears',1,[' I','I '],{I:'iron_ingot'});
  shaped('bread',1,['WWW'],{W:'wheat'});shaped('golden_apple',1,['GGG','GAG','GGG'],{G:'gold_ingot',A:'apple'});
  shaped('ladder',3,['S S','SSS','S S'],{S:'stick'});shaped('oak_fence',3,['PSP','PSP'],{P:'#planks',S:'stick'});
  shaped('cobblestone_wall',6,['CCC','CCC'],{C:'cobblestone'});shaped('glass_pane',16,['GGG','GGG'],{G:'glass'});
  shaped('oak_door_item',3,['PP','PP','PP'],{P:'#planks'});shaped('iron_door_item',3,['II','II','II'],{I:'iron_ingot'});shaped('oak_trapdoor',2,['PPP','PPP'],{P:'#planks'});
  shaped('bed_item',1,['WWW','PPP'],{W:'white_wool',P:'#planks'});
  shaped('stone_slab',6,['SSS'],{S:'stone'});shaped('cobblestone_slab',6,['SSS'],{S:'cobblestone'});shaped('oak_slab',6,['SSS'],{S:'#planks'});
  shaped('oak_stairs',4,['P  ','PP ','PPP'],{P:'#planks'});shaped('cobblestone_stairs',4,['P  ','PP ','PPP'],{P:'cobblestone'});shaped('stone_brick_stairs',4,['P  ','PP ','PPP'],{P:'stone_bricks'});
  shaped('stone_bricks',4,['SS','SS'],{S:'stone'});shaped('bricks',1,['BB','BB'],{B:'brick'});shaped('sandstone',1,['SS','SS'],{S:'sand'});
  shaped('tnt',1,['GSG','SGS','GSG'],{G:'gunpowder',S:'sand'});shaped('bookshelf',1,['PPP','BBB','PPP'],{P:'#planks',B:'book'});
  shapeless('book',1,['paper','paper','paper','leather']);shaped('paper',3,['SSS'],{S:'sugar_cane'});shapeless('sugar',1,['sugar_cane']);
  shaped('enchanting_table',1,[' B ','DOD','OOO'],{B:'book',D:'diamond',O:'obsidian'});
  const blk=(b,i,n=9)=>{if(n===9)shaped(b,1,['XXX','XXX','XXX'],{X:i});else shaped(b,1,['XX','XX'],{X:i});shapeless(i,n,[b]);};
  blk('iron_block','iron_ingot');blk('gold_block','gold_ingot');blk('diamond_block','diamond');blk('emerald_block','emerald');blk('lapis_block','lapis_lazuli');
  blk('redstone_block','redstone');blk('coal_block','coal');blk('copper_block','copper_ingot',4);RECIPES.pop();blk('hay_block','wheat');blk('melon','melon_slice');RECIPES.pop();
  shaped('lever',1,['S','C'],{S:'stick',C:'cobblestone'});shapeless('stone_button',1,['stone']);shaped('stone_pressure_plate',1,['SS'],{S:'stone'});
  shaped('redstone_torch',1,['R','S'],{R:'redstone',S:'stick'});shaped('repeater',1,['TRT','SSS'],{T:'redstone_torch',R:'redstone',S:'stone'});
  shaped('piston',1,['PPP','CIC','CRC'],{P:'#planks',C:'cobblestone',I:'iron_ingot',R:'redstone'});shaped('sticky_piston',1,['S','P'],{S:'slime_ball',P:'piston'});
  shaped('observer',1,['CCC','RRQ','CCC'],{C:'cobblestone',R:'redstone',Q:'quartz'});shaped('redstone_lamp',1,[' R ','RGR',' R '],{R:'redstone',G:'glowstone'});
  shaped('rail',16,['I I','ISI','I I'],{I:'iron_ingot',S:'stick'});
  shapeless('blaze_powder',2,['blaze_rod']);shapeless('eye_of_ender',1,['ender_pearl','blaze_powder']);
  shaped('glowstone',1,['GG','GG'],{G:'glowstone_dust'});shaped('snow_block',1,['SS','SS'],{S:'snowball'});shaped('clay',1,['CC','CC'],{C:'clay_ball'});
  shapeless('bone_meal',3,['bone']);shaped('white_wool',1,['SS','SS'],{S:'string'});shapeless('mossy_cobblestone',1,['cobblestone','vine']);
  shapeless('netherite_ingot',1,['netherite_scrap','netherite_scrap','netherite_scrap','netherite_scrap','gold_ingot','gold_ingot','gold_ingot','gold_ingot']);
})();
// grid: array of stacks, size w x h. Returns {recipe, result} or null
function matchRecipe(grid,w,h){
  let x0=w,y0=h,x1=-1,y1=-1,items=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const s=grid[y*w+x];if(s){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);items.push(s);}}
  if(x1<0)return null;const bw=x1-x0+1,bh=y1-y0+1;
  for(const r of RECIPES){
    if(r.type==='shaped'){if(r.w!==bw||r.h!==bh)continue;
      for(const mirror of [false,true]){let ok=true;
        for(let y=0;y<bh&&ok;y++)for(let x=0;x<bw&&ok;x++){const cell=r.cells[y][mirror?bw-1-x:x],s=grid[(y+y0)*w+(x+x0)];
          if(!cell){if(s)ok=false;}else if(!s||!cell.includes(s.id))ok=false;}
        if(ok)return {recipe:r,result:resultOf(r,grid)};}}
    else{if(r.list.length!==items.length)continue;const used=new Array(items.length).fill(false);let ok=true;
      for(const opt of r.list){let f=-1;for(let i=0;i<items.length;i++)if(!used[i]&&opt.includes(items[i].id)){f=i;break;}if(f<0){ok=false;break;}used[f]=true;}
      if(ok)return {recipe:r,result:resultOf(r,grid)};}
  }
  return null;
}
function resultOf(r,grid){const out=mkStack(r.out,r.n);
  if(r.keepData){const src=grid.find(s=>s&&ITEM[s.id]&&(ITEM[s.id].tool||ITEM[s.id].armor));if(src){if(src.ench)out.ench=Object.assign({},src.ench);if(src.dmg)out.dmg=Math.min(src.dmg,maxDamage(out.id)-1);}}
  return out;}
const REMAINDER={[I.WATER_BUCKET]:I.BUCKET,[I.LAVA_BUCKET]:I.BUCKET,[I.MILK_BUCKET]:I.BUCKET};
// consume one set of ingredients from grid; remainders go back into the grid slot or are returned
function consumeGrid(grid){const extra=[];for(let i=0;i<grid.length;i++){const s=grid[i];if(!s)continue;const rem=REMAINDER[s.id];s.count--;if(s.count<=0)grid[i]=null;
  if(rem){if(!grid[i])grid[i]=mkStack(rem,1);else extra.push(mkStack(rem,1));}}return extra;}
function recipeIngredientsIds(r){return r.type==='shaped'?r.cells.flat().filter(Boolean).map(c=>c[0]):r.list.map(c=>c[0]);}
/* ---------------- loot tables ---------------- */
const LOOT_TABLES={
  1:[['bread',1,4,20],['apple',1,3,15],['iron_ingot',1,3,10],['wheat_seeds',2,5,10],['sapling',1,2,10],['torch',2,6,10],['emerald',1,2,5],['golden_apple',1,1,1]],
  2:[['bone',1,8,20],['rotten_flesh',1,8,20],['gunpowder',1,6,15],['string',1,6,15],['iron_ingot',1,4,10],['gold_ingot',1,4,5],['bread',1,1,15],['wheat',1,4,15],['golden_apple',1,1,3],['diamond',1,2,2],['book',1,2,5]],
  3:[['bone',4,6,25],['rotten_flesh',3,7,25],['gold_ingot',2,7,15],['iron_ingot',1,5,15],['emerald',1,3,15],['diamond',1,3,5],['golden_apple',1,1,20],['tnt',1,3,5]],
  4:[['rail',4,8,20],['torch',1,16,15],['iron_ingot',1,5,10],['gold_ingot',1,3,5],['coal',3,8,10],['bread',1,3,15],['redstone',4,9,5],['lapis_lazuli',4,9,5],['diamond',1,2,3],['wheat_seeds',2,4,10]],
  5:[['obsidian',1,2,40],['flint',1,4,40],['iron_ingot',9,18,40],['flint_and_steel',1,1,40],['golden_apple',1,1,15],['gold_ingot',2,8,15],['golden_sword',1,1,15],['golden_pickaxe',1,1,15]],
  6:[['ender_pearl',1,1,10],['iron_ingot',1,5,10],['gold_ingot',1,3,5],['redstone',4,9,5],['bread',1,3,15],['apple',1,3,15],['iron_pickaxe',1,1,5],['iron_sword',1,1,5],['book',1,3,10],['diamond',1,3,3]],
  7:[['diamond',1,3,5],['iron_ingot',1,5,5],['gold_ingot',1,3,15],['golden_sword',1,1,5],['flint_and_steel',1,1,5],['obsidian',2,4,2],['blaze_rod',1,2,5]],
};
function rollLoot(table,rng=Math.random){const t=LOOT_TABLES[table];if(!t)return [];const out=[];const rolls=3+Math.floor(rng()*5);
  for(let r=0;r<rolls;r++){const e=S.pickWeighted(t.map(x=>[x,x[3]]),rng);const id=I[e[0].toUpperCase()];if(!id)continue;const n=e[1]+Math.floor(rng()*(e[2]-e[1]+1));out.push(mkStack(id,Math.min(n,maxStack(id))));}
  return out;}
/* ---------------- furnace simulation (block-entity tick) ---------------- */
function furnaceTick(be){
  const [inp,fuel,out]=be.items;const rec=inp&&SMELT[inp.id];
  const canCook=rec&&(!out||(out.id===rec.out&&out.count<maxStack(out.id)));
  let changed=false;
  if(be.burn>0){be.burn--;changed=true;}
  if(be.burn<=0&&canCook&&fuel&&FUEL[fuel.id]){be.burn=be.burnMax=FUEL[fuel.id];const rem=REMAINDER[fuel.id];fuel.count--;if(fuel.count<=0)be.items[1]=rem?mkStack(rem,1):null;changed=true;}
  if(be.burn>0&&canCook){be.cook++;if(be.cook>=200){be.cook=0;inp.count--;if(inp.count<=0)be.items[0]=null;
    if(be.items[2])be.items[2].count++;else be.items[2]=mkStack(rec.out,1);be.xp+=rec.xp;}changed=true;}
  else if(be.cook>0){be.cook=Math.max(0,be.cook-2);changed=true;}
  const v=getV(be.x,be.y,be.z);if(v>0&&(v&255)===B.FURNACE){const lit=be.burn>0?4:0;if(((v>>8)&4)!==lit)setV(be.x,be.y,be.z,V(B.FURNACE,((v>>8)&3)|lit),SET_NO_CALLBACKS);}
  if(changed)beDirty(be);
}
function spawnerTick(be){
  if(--be.delay>0)return;be.delay=200+randInt(0,600);
  if(!player.alive()||Math.hypot(player.pos[0]-be.x,player.pos[1]-be.y,player.pos[2]-be.z)>16||world.difficulty===0)return;
  const v=getV(be.x,be.y,be.z);const type=S.SPAWNER_MOBS[(v>>8)&3]||'zombie';const def=MOBS[type];
  let near=0;for(const e of world.entities)if(e.type===type&&Math.abs(e.pos[0]-be.x)<9&&Math.abs(e.pos[2]-be.z)<9)near++;if(near>=6)return;
  for(let i=0;i<4;i++){const x=be.x+randInt(-4,4),y=be.y+randInt(-1,1),z=be.z+randInt(-4,4);
    if(!def.flying&&!solidTop(getV(x,y-1,z)))continue;if(type!=='blaze'&&(getLight(x,y,z)&15)>11)continue;
    const a=[x+0.5-def.w/2,y,z+0.5-def.w/2,x+0.5+def.w/2,y+def.h,z+0.5+def.w/2];if(!aabbFree(a))continue;const m=spawnMob(type,x+0.5,y,z+0.5);if(m){m.persistent=false;particlesAt([x+0.5,y+0.5,z+0.5],10,[0.3,0.3,0.3]);}}
}
function tickBlockEntities(){
  for(const be of world.be.values()){
    const c=chunkAt(be.x,be.z);if(!c||!c.data)continue;
    if(be.type==='furnace')furnaceTick(be);else if(be.type==='spawner')spawnerTick(be);
  }
}
