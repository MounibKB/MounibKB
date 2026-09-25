/* =====================================================================
   AUDIO: synthesized sound events, throttling, positional attenuation,
   rain ambience, sparse generative music, underwater muffling
   ===================================================================== */
const sfx=(()=>{
  let ac=null,master=null,sfxBus=null,musicBus=null,muffle=null,noise=null,rainNode=null,rainGain=null,voices=0;
  const last={};
  function init(){if(ac)return;try{ac=new (window.AudioContext||window.webkitAudioContext)();
    master=ac.createGain();muffle=ac.createBiquadFilter();muffle.type='lowpass';muffle.frequency.value=20000;muffle.connect(master);master.connect(ac.destination);
    sfxBus=ac.createGain();sfxBus.connect(muffle);musicBus=ac.createGain();musicBus.connect(master);
    noise=ac.createBuffer(1,ac.sampleRate*1,ac.sampleRate);const d=noise.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    rainNode=ac.createBufferSource();rainNode.buffer=noise;rainNode.loop=true;const rf=ac.createBiquadFilter();rf.type='bandpass';rf.frequency.value=2500;rf.Q.value=0.4;
    rainGain=ac.createGain();rainGain.gain.value=0;rainNode.connect(rf);rf.connect(rainGain);rainGain.connect(sfxBus);rainNode.start();
    applyVolume();}catch(e){ac=null;}}
  function applyVolume(){if(!ac)return;master.gain.value=settings.volume;musicBus.gain.value=settings.music*0.5;}
  function out(x,y,z,vol){ // positional gain + pan node
    const g=ac.createGain();let gain=vol;let pan=null;
    if(x!==undefined&&isFinite(x)){const e=player.pos,dx=x-e[0],dy=y-e[1],dz=z-e[2],d=Math.hypot(dx,dy,dz);gain*=Math.max(0,1-d/24);if(gain<=0.002)return null;
      if(ac.createStereoPanner){pan=ac.createStereoPanner();const a=Math.atan2(dx,-dz)+player.yaw;pan.pan.value=clamp(Math.sin(-a)*0.8,-1,1);g.connect(pan);pan.connect(sfxBus);}}
    if(!pan)g.connect(sfxBus);g.gain.value=gain;return g;}
  function burst(dst,freq,dur,vol,q=1,type='bandpass'){const s=ac.createBufferSource();s.buffer=noise;s.playbackRate.value=0.5+Math.random();const f=ac.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=ac.createGain(),t=ac.currentTime;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);s.connect(f);f.connect(g);g.connect(dst);s.start(t,Math.random()*0.5);s.stop(t+dur);
    voices++;s.onended=()=>voices--;}
  function tone(dst,type,f0,f1,dur,vol,delay=0){const o=ac.createOscillator();o.type=type;const g=ac.createGain(),t=ac.currentTime+delay;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,f1),t+dur);
    g.gain.setValueAtTime(0.0001,t);g.gain.linearRampToValueAtTime(vol,t+Math.min(0.02,dur/4));g.gain.exponentialRampToValueAtTime(0.001,t+dur);o.connect(g);g.connect(dst);o.start(t);o.stop(t+dur);voices++;o.onended=()=>voices--;}
  const MAT={stone:[700,1.2],wood:[420,1.5],gravel:[1300,1],grass:[2600,0.8],sand:[2200,0.7],glass:[3200,6],wool:[900,0.6],metal:[1500,8],snow:[1800,0.6],slime:[300,2],fire:[600,0.5]};
  const SOUNDS={
    fizz:d=>burst(d,4000,0.5,0.4,0.5,'highpass'),portal:d=>{tone(d,'sine',120,300,1.5,0.25);burst(d,800,1.5,0.2,1);},portal_open:d=>{tone(d,'sine',200,600,2,0.3);tone(d,'triangle',300,900,2,0.15);},
    portal_travel:d=>{tone(d,'sine',400,80,2,0.3);burst(d,500,1.8,0.25,0.7);},door_open:d=>{burst(d,500,0.25,0.5,2);tone(d,'triangle',180,140,0.2,0.1);},door_close:d=>{burst(d,380,0.2,0.6,2);},
    click:d=>{tone(d,'square',1500,900,0.04,0.12);},piston_out:d=>{burst(d,600,0.25,0.5,1.5);tone(d,'square',120,200,0.15,0.08);},piston_in:d=>{burst(d,500,0.25,0.4,1.5);},
    explode:d=>{burst(d,300,1.6,1.2,0.4,'lowpass');burst(d,90,1.9,1.4,0.6,'lowpass');},fuse:d=>{burst(d,3000,1.2,0.3,0.4,'highpass');},hiss:d=>{burst(d,3500,1.3,0.5,0.4,'highpass');},
    pickup:d=>{tone(d,'sine',1200,1800,0.06,0.12);},xp:d=>{tone(d,'sine',1500+Math.random()*800,2400,0.08,0.1);},levelup:d=>{[523,659,784].forEach((f,i)=>tone(d,'triangle',f,f,0.25,0.12,i*0.1));},
    break_tool:d=>{burst(d,2200,0.3,0.6,3);},equip:d=>{burst(d,1800,0.15,0.3,3);},eat:d=>{burst(d,1200,0.08,0.4,1.2);},drink:d=>{tone(d,'sine',300,220,0.1,0.15);},burp:d=>{tone(d,'sawtooth',160,90,0.3,0.12);},
    attack:d=>{burst(d,900,0.1,0.25,1);},crit:d=>{burst(d,2500,0.12,0.35,3);},sweep:d=>{burst(d,1800,0.2,0.3,1,'highpass');},
    bow:d=>{tone(d,'triangle',300,700,0.12,0.2);burst(d,1500,0.15,0.2,1);},arrow_hit:d=>{burst(d,800,0.1,0.4,3);},throw:d=>{burst(d,1300,0.15,0.2,1,'highpass');},
    flint:d=>{burst(d,4000,0.12,0.5,2);},bucket_fill:d=>{tone(d,'sine',300,600,0.25,0.15);burst(d,1500,0.3,0.2,1);},bucket_empty:d=>{tone(d,'sine',600,300,0.25,0.15);burst(d,1500,0.3,0.2,1);},
    teleport:d=>{tone(d,'sine',800,200,0.4,0.2);tone(d,'sine',200,900,0.4,0.15,0.1);},thunder:d=>{burst(d,120,3.5,1.6,0.5,'lowpass');burst(d,60,4,1.5,0.5,'lowpass');},
    hurt:d=>{tone(d,'square',230,110,0.22,0.18);},fall_small:d=>{burst(d,300,0.15,0.5,1,'lowpass');},fall_big:d=>{burst(d,200,0.3,0.8,1,'lowpass');},
    swim:d=>{burst(d,700,0.3,0.25,0.8,'lowpass');},splash:d=>{burst(d,900,0.6,0.5,0.6);},glass:d=>{burst(d,3000,0.3,0.5,6);tone(d,'triangle',2500,900,0.25,0.15);},
    milk:d=>tone(d,'sine',400,500,0.3,0.15),shear:d=>burst(d,3000,0.12,0.3,3),eye_place:d=>tone(d,'sine',900,600,0.4,0.2),
    ghast_shoot:d=>{tone(d,'sawtooth',500,200,0.4,0.15);burst(d,600,0.4,0.3);},blaze_shoot:d=>{burst(d,1200,0.3,0.4,1);},enderman_scream:d=>{tone(d,'sawtooth',900,300,0.8,0.12);},
    dragon_growl:d=>{tone(d,'sawtooth',70,50,1.5,0.35);burst(d,200,1.4,0.4,1,'lowpass');},dragon_hurt:d=>{tone(d,'sawtooth',160,80,0.6,0.3);},dragon_death:d=>{tone(d,'sawtooth',120,30,5,0.4);burst(d,150,5,0.5,0.5,'lowpass');},
  };
  const MOBV={zombie:[110,70,'sawtooth'],skeleton:[600,400,'square'],creeper:[300,200,'square'],spider:[900,500,'sawtooth'],enderman:[500,200,'sawtooth'],pig:[300,220,'square'],cow:[140,100,'sawtooth'],
    sheep:[500,420,'triangle'],chicken:[1100,900,'square'],villager:[250,180,'sawtooth'],ghast:[700,400,'sine'],blaze:[250,150,'sawtooth'],slime:[200,120,'sine']};
  function allowed(name,gap=0.04){const t=ac.currentTime;if(last[name]&&t-last[name]<gap)return false;last[name]=t;return voices<40;}
  return {init,applyVolume,
    play(name,x,y,z){if(!ac||!SOUNDS[name]||!allowed(name))return;const d=out(x,y,z,1);if(d)SOUNDS[name](d);},
    block(mat,kind,x,y,z){if(!ac)return;const m=MAT[mat]||MAT.stone;if(!allowed(mat+kind,kind==='step'?0.12:0.05))return;const vol=kind==='step'?0.18:(kind==='hit'?0.25:(kind==='place'?0.55:0.8));const d=out(x,y,z,vol);if(!d)return;
      if(mat==='glass'&&kind==='break'){SOUNDS.glass(d);return;}burst(d,m[0]*(kind==='step'?0.8:1)*(0.9+Math.random()*0.2),kind==='break'?0.25:0.1,1,m[1]);},
    mob(e,kind){if(!ac)return;const v=MOBV[e.def&&e.def.sound]||MOBV.zombie;if(!allowed('mob'+e.id+kind,0.3))return;const d=out(e.pos[0],e.pos[1],e.pos[2],kind==='idle'?0.35:0.5);if(!d)return;
      const r=e.baby?1.5:1;tone(d,v[2],v[0]*r*(kind==='hurt'?1.3:1),v[1]*r,kind==='death'?0.7:0.35,0.12);},
    ambient(rain,underwater,dt){if(!ac)return;rainGain.gain.value+=((rain*0.25)-rainGain.gain.value)*Math.min(1,dt*2);
      const f=underwater?600:20000;muffle.frequency.value+=(f-muffle.frequency.value)*Math.min(1,dt*6);},
    music(){if(!ac||settings.music<=0)return;const scale=[261.6,293.7,329.6,392,440,523.3,587.3,659.3];let t=0;
      for(let i=0;i<12;i++){const f=scale[(Math.random()*scale.length)|0]*(Math.random()<0.3?0.5:1);tone(musicBus,'sine',f,f,2.5+Math.random()*2,0.08,t);tone(musicBus,'triangle',f*2,f*2,1.5,0.02,t);t+=0.8+Math.random()*1.6;}},
    get ctx(){return ac;}};
})();
