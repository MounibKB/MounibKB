// Concatenates the VoxelCraft sources into the single-file deliverable ../voxelcraft.html
// Usage: node voxelcraft-src/build.js
const fs=require('fs'),path=require('path');
const dir=__dirname;
const read=f=>fs.readFileSync(path.join(dir,f),'utf8');
const js=fs.readdirSync(dir).filter(f=>/^\d\d_.*\.js$/.test(f)).sort().map(f=>`// ===== ${f} =====\n`+read(f)).join('\n');
const html=read('index.html').replace('/*__SCRIPT__*/',()=>js);
fs.writeFileSync(path.join(dir,'..','voxelcraft.html'),html);
console.log('wrote voxelcraft.html',(html.length/1024).toFixed(0)+' KB');
