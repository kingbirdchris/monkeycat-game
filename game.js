/* ===========================================================================
   MonkeyCat: Jetpack Mischief  —  HTML5 endless runner
   Faithful web port of the Unity prototype (kingbirdchris/v2_MonkeyCat).
   Single-file engine. No external libs.
   ======================================================================== */
'use strict';

/* ---------- Logical resolution (letterboxed, scaled to fit) ------------- */
const VW = 1280, VH = 720;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1, dpr = Math.min(window.devicePixelRatio || 1, 2);

function resize(){
  const aw = window.innerWidth, ah = window.innerHeight;
  scale = Math.min(aw / VW, ah / VH);
  canvas.style.width  = Math.round(VW * scale) + 'px';
  canvas.style.height = Math.round(VH * scale) + 'px';
  canvas.width  = Math.round(VW * scale * dpr);
  canvas.height = Math.round(VH * scale * dpr);
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.imageSmoothingEnabled = true;
}
window.addEventListener('resize', resize);
resize();

/* ---------- Tunables (ported & tuned from Unity controller) ------------- */
const GROUND_Y   = VH - 70;          // floor collision line
const CEIL_Y     = 8;
const PX_PER_M   = 26;               // distance scale (meters)
const GRAVITY    = 2300;             // px/s^2 (Unity gravity 30 -> scaled)
const THRUST     = 4600;             // px/s^2 upward while held (net +2300 up)
const VY_UP_MAX  = -920;             // clamp rise speed (canvas y up = negative)
const VY_DN_MAX  =  1180;            // clamp fall speed
const INPUT_BUFFER = 0.12;           // s, matches Unity buffer
const SPEED_BASE = 360;              // px/s forward scroll
const SPEED_MAX  = 760;
const SPEED_RAMP = 95;               // seconds to approach max
const PLAYER_X   = VW * 0.27;

/* ---------- Asset loading ----------------------------------------------- */
const ASSETS = {
  cat:'assets/monkeycat.svg', coin:'assets/coin.svg', zapper:'assets/zapper.svg',
  laser:'assets/laser.svg', missile:'assets/missile.svg',
  shield:'assets/pu-shield.svg', magnet:'assets/pu-magnet.svg', boost:'assets/pu-boost.svg'
};
const img = {};
let assetsLoaded = 0, assetsTotal = Object.keys(ASSETS).length, ready = false;
for (const k in ASSETS){
  const im = new Image();
  im.onload = ()=>{ if(++assetsLoaded >= assetsTotal) ready = true; };
  im.onerror = ()=>{ if(++assetsLoaded >= assetsTotal) ready = true; };
  im.src = ASSETS[k];
  img[k] = im;
}

/* ---------- Audio (WebAudio, procedural, self-contained) ---------------- */
const Audio2 = (()=>{
  let ctxA=null, master=null, musicGain=null, sfxGain=null, thrustNode=null, thrustGain=null, thrustFilter=null;
  let muted = localStorage.getItem('mc_muted')==='1';
  let musicTimer=null;
  function init(){
    if(ctxA) return;
    try{
      ctxA = new (window.AudioContext||window.webkitAudioContext)();
      master = ctxA.createGain(); master.gain.value = muted?0:0.9; master.connect(ctxA.destination);
      musicGain = ctxA.createGain(); musicGain.gain.value = 0.16; musicGain.connect(master);
      sfxGain = ctxA.createGain(); sfxGain.gain.value = 0.9; sfxGain.connect(master);
    }catch(e){ ctxA=null; }
  }
  function resume(){ if(ctxA && ctxA.state==='suspended') ctxA.resume(); }
  function blip(freq, dur, type='square', vol=0.3, slideTo=null){
    if(!ctxA||muted) return;
    const o=ctxA.createOscillator(), g=ctxA.createGain();
    o.type=type; o.frequency.value=freq;
    if(slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctxA.currentTime+dur);
    g.gain.setValueAtTime(vol, ctxA.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctxA.currentTime+dur);
    o.connect(g); g.connect(sfxGain); o.start(); o.stop(ctxA.currentTime+dur+0.02);
  }
  function coin(){ blip(880,0.08,'square',0.22,1320); }
  function power(){ blip(440,0.18,'sawtooth',0.25,1100); setTimeout(()=>blip(660,0.18,'square',0.2,1480),60); }
  function ui(){ blip(520,0.06,'triangle',0.18,720); }
  function boom(){
    if(!ctxA||muted) return;
    const b=ctxA.createBufferSource(), len=ctxA.sampleRate*0.5, buf=ctxA.createBuffer(1,len,ctxA.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<len;i++){ d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2); }
    b.buffer=buf;
    const f=ctxA.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(1400,ctxA.currentTime);
    f.frequency.exponentialRampToValueAtTime(120,ctxA.currentTime+0.45);
    const g=ctxA.createGain(); g.gain.setValueAtTime(0.6,ctxA.currentTime); g.gain.exponentialRampToValueAtTime(0.001,ctxA.currentTime+0.5);
    b.connect(f); f.connect(g); g.connect(sfxGain); b.start();
  }
  function thrustOn(){
    if(!ctxA||muted||thrustNode) return;
    const len=ctxA.sampleRate*1, buf=ctxA.createBuffer(1,len,ctxA.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    thrustNode=ctxA.createBufferSource(); thrustNode.buffer=buf; thrustNode.loop=true;
    thrustFilter=ctxA.createBiquadFilter(); thrustFilter.type='bandpass'; thrustFilter.frequency.value=520; thrustFilter.Q.value=0.8;
    thrustGain=ctxA.createGain(); thrustGain.gain.value=0;
    thrustNode.connect(thrustFilter); thrustFilter.connect(thrustGain); thrustGain.connect(sfxGain);
    thrustNode.start();
    thrustGain.gain.linearRampToValueAtTime(0.16, ctxA.currentTime+0.05);
  }
  function thrustOff(){
    if(!thrustNode) return;
    try{ thrustGain.gain.linearRampToValueAtTime(0, ctxA.currentTime+0.08);
      const n=thrustNode; setTimeout(()=>{try{n.stop()}catch(e){}},120);
    }catch(e){}
    thrustNode=null;
  }
  // Simple looping music: arpeggio over a couple chords
  const scale=[0,3,5,7,10,12]; const roots=[196,220,174.61,164.81];
  let step=0;
  function noteLoop(){
    if(!ctxA||muted){ return; }
    const root=roots[Math.floor(step/8)%roots.length];
    const semi=scale[step%scale.length];
    const f=root*Math.pow(2,semi/12);
    const o=ctxA.createOscillator(), g=ctxA.createGain();
    o.type='triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,ctxA.currentTime);
    g.gain.linearRampToValueAtTime(0.5,ctxA.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,ctxA.currentTime+0.32);
    o.connect(g); g.connect(musicGain); o.start(); o.stop(ctxA.currentTime+0.34);
    // bass every 4
    if(step%4===0){
      const bo=ctxA.createOscillator(), bg=ctxA.createGain();
      bo.type='sine'; bo.frequency.value=root/2;
      bg.gain.setValueAtTime(0.0001,ctxA.currentTime);
      bg.gain.linearRampToValueAtTime(0.6,ctxA.currentTime+0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001,ctxA.currentTime+0.5);
      bo.connect(bg); bg.connect(musicGain); bo.start(); bo.stop(ctxA.currentTime+0.52);
    }
    step++;
  }
  function musicStart(){ if(musicTimer) return; init(); musicTimer=setInterval(noteLoop,200); }
  function musicStop(){ if(musicTimer){ clearInterval(musicTimer); musicTimer=null; } }
  function toggleMute(){ muted=!muted; localStorage.setItem('mc_muted', muted?'1':'0'); if(master) master.gain.value=muted?0:0.9; if(muted) thrustOff(); return muted; }
  function isMuted(){ return muted; }
  return {init,resume,coin,power,ui,boom,thrustOn,thrustOff,musicStart,musicStop,toggleMute,isMuted};
})();

/* ---------- Input ------------------------------------------------------- */
let pressing=false, lastPressTime=-10, bufferActive=false;
function press(){
  pressing=true; bufferActive=true; lastPressTime=now;
  Audio2.init(); Audio2.resume();
  if(state==='play') Audio2.thrustOn();
}
function release(){ pressing=false; Audio2.thrustOff(); }
canvas.addEventListener('pointerdown', e=>{ e.preventDefault(); if(state==='play') press(); }, {passive:false});
window.addEventListener('pointerup', e=>{ release(); });
window.addEventListener('pointercancel', release);
window.addEventListener('keydown', e=>{
  if(e.code==='Space'||e.code==='ArrowUp'){ e.preventDefault(); if(state==='play' && !e.repeat) press(); }
  if(e.code==='KeyP'){ if(state==='play') pauseGame(); else if(state==='paused') resumeGame(); }
});
window.addEventListener('keyup', e=>{ if(e.code==='Space'||e.code==='ArrowUp') release(); });

/* ---------- Game state -------------------------------------------------- */
let state='menu';   // menu | play | paused | dying | over
let now=0, lastT=0;
let player, scroll, speed, distancePx, coins, runTime, timeScale, shakeT, shakeMag, deathT;
let coinsBanked = +(localStorage.getItem('mc_coins')||0);
let bestDist = +(localStorage.getItem('mc_best')||0);
let missionsDone = +(localStorage.getItem('mc_missions')||0);
let hazards=[], collectibles=[], powerups=[], particles=[], floats=[];
let spawnTimer=0, missileTimer=0;
let activePU = {shield:false, magnet:0, boost:0};
let bg; // background controller

/* ---------- Missions ---------------------------------------------------- */
const MISSIONS = [
  {id:'collect_25', type:'coins',    target:25,  reward:40,  text:'Collect 25 banana-coins'},
  {id:'survive_60', type:'time',     target:60,  reward:60,  text:'Stay airborne for 60 seconds'},
  {id:'travel_500', type:'distance', target:500, reward:80,  text:'Travel 500 meters'},
  {id:'collect_60', type:'coins',    target:60,  reward:90,  text:'Collect 60 banana-coins in one run'},
  {id:'travel_1000',type:'distance', target:1000,reward:140, text:'Travel 1000 meters'},
  {id:'nohit_300',  type:'distance', target:300, reward:70,  text:'Reach 300 m without dying'},
];
let missionIdx = +(localStorage.getItem('mc_missionIdx')||0) % MISSIONS.length;
function currentMission(){ return MISSIONS[missionIdx]; }
function missionProgress(){
  const m=currentMission();
  if(m.type==='coins') return Math.min(coins, m.target);
  if(m.type==='time') return Math.min(runTime, m.target);
  return Math.min(distancePx/PX_PER_M, m.target);
}
let missionCompletedThisRun=false;
function checkMission(){
  if(missionCompletedThisRun) return;
  const m=currentMission();
  if(missionProgress()>=m.target){
    missionCompletedThisRun=true;
    missionsDone++; coinsBanked += m.reward;
    localStorage.setItem('mc_missions', missionsDone);
    localStorage.setItem('mc_coins', coinsBanked);
    missionIdx=(missionIdx+1)%MISSIONS.length;
    localStorage.setItem('mc_missionIdx', missionIdx);
    showToast('🎯 Mission done! +'+m.reward+' coins');
    Audio2.power();
  }
}

/* ---------- Entities ---------------------------------------------------- */
function makePlayer(){
  return { x:PLAYER_X, y:VH*0.45, w:78, h:62, vy:0, alive:true, tilt:0, flameT:0 };
}

/* ---------- Procedural jungle/lab background ---------------------------- */
function makeBG(){
  // Multiple parallax layers built procedurally for a real jungle-lab feel.
  const rnd=(a,b)=>a+Math.random()*(b-a);
  // far trees
  const farTrees=[]; for(let i=0;i<14;i++) farTrees.push({x:rnd(0,VW*2),h:rnd(160,300),w:rnd(60,120),hue:rnd(150,165)});
  // mid canopy blobs
  const canopy=[]; for(let i=0;i<22;i++) canopy.push({x:rnd(0,VW*2),y:rnd(40,260),r:rnd(60,140),hue:rnd(125,150),sat:rnd(40,60),li:rnd(22,34)});
  // foreground fronds / bushes
  const fg=[]; for(let i=0;i<16;i++) fg.push({x:rnd(0,VW*2),h:rnd(120,230),w:rnd(120,220),hue:rnd(95,120)});
  // vines
  const vines=[]; for(let i=0;i<10;i++) vines.push({x:rnd(0,VW*2),len:rnd(120,300),sway:rnd(0,6.28)});
  // overhanging top canopy clusters (frame the top like real jungle)
  const top=[]; for(let i=0;i<20;i++) top.push({x:rnd(0,VW*2),r:rnd(70,150),hue:rnd(120,140),li:rnd(16,26)});
  return {ox1:0,ox2:0,ox3:0,ox4:0, farTrees,canopy,fg,vines,top, t:0};
}
function drawBG(dt){
  const b=bg; b.t+=dt;
  const sp = state==='play'? speed : 90;
  b.ox1 += sp*0.10*dt; b.ox2 += sp*0.25*dt; b.ox3 += sp*0.5*dt; b.ox4 += sp*0.9*dt;
  const wrap=VW*2;

  // --- Sky gradient (warm jungle dawn) ---
  let g=ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#274a63'); g.addColorStop(0.4,'#3c6b6a'); g.addColorStop(0.72,'#6f9a5e'); g.addColorStop(1,'#3f6238');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);

  // sun haze
  const sun=ctx.createRadialGradient(VW*0.7,150,20,VW*0.7,150,360);
  sun.addColorStop(0,'rgba(255,240,200,.55)'); sun.addColorStop(1,'rgba(255,240,200,0)');
  ctx.fillStyle=sun; ctx.fillRect(0,0,VW,VH);

  // soft atmospheric haze (replaces hard mist band)
  const haze=ctx.createLinearGradient(0,VH*0.32,0,VH*0.72);
  haze.addColorStop(0,'rgba(214,228,210,0)'); haze.addColorStop(0.5,'rgba(214,228,210,0.16)'); haze.addColorStop(1,'rgba(214,228,210,0)');
  ctx.fillStyle=haze; ctx.fillRect(0,VH*0.32,VW,VH*0.4);

  // --- Layer 1: far misty tree line ---
  for(const t of b.farTrees){
    let x=((t.x - b.ox1)%wrap+wrap)%wrap;
    drawFarTree(x, GROUND_Y, t.w, t.h, t.hue);
    if(x>VW) drawFarTree(x-wrap, GROUND_Y, t.w, t.h, t.hue);
  }

  // --- Layer 2: mid canopy blobs ---
  for(const c of b.canopy){
    let x=((c.x - b.ox2)%wrap+wrap)%wrap;
    drawCanopy(x,c); if(x>VW-160) drawCanopy(x-wrap,c);
  }

  // --- Layer 3: hanging vines ---
  for(const v of b.vines){
    let x=((v.x - b.ox3)%wrap+wrap)%wrap;
    drawVine(x,v,b.t); if(x>VW) drawVine(x-wrap,v,b.t);
  }

  // --- Ground / runway ---
  drawGround(b.ox4);

  // --- Layer 4: foreground bushes/fronds (drawn over ground) ---
  for(const f of b.fg){
    let x=((f.x - b.ox4)%wrap+wrap)%wrap;
    drawFrond(x,GROUND_Y+8,f.w,f.h,f.hue); if(x>VW) drawFrond(x-wrap,GROUND_Y+8,f.w,f.h,f.hue);
  }

  // --- Overhanging top canopy (drawn last, frames the screen top) ---
  drawTopCanopy(b);

  // --- Depth vignette ---
  ctx.save();
  const vig=ctx.createRadialGradient(VW*0.5,VH*0.5,VH*0.35,VW*0.5,VH*0.5,VH*0.85);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(8,6,16,0.42)');
  ctx.fillStyle=vig; ctx.fillRect(0,0,VW,VH);
  ctx.restore();
}
function drawTopCanopy(b){
  const wrap=VW*2;
  // dark leafy band hanging from the top
  ctx.fillStyle='#14361f';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(VW,0); ctx.lineTo(VW,40);
  let sx=-((b.ox2*1.0)%140);
  for(let x=VW;x>=-140;x-=140){ const xx=x-((b.ox2)%140); ctx.quadraticCurveTo(xx-35,84,xx-70,44); }
  ctx.lineTo(0,40); ctx.closePath(); ctx.fill();
  // hanging leaf clumps
  for(const t of b.top){
    let x=((t.x - b.ox2)%wrap+wrap)%wrap;
    drawTopClump(x,t); if(x>VW) drawTopClump(x-wrap,t);
  }
}
function drawTopClump(x,t){
  ctx.save();
  ctx.fillStyle=`hsl(${t.hue},45%,${t.li}%)`;
  const y=10;
  for(let i=0;i<4;i++){ ctx.beginPath(); ctx.ellipse(x+(i-1.5)*t.r*0.4, y+Math.abs(Math.sin(i))*30, t.r*0.5, t.r*0.6,0,0,7); ctx.fill(); }
  ctx.fillStyle=`hsla(${t.hue},45%,${t.li+12}%,0.6)`;
  ctx.beginPath(); ctx.ellipse(x,y+10,t.r*0.4,t.r*0.45,0,0,7); ctx.fill();
  ctx.restore();
}
function drawFarTree(x,baseY,w,h,hue){
  ctx.fillStyle=`hsl(${hue},30%,30%)`;
  // trunk
  ctx.fillRect(x-w*0.08, baseY-h*0.8, w*0.16, h*0.8);
  // foliage clusters
  for(let i=0;i<4;i++){
    ctx.beginPath();
    ctx.ellipse(x+(i-1.5)*w*0.28, baseY-h*0.78+Math.sin(i)*14, w*0.42, h*0.32, 0,0,7);
    ctx.fill();
  }
}
function drawCanopy(x,c){
  ctx.save();
  ctx.fillStyle=`hsl(${c.hue},${c.sat}%,${c.li}%)`;
  // clumped leafy circle
  for(let i=0;i<5;i++){
    const a=i/5*6.28;
    ctx.beginPath();
    ctx.ellipse(x+Math.cos(a)*c.r*0.5, c.y+Math.sin(a)*c.r*0.35, c.r*0.55, c.r*0.45,0,0,7);
    ctx.fill();
  }
  ctx.beginPath(); ctx.ellipse(x,c.y,c.r*0.7,c.r*0.55,0,0,7); ctx.fill();
  // highlight
  ctx.fillStyle=`hsla(${c.hue},${c.sat}%,${c.li+14}%,0.5)`;
  ctx.beginPath(); ctx.ellipse(x-c.r*0.2,c.y-c.r*0.2,c.r*0.4,c.r*0.3,0,0,7); ctx.fill();
  ctx.restore();
}
function drawVine(x,v,t){
  ctx.save();
  ctx.strokeStyle='hsl(110,35%,28%)'; ctx.lineWidth=6; ctx.lineCap='round';
  const sway=Math.sin(t*1.2+v.sway)*16;
  ctx.beginPath(); ctx.moveTo(x,0);
  ctx.quadraticCurveTo(x+sway*0.5, v.len*0.5, x+sway, v.len); ctx.stroke();
  // leaves
  ctx.fillStyle='hsl(120,40%,34%)';
  for(let i=1;i<=3;i++){ const yy=v.len*i/4; const xx=x+sway*(i/3);
    ctx.beginPath(); ctx.ellipse(xx,yy,14,7,0.6,0,7); ctx.fill(); }
  ctx.restore();
}
function drawGround(ox){
  // dark soil base
  let g=ctx.createLinearGradient(0,GROUND_Y,0,VH);
  g.addColorStop(0,'#3a2a1c'); g.addColorStop(1,'#221710');
  ctx.fillStyle=g; ctx.fillRect(0,GROUND_Y,VW,VH-GROUND_Y);
  // grassy top edge
  ctx.fillStyle='#3f7a3a'; ctx.fillRect(0,GROUND_Y-6,VW,12);
  ctx.fillStyle='#4f9444';
  const wrap=120;
  let sx=-((ox)%wrap);
  for(let x=sx;x<VW;x+=wrap){
    ctx.beginPath();
    ctx.moveTo(x,GROUND_Y-6);
    ctx.quadraticCurveTo(x+30,GROUND_Y-22,x+60,GROUND_Y-6);
    ctx.quadraticCurveTo(x+90,GROUND_Y-20,x+120,GROUND_Y-6);
    ctx.fill();
  }
  // soil specks
  ctx.fillStyle='rgba(255,255,255,0.04)';
  let s2=-((ox*1.0)%60);
  for(let x=s2;x<VW;x+=60){ ctx.fillRect(x, GROUND_Y+24, 22, 4); ctx.fillRect(x+30, GROUND_Y+44, 14, 4); }
}
function drawFrond(x,baseY,w,h,hue){
  ctx.save();
  ctx.fillStyle=`hsl(${hue},45%,24%)`;
  // bush base
  ctx.beginPath(); ctx.ellipse(x,baseY,w*0.5,h*0.32,0,Math.PI,0); ctx.fill();
  // big fronds
  ctx.strokeStyle=`hsl(${hue},50%,30%)`; ctx.lineWidth=10; ctx.lineCap='round';
  for(let i=0;i<5;i++){
    const a=-Math.PI*0.5 + (i-2)*0.42;
    ctx.beginPath(); ctx.moveTo(x,baseY);
    ctx.quadraticCurveTo(x+Math.cos(a)*w*0.3, baseY-h*0.7, x+Math.cos(a)*w*0.5, baseY-h);
    ctx.stroke();
  }
  ctx.fillStyle=`hsl(${hue},48%,27%)`;
  for(let i=0;i<5;i++){
    const a=-Math.PI*0.5 + (i-2)*0.42;
    const tx=x+Math.cos(a)*w*0.5, ty=baseY-h;
    ctx.save(); ctx.translate(tx,ty); ctx.rotate(a+Math.PI*0.5);
    ctx.beginPath(); ctx.ellipse(0,0,16,46,0,0,7); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

/* ---------- Spawning ---------------------------------------------------- */
function spawnInterval(){
  // Unity: base 1.75 -> min 0.65 over ramp, modulated by progress
  const progress = Math.min(runTime/110, 1);
  const eased = progress*progress*(3-2*progress);
  let intv = 1.75 - (1.75-0.62)*eased;
  return intv * (0.85 + Math.random()*0.4);
}
function diff(){ return Math.min(distancePx/PX_PER_M/700, 1); } // 0..1 skill ramp

function spawnSet(){
  const d=diff();
  const r=Math.random();
  if(r < 0.40)            spawnZapper(d);
  else if(r < 0.66)       spawnLaserGate(d);
  else if(r < 0.82)       spawnZapperPair(d);
  else                    spawnZapper(d);

  // coins arc
  if(Math.random() < 0.85) spawnCoinArc();
  // power-up occasionally (more when struggling early)
  if(Math.random() < (0.10 + 0.10*(1-d))) spawnPowerup();
}
function spawnZapper(d){
  const h = 180 + Math.random()*180;
  const gap = 230 - d*60;
  const fromTop = Math.random()<0.5;
  const y = fromTop ? (CEIL_Y + Math.random()*(VH*0.35)) : (GROUND_Y - h - Math.random()*(VH*0.25));
  hazards.push({type:'zapper', x:VW+60, y, w:46, h, vx:0, rot:0, hit:true});
}
function spawnZapperPair(d){
  const total=GROUND_Y-CEIL_Y;
  const gap = 220 - d*70;
  const gapY = CEIL_Y + 120 + Math.random()*(total-gap-240);
  hazards.push({type:'zapper', x:VW+60, y:CEIL_Y, w:46, h:gapY-CEIL_Y, hit:true});
  hazards.push({type:'zapper', x:VW+60, y:gapY+gap, w:46, h:GROUND_Y-(gapY+gap), hit:true});
}
function spawnLaserGate(d){
  // horizontal laser that pulses on/off
  const y = CEIL_Y+120 + Math.random()*(GROUND_Y-CEIL_Y-260);
  hazards.push({type:'laser', x:VW+40, y, w:340, h:14, cycle:1.6-d*0.5, t:Math.random()*1.6, on:true, hit:true});
}
function spawnCoinArc(){
  const n = 4+Math.floor(Math.random()*5);
  const baseY = CEIL_Y+120 + Math.random()*(GROUND_Y-CEIL_Y-260);
  const amp = 60+Math.random()*120, dir=Math.random()<0.5?1:-1;
  const sx=VW+80, sp=64;
  for(let i=0;i<n;i++){
    const y = baseY + Math.sin(i/(n-1)*Math.PI)*amp*dir;
    collectibles.push({x:sx+i*sp, y, r:18, taken:false});
  }
}
function spawnPowerup(){
  const types=['shield','magnet','boost'];
  const t=types[Math.floor(Math.random()*types.length)];
  const y=CEIL_Y+120 + Math.random()*(GROUND_Y-CEIL_Y-240);
  powerups.push({x:VW+80, y, r:26, type:t, taken:false});
}
function spawnMissileWarn(){
  // missile telegraphs at player's current y, then flies in
  missiles_pending.push({y: player.y, t:1.1});
}
let missiles_pending=[];

/* ---------- Particles --------------------------------------------------- */
function burst(x,y,color,n,spd){
  for(let i=0;i<n;i++){
    const a=Math.random()*6.28, s=spd*(0.3+Math.random());
    particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:0.5+Math.random()*0.4,age:0,color,r:2+Math.random()*4});
  }
}
function floatText(x,y,txt,color){ floats.push({x,y,txt,color,age:0,life:0.9}); }

/* ---------- Lifecycle --------------------------------------------------- */
function startRun(){
  player=makePlayer();
  scroll=0; speed=SPEED_BASE; distancePx=0; coins=0; runTime=0; timeScale=1;
  shakeT=0; shakeMag=0; deathT=0;
  hazards=[]; collectibles=[]; powerups=[]; particles=[]; floats=[]; missiles_pending=[];
  spawnTimer=0.8; missileTimer=14;
  activePU={shield:false, magnet:0, boost:0};
  missionCompletedThisRun=false;
  bg=makeBG();
  state='play';
  show('hud',true); el('pauseBtn').classList.remove('hidden');
  hideAllOverlays();
  Audio2.musicStart();
  if(pressing) Audio2.thrustOn();
  updateHUD();
}
function pauseGame(){ if(state!=='play')return; state='paused'; Audio2.thrustOff(); Audio2.musicStop(); show('pause',true); }
function resumeGame(){ if(state!=='paused')return; state='play'; show('pause',false); Audio2.musicStart(); lastT=performance.now(); }
function quitToMenu(){ state='menu'; Audio2.thrustOff(); Audio2.musicStop(); hideAllOverlays(); show('menu',true); show('hud',false); el('pauseBtn').classList.add('hidden'); refreshMenu(); }

function die(){
  if(state!=='play') return;
  state='dying'; deathT=0; player.alive=false;
  Audio2.thrustOff(); Audio2.boom();
  shake(16,0.5);
  burst(player.x, player.y, '#ff9f1a', 26, 420);
  burst(player.x, player.y, '#ffd23f', 18, 300);
}
function endRun(){
  state='over';
  Audio2.musicStop();
  const dm=Math.floor(distancePx/PX_PER_M);
  coinsBanked += coins;
  localStorage.setItem('mc_coins', coinsBanked);
  let isBest=false;
  if(dm>bestDist){ bestDist=dm; localStorage.setItem('mc_best',bestDist); isBest=true; }
  el('oDist').textContent=dm+' m';
  el('oCoins').textContent=coins;
  el('oBest').textContent=bestDist+' m';
  el('overBadge').textContent = isBest ? 'NEW BEST!' : 'RUN COMPLETE';
  const m=currentMission();
  el('oMission').innerHTML = missionCompletedThisRun
    ? '<span class="new">Mission complete!</span> Next: '+m.text
    : 'Mission: <b>'+m.text+'</b> — '+Math.floor(missionProgress())+'/'+m.target;
  show('over',true);
}

/* ---------- Update ------------------------------------------------------ */
function update(dt){
  if(state==='play' || state==='dying'){
    runTime += dt; // real run time
  }
  if(state==='play'){
    // forward speed ramp
    speed = SPEED_BASE + (SPEED_MAX-SPEED_BASE)*(1-Math.exp(-runTime/SPEED_RAMP));
    if(activePU.boost>0) speed *= 1.45;
    distancePx += speed*dt;

    // player physics
    const buffered = bufferActive && (now-lastPressTime)<=INPUT_BUFFER;
    const thrust = pressing || buffered;
    if(thrust) bufferActive=false;
    player.vy += (thrust? (GRAVITY - THRUST) : GRAVITY)*dt;
    player.vy = Math.max(VY_UP_MAX, Math.min(VY_DN_MAX, player.vy));
    player.y += player.vy*dt;
    player.tilt += (((thrust?-0.34:0.30)) - player.tilt)*Math.min(1,dt*8);
    player.flameT += dt;

    // ceiling / ground
    if(player.y < CEIL_Y+player.h*0.4){ player.y=CEIL_Y+player.h*0.4; player.vy=Math.max(player.vy,0); }
    if(player.y > GROUND_Y-player.h*0.42){
      player.y=GROUND_Y-player.h*0.42;
      if(!activePU.boost){ die(); }
      else player.vy=Math.min(player.vy,0);
    }
    // thrust particles
    if(thrust && Math.random()<0.9){
      particles.push({x:player.x-26, y:player.y+18, vx:-speed*0.4-Math.random()*60, vy:60+Math.random()*120,
        life:0.4, age:0, color: Math.random()<0.5?'#ffd23f':'#ff6a00', r:3+Math.random()*4});
    }

    // power-up timers
    if(activePU.magnet>0) activePU.magnet-=dt;
    if(activePU.boost>0){ activePU.boost-=dt; if(Math.random()<0.6) burst(player.x,player.y,'#5ad6ff',1,120); }

    // spawn hazards
    spawnTimer-=dt;
    if(spawnTimer<=0){ spawnSet(); spawnTimer=spawnInterval(); }
    // missiles
    missileTimer-=dt;
    if(missileTimer<=0 && diff()>0.12){ spawnMissileWarn(); missileTimer = 8+Math.random()*7; }
    for(let i=missiles_pending.length-1;i>=0;i--){
      const mp=missiles_pending[i]; mp.t-=dt;
      if(mp.t<=0){ hazards.push({type:'missile', x:VW+80, y:mp.y, w:74, h:30, vx:-(speed+260), hit:true, hy:mp.y}); missiles_pending.splice(i,1); }
    }

    moveWorld(dt);
    handleCollisions();
    checkMission();
    updateHUD();
  }
  else if(state==='dying'){
    timeScale = 0.25;
    deathT += dt; // dt already scaled below
    moveWorld(dt*0.4);
    if(deathT>0.7){ timeScale=1; endRun(); }
  }

  // particles & floats always animate
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.age+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=400*dt;
    if(p.age>=p.life) particles.splice(i,1);
  }
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.age+=dt; f.y-=40*dt; if(f.age>=f.life) floats.splice(i,1); }
  if(shakeT>0) shakeT-=dt;
}

function moveWorld(dt){
  const dx = speed*dt;
  for(const h of hazards){
    if(h.type==='missile'){ h.x += h.vx*dt; }
    else h.x -= dx;
    if(h.type==='laser'){ h.t+=dt; if(h.t>=h.cycle){ h.t=0; h.on=!h.on; } }
  }
  for(const c of collectibles){
    if(activePU.magnet>0 && !c.taken){
      const ddx=player.x-c.x, ddy=player.y-c.y, dist=Math.hypot(ddx,ddy);
      if(dist<360){ c.x+=ddx/dist*560*dt; c.y+=ddy/dist*560*dt; }
      else c.x-=dx;
    } else c.x-=dx;
  }
  for(const p of powerups) p.x-=dx;
  // cull
  hazards=hazards.filter(h=> h.x+(h.w||0) > -120 && h.x < VW+400);
  collectibles=collectibles.filter(c=> !c.taken && c.x>-60);
  powerups=powerups.filter(p=> !p.taken && p.x>-60);
}

function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw && ax+aw>bx && ay<by+bh && ay+ah>by; }

function handleCollisions(){
  if(!player.alive) return;
  const px=player.x-player.w*0.32, py=player.y-player.h*0.34, pw=player.w*0.64, ph=player.h*0.68;
  // hazards
  for(const h of hazards){
    if(!h.hit) continue;
    let hit=false;
    if(h.type==='zapper'){ hit=aabb(px,py,pw,ph, h.x+6,h.y, h.w-12,h.h); }
    else if(h.type==='laser'){ hit = h.on && aabb(px,py,pw,ph, h.x,h.y-7, h.w,14); }
    else if(h.type==='missile'){ hit=aabb(px,py,pw,ph, h.x+8,h.y-12, h.w-16,24); }
    if(hit){
      if(activePU.boost>0){ if(h.type!=='laser'){h.hit=false; burst(h.x,h.y,'#5ad6ff',12,260);} continue; }
      if(activePU.shield){ activePU.shield=false; h.hit=false; burst(player.x,player.y,'#5ad6ff',20,300); showToast('Shield down!'); Audio2.power(); shake(8,0.25); continue; }
      die(); return;
    }
  }
  // coins
  for(const c of collectibles){
    if(c.taken) continue;
    if(Math.hypot(c.x-player.x,c.y-player.y) < c.r+player.w*0.34){
      c.taken=true; coins++; coinsTotalRun++; Audio2.coin();
      burst(c.x,c.y,'#ffd23f',6,180); floatText(c.x,c.y,'+1','#ffd23f');
    }
  }
  // powerups
  for(const p of powerups){
    if(p.taken) continue;
    if(Math.hypot(p.x-player.x,p.y-player.y) < p.r+player.w*0.36){
      p.taken=true; applyPU(p.type); Audio2.power();
      burst(p.x,p.y,'#5ad6ff',16,260);
    }
  }
}
let coinsTotalRun=0;
function applyPU(t){
  if(t==='shield'){ activePU.shield=true; showToast('🛡️ Shield up'); }
  else if(t==='magnet'){ activePU.magnet=8; showToast('🧲 Coin magnet!'); }
  else if(t==='boost'){ activePU.boost=3.5; showToast('⚡ Overcharge!'); shake(6,0.2); }
}
function shake(mag,t){ shakeMag=mag; shakeT=t; }

/* ---------- Render ------------------------------------------------------ */
function render(){
  ctx.clearRect(0,0,VW,VH);
  ctx.save();
  if(shakeT>0){ const m=shakeMag*(shakeT); ctx.translate((Math.random()-0.5)*m,(Math.random()-0.5)*m); }
  drawBG(renderDt);

  // collectibles
  for(const c of collectibles){
    if(c.taken) continue;
    const s=Math.sin(now*4+c.x*0.05)*0.12+1;
    drawImgC(img.coin, c.x, c.y, c.r*2.1*s, c.r*2.1);
  }
  // powerups
  for(const p of powerups){
    if(p.taken) continue;
    const im = p.type==='shield'?img.shield : p.type==='magnet'?img.magnet : img.boost;
    const s=Math.sin(now*3+p.x*0.04)*0.08+1;
    // glow ring
    ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle=p.type==='boost'?'#ffb000':p.type==='magnet'?'#ff4d4d':'#5ad6ff';
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r*1.5,0,7); ctx.fill(); ctx.restore();
    drawImgC(im, p.x, p.y, p.r*2.2*s, p.r*2.2*s);
  }
  // hazards
  for(const h of hazards) drawHazard(h);
  // missile warnings
  for(const mp of missiles_pending){
    const a=0.4+0.4*Math.sin(now*16);
    ctx.save(); ctx.globalAlpha=a; ctx.fillStyle='#ff3b3b';
    ctx.beginPath(); ctx.moveTo(VW-30,mp.y); ctx.lineTo(VW-58,mp.y-16); ctx.lineTo(VW-58,mp.y+16); ctx.fill();
    ctx.font='bold 22px sans-serif'; ctx.fillText('!',VW-50,mp.y+8); ctx.restore();
  }

  // player
  if(player && (state==='play'||state==='dying')) drawPlayer();

  // particles
  for(const p of particles){
    const a=1-p.age/p.life;
    ctx.globalAlpha=a; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill();
  }
  ctx.globalAlpha=1;
  // floats
  ctx.textAlign='center';
  for(const f of floats){ ctx.globalAlpha=1-f.age/f.life; ctx.fillStyle=f.color; ctx.font='bold 22px Trebuchet MS, sans-serif'; ctx.fillText(f.txt,f.x,f.y); }
  ctx.globalAlpha=1; ctx.textAlign='left';

  ctx.restore();

  // loading veil
  if(!ready){
    ctx.fillStyle='#0e0a14'; ctx.fillRect(0,0,VW,VH);
    ctx.fillStyle='#ffd23f'; ctx.font='bold 28px Trebuchet MS, sans-serif'; ctx.textAlign='center';
    ctx.fillText('Loading…',VW/2,VH/2); ctx.textAlign='left';
  }
}
function drawImgC(im,cx,cy,w,h){ if(im&&im.complete&&im.naturalWidth){ ctx.drawImage(im,cx-w/2,cy-h/2,w,h); } }

function drawHazard(h){
  if(h.type==='zapper'){
    drawImgC(img.zapper, h.x+h.w/2, h.y+h.h/2, h.w, h.h);
  } else if(h.type==='laser'){
    // emitters
    drawImgC(img.laser, h.x, h.y, 46,46);
    drawImgC(img.laser, h.x+h.w, h.y, 46,46);
    if(h.on){
      const a=0.7+0.3*Math.sin(now*30);
      ctx.save(); ctx.globalAlpha=a;
      const g=ctx.createLinearGradient(0,h.y-8,0,h.y+8);
      g.addColorStop(0,'rgba(255,80,80,0)'); g.addColorStop(0.5,'#ff3b3b'); g.addColorStop(1,'rgba(255,80,80,0)');
      ctx.fillStyle=g; ctx.fillRect(h.x+20,h.y-8,h.w-40,16);
      ctx.fillStyle='rgba(255,255,255,.9)'; ctx.fillRect(h.x+20,h.y-2,h.w-40,4);
      ctx.restore();
    } else {
      ctx.save(); ctx.globalAlpha=0.3; ctx.strokeStyle='#ff3b3b'; ctx.setLineDash([8,8]);
      ctx.beginPath(); ctx.moveTo(h.x+22,h.y); ctx.lineTo(h.x+h.w-22,h.y); ctx.stroke(); ctx.restore();
    }
  } else if(h.type==='missile'){
    drawImgC(img.missile, h.x+h.w/2, h.y, h.w, h.h);
  }
}

function drawPlayer(){
  ctx.save();
  ctx.translate(player.x,player.y);
  ctx.rotate(player.tilt);
  // shield aura
  if(activePU.shield){ ctx.save(); ctx.globalAlpha=0.4+0.15*Math.sin(now*6); ctx.strokeStyle='#5ad6ff'; ctx.lineWidth=5;
    ctx.beginPath(); ctx.arc(0,0,player.w*0.62,0,7); ctx.stroke(); ctx.restore(); }
  // jetpack flame when thrusting
  const thrust = (pressing || (bufferActive && (now-lastPressTime)<=INPUT_BUFFER));
  if(thrust && state==='play'){
    const f=Math.abs(Math.sin(player.flameT*40))*0.4+0.8;
    ctx.save(); ctx.translate(-22,20);
    const g=ctx.createLinearGradient(0,0,0,46*f);
    g.addColorStop(0,'#fff'); g.addColorStop(0.4,'#ffd23f'); g.addColorStop(1,'rgba(255,60,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(-10,0); ctx.lineTo(10,0); ctx.lineTo(0,46*f); ctx.fill();
    ctx.restore();
  }
  const w=player.w, h=player.h;
  if(img.cat.complete && img.cat.naturalWidth){ ctx.drawImage(img.cat,-w*0.5,-h*0.5,w,h); }
  ctx.restore();
}

/* ---------- HUD / UI ---------------------------------------------------- */
function el(id){ return document.getElementById(id); }
function show(id,on){ el(id).classList.toggle('hidden',!on); }
function hideAllOverlays(){ ['menu','howto','pause','over'].forEach(o=>show(o,false)); }
function updateHUD(){
  el('hudCoins').textContent=coins;
  el('hudDist').textContent=Math.floor(distancePx/PX_PER_M)+' m';
  const m=currentMission();
  el('hudMissionTxt').textContent=m.text;
  el('hudMissionFill').style.width=(missionProgress()/m.target*100)+'%';
  // active power-up readout
  let pu='';
  if(activePU.boost>0) pu='⚡ '+activePU.boost.toFixed(1)+'s';
  else if(activePU.magnet>0) pu='🧲 '+activePU.magnet.toFixed(1)+'s';
  else if(activePU.shield) pu='🛡️ Shield';
  el('hudPU').style.display = pu?'flex':'none'; el('hudPUtxt').textContent=pu;
}
let toastT=null;
function showToast(t){ const e=el('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('show'),1500); }
function refreshMenu(){
  el('mBest').textContent=bestDist+' m';
  el('mCoins').textContent=coinsBanked;
  el('mMissions').textContent=missionsDone;
}

/* ---------- Main loop --------------------------------------------------- */
let renderDt=0;
function loop(t){
  if(!lastT) lastT=t;
  let dt=(t-lastT)/1000; lastT=t;
  dt=Math.min(dt,0.05);
  now+=dt;
  const sdt = (state==='dying')? dt*0.3 : dt;
  renderDt=sdt;
  if(ready) update(sdt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Buttons ----------------------------------------------------- */
el('playBtn').onclick = ()=>{ Audio2.init(); Audio2.resume(); Audio2.ui(); coinsTotalRun=0; startRun(); };
el('howBtn').onclick = ()=>{ Audio2.ui(); show('menu',false); show('howto',true); };
el('howBack').onclick = ()=>{ Audio2.ui(); show('howto',false); show('menu',true); };
el('pauseBtn').onclick = ()=>{ Audio2.ui(); pauseGame(); };
el('resumeBtn').onclick = ()=>{ Audio2.ui(); resumeGame(); };
el('quitBtn').onclick = ()=>{ Audio2.ui(); quitToMenu(); };
el('againBtn').onclick = ()=>{ Audio2.ui(); coinsTotalRun=0; startRun(); };
el('menuBtn').onclick = ()=>{ Audio2.ui(); quitToMenu(); };
el('muteBtn').onclick = ()=>{ Audio2.init(); const m=Audio2.toggleMute(); el('muteBtn').textContent=m?'♪̸':'♪'; el('muteBtn').style.opacity=m?0.5:1; };
if(Audio2.isMuted()){ el('muteBtn').textContent='♪̸'; el('muteBtn').style.opacity=0.5; }

refreshMenu();
