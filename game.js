/* ===========================================================================
   MonkeyCat: Jetpack Mischief  —  run + jump + tail-swing platformer
   A cat runs; the monkey on its back swings them across gaps with its tail.
   Single-file engine, no libs.  (kingbirdchris/v2_MonkeyCat reimagined)
   ======================================================================== */
'use strict';

/* ---------- Canvas / resolution ----------------------------------------- */
const VW=1280, VH=720;
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
let scale=1, dpr=Math.min(window.devicePixelRatio||1,2);
function resize(){
  const aw=window.innerWidth, ah=window.innerHeight;
  scale=Math.min(aw/VW, ah/VH);
  canvas.style.width=Math.round(VW*scale)+'px';
  canvas.style.height=Math.round(VH*scale)+'px';
  canvas.width=Math.round(VW*scale*dpr);
  canvas.height=Math.round(VH*scale*dpr);
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.imageSmoothingEnabled=true;
}
window.addEventListener('resize',resize); resize();

/* ---------- Tunables ---------------------------------------------------- */
const GROUND_Y   = VH-120;
const CEIL_Y     = 8;
const PX_PER_M   = 18;
const GRAVITY    = 2600;
const JUMP_V     = -1080;
const DJUMP_V    = -940;
const MAX_FALL   = 1180;
const COYOTE     = 0.10;
const BUFFER     = 0.13;
const CUT        = 0.45;
const PLAYER_X   = VW*0.30;
const LEVEL_LEN  = 240;
const INTRO_M    = 70;

/* ---------- Asset images (props; duo is procedural) --------------------- */
const ASSETS={ coin:'assets/coin.svg', zapper:'assets/zapper.svg',
  shield:'assets/pu-shield.svg', magnet:'assets/pu-magnet.svg', boost:'assets/pu-boost.svg' };
const img={}; let loaded=0, total=Object.keys(ASSETS).length, ready=false;
for(const k in ASSETS){ const im=new Image(); im.onload=()=>{ if(++loaded>=total) ready=true; };
  im.onerror=()=>{ if(++loaded>=total) ready=true; }; im.src=ASSETS[k]; img[k]=im; }

/* ---------- Audio ------------------------------------------------------- */
const Audio2=(()=>{
  let A=null,master=null,music=null,sfx=null,mt=null;
  let muted=localStorage.getItem('mc_muted')==='1';
  function init(){ if(A) return; try{
    A=new (window.AudioContext||window.webkitAudioContext)();
    master=A.createGain(); master.gain.value=muted?0:0.9; master.connect(A.destination);
    music=A.createGain(); music.gain.value=0.14; music.connect(master);
    sfx=A.createGain(); sfx.gain.value=0.9; sfx.connect(master);
  }catch(e){ A=null; } }
  function resume(){ if(A&&A.state==='suspended') A.resume(); }
  function blip(f,d,t='square',v=0.25,to=null){ if(!A||muted)return;
    const o=A.createOscillator(),g=A.createGain(); o.type=t; o.frequency.value=f;
    if(to)o.frequency.exponentialRampToValueAtTime(to,A.currentTime+d);
    g.gain.setValueAtTime(v,A.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+d);
    o.connect(g); g.connect(sfx); o.start(); o.stop(A.currentTime+d+0.02); }
  function jump(){ blip(420,0.16,'square',0.22,760); }
  function djump(){ blip(620,0.16,'square',0.2,1040); }
  function land(){ blip(180,0.09,'sine',0.18,90); }
  function swing(){ blip(300,0.25,'sine',0.2,620); }
  function coin(){ blip(900,0.08,'square',0.2,1340); }
  function power(){ blip(440,0.18,'sawtooth',0.24,1100); setTimeout(()=>blip(680,0.16,'square',0.18,1500),60); }
  function ui(){ blip(520,0.06,'triangle',0.16,720); }
  function boom(){ if(!A||muted)return;
    const b=A.createBufferSource(),len=A.sampleRate*0.5,buf=A.createBuffer(1,len,A.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2); b.buffer=buf;
    const f=A.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(1500,A.currentTime);
    f.frequency.exponentialRampToValueAtTime(120,A.currentTime+0.45);
    const g=A.createGain(); g.gain.setValueAtTime(0.6,A.currentTime); g.gain.exponentialRampToValueAtTime(0.001,A.currentTime+0.5);
    b.connect(f); f.connect(g); g.connect(sfx); b.start(); }
  const sc=[0,3,5,7,10,12], roots=[174.61,196,164.81,146.83]; let step=0;
  function note(){ if(!A||muted) return;
    const root=roots[Math.floor(step/8)%roots.length], f=root*Math.pow(2,sc[step%sc.length]/12);
    const o=A.createOscillator(),g=A.createGain(); o.type='triangle'; o.frequency.value=f;
    g.gain.setValueAtTime(0.0001,A.currentTime); g.gain.linearRampToValueAtTime(0.5,A.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+0.3); o.connect(g); g.connect(music); o.start(); o.stop(A.currentTime+0.32);
    if(step%4===0){ const bo=A.createOscillator(),bg=A.createGain(); bo.type='sine'; bo.frequency.value=root/2;
      bg.gain.setValueAtTime(0.0001,A.currentTime); bg.gain.linearRampToValueAtTime(0.6,A.currentTime+0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+0.5); bo.connect(bg); bg.connect(music); bo.start(); bo.stop(A.currentTime+0.52); }
    step++; }
  function musicStart(){ if(mt)return; init(); mt=setInterval(note,205); }
  function musicStop(){ if(mt){ clearInterval(mt); mt=null; } }
  function toggleMute(){ muted=!muted; localStorage.setItem('mc_muted',muted?'1':'0'); if(master)master.gain.value=muted?0:0.9; return muted; }
  function isMuted(){ return muted; }
  return {init,resume,jump,djump,land,swing,coin,power,ui,boom,musicStart,musicStop,toggleMute,isMuted};
})();

/* ---------- Input ------------------------------------------------------- */
let held=false, pressBuf=-10;
function onPress(){ Audio2.init(); Audio2.resume(); held=true; pressBuf=now; if(state==='play') doPressAction(); }
function onRelease(){ held=false; if(state==='play'){ if(player.swing) releaseSwing(); else if(player.vy<0) player.vy*=CUT; } }
canvas.addEventListener('pointerdown',e=>{ e.preventDefault(); if(state==='play') onPress(); },{passive:false});
window.addEventListener('pointerup',onRelease);
window.addEventListener('pointercancel',onRelease);
window.addEventListener('keydown',e=>{
  if(e.code==='Space'||e.code==='ArrowUp'){ e.preventDefault(); if(state==='play'&&!e.repeat) onPress(); }
  if(e.code==='KeyP'){ if(state==='play')pauseGame(); else if(state==='paused')resumeGame(); }
});
window.addEventListener('keyup',e=>{ if(e.code==='Space'||e.code==='ArrowUp') onRelease(); });

/* ---------- State ------------------------------------------------------- */
let state='menu', now=0, lastT=0, renderDt=0;
let player, camX, speed, runDist, coins, runTime, level, levelStartM, introActive;
let shakeT=0, shakeMag=0, deathT=0;
let gaps=[], obstacles=[], overheads=[], anchors=[], coinsArr=[], powerups=[], particles=[], floats=[];
let genX=0;
let activePU={shield:false, magnet:0, boost:0};
let bg, runCycle=0;
let coinsBanked=+(localStorage.getItem('mc_coins')||0);
let bestDist=+(localStorage.getItem('mc_best')||0);
let bestLevel=+(localStorage.getItem('mc_level')||1);

/* ---------- Background --------------------------------------------------- */
function makeBG(){
  const rnd=(a,b)=>a+Math.random()*(b-a);
  const far=[]; for(let i=0;i<14;i++) far.push({x:rnd(0,VW*2),h:rnd(160,300),w:rnd(60,120),hue:rnd(150,165)});
  const canopy=[]; for(let i=0;i<22;i++) canopy.push({x:rnd(0,VW*2),y:rnd(40,250),r:rnd(60,140),hue:rnd(125,150),sat:rnd(40,60),li:rnd(22,34)});
  const top=[]; for(let i=0;i<20;i++) top.push({x:rnd(0,VW*2),r:rnd(70,150),hue:rnd(120,140),li:rnd(16,26)});
  const vines=[]; for(let i=0;i<8;i++) vines.push({x:rnd(0,VW*2),len:rnd(100,240),sway:rnd(0,6.28)});
  return {ox1:0,ox2:0,ox3:0,far,canopy,top,vines,t:0};
}
function drawBG(dt){
  if(!bg) bg=makeBG(); const b=bg; b.t+=dt;
  const sp=state==='play'?speed:80;
  b.ox1+=sp*0.10*dt; b.ox2+=sp*0.25*dt; b.ox3+=sp*0.5*dt;
  const wrap=VW*2;
  let g=ctx.createLinearGradient(0,0,0,VH);
  g.addColorStop(0,'#274a63'); g.addColorStop(0.4,'#3c6b6a'); g.addColorStop(0.72,'#6f9a5e'); g.addColorStop(1,'#3f6238');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
  const sun=ctx.createRadialGradient(VW*0.72,140,20,VW*0.72,140,360);
  sun.addColorStop(0,'rgba(255,240,200,.5)'); sun.addColorStop(1,'rgba(255,240,200,0)');
  ctx.fillStyle=sun; ctx.fillRect(0,0,VW,VH);
  for(const t of b.far){ let x=((t.x-b.ox1)%wrap+wrap)%wrap; farTree(x,t); if(x>VW) farTree(x-wrap,t); }
  for(const c of b.canopy){ let x=((c.x-b.ox2)%wrap+wrap)%wrap; canopy(x,c); if(x>VW-160) canopy(x-wrap,c); }
  for(const v of b.vines){ let x=((v.x-b.ox3)%wrap+wrap)%wrap; vine(x,v,b.t); if(x>VW) vine(x-wrap,v,b.t); }
  topCanopy(b);
  ctx.save(); const vig=ctx.createRadialGradient(VW*0.5,VH*0.5,VH*0.35,VW*0.5,VH*0.5,VH*0.85);
  vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(8,6,16,0.4)'); ctx.fillStyle=vig; ctx.fillRect(0,0,VW,VH); ctx.restore();
}
function farTree(x,t){ ctx.fillStyle=`hsl(${t.hue},30%,30%)`; ctx.fillRect(x-t.w*0.08,GROUND_Y-t.h*0.8,t.w*0.16,t.h*0.8);
  for(let i=0;i<4;i++){ ctx.beginPath(); ctx.ellipse(x+(i-1.5)*t.w*0.28,GROUND_Y-t.h*0.78+Math.sin(i)*14,t.w*0.42,t.h*0.32,0,0,7); ctx.fill(); } }
function canopy(x,c){ ctx.save(); ctx.fillStyle=`hsl(${c.hue},${c.sat}%,${c.li}%)`;
  for(let i=0;i<5;i++){ const a=i/5*6.28; ctx.beginPath(); ctx.ellipse(x+Math.cos(a)*c.r*0.5,c.y+Math.sin(a)*c.r*0.35,c.r*0.55,c.r*0.45,0,0,7); ctx.fill(); }
  ctx.beginPath(); ctx.ellipse(x,c.y,c.r*0.7,c.r*0.55,0,0,7); ctx.fill();
  ctx.fillStyle=`hsla(${c.hue},${c.sat}%,${c.li+14}%,0.5)`; ctx.beginPath(); ctx.ellipse(x-c.r*0.2,c.y-c.r*0.2,c.r*0.4,c.r*0.3,0,0,7); ctx.fill(); ctx.restore(); }
function vine(x,v,t){ ctx.save(); ctx.strokeStyle='hsl(110,35%,26%)'; ctx.lineWidth=6; ctx.lineCap='round';
  const sway=Math.sin(t*1.2+v.sway)*16; ctx.beginPath(); ctx.moveTo(x,0); ctx.quadraticCurveTo(x+sway*0.5,v.len*0.5,x+sway,v.len); ctx.stroke();
  ctx.fillStyle='hsl(120,40%,32%)'; for(let i=1;i<=3;i++){ const yy=v.len*i/4,xx=x+sway*(i/3); ctx.beginPath(); ctx.ellipse(xx,yy,13,7,0.6,0,7); ctx.fill(); } ctx.restore(); }
function topCanopy(b){ const wrap=VW*2; ctx.fillStyle='#14361f';
  ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(VW,0); ctx.lineTo(VW,36);
  for(let x=VW;x>=-140;x-=140){ const xx=x-((b.ox2)%140); ctx.quadraticCurveTo(xx-35,76,xx-70,40); } ctx.lineTo(0,36); ctx.closePath(); ctx.fill();
  for(const t of b.top){ let x=((t.x-b.ox2)%wrap+wrap)%wrap; topClump(x,t); if(x>VW) topClump(x-wrap,t); } }
function topClump(x,t){ ctx.save(); ctx.fillStyle=`hsl(${t.hue},45%,${t.li}%)`; const y=8;
  for(let i=0;i<4;i++){ ctx.beginPath(); ctx.ellipse(x+(i-1.5)*t.r*0.4,y+Math.abs(Math.sin(i))*28,t.r*0.5,t.r*0.6,0,0,7); ctx.fill(); }
  ctx.fillStyle=`hsla(${t.hue},45%,${t.li+12}%,0.6)`; ctx.beginPath(); ctx.ellipse(x,y+8,t.r*0.4,t.r*0.45,0,0,7); ctx.fill(); ctx.restore(); }

/* ---------- World helpers ----------------------------------------------- */
function sx(worldX){ return PLAYER_X + (worldX - camX); }
function overGap(wx){ for(const g of gaps){ if(wx>g.x0 && wx<g.x1) return true; } return false; }

/* ---------- Level generation -------------------------------------------- */
function resetGen(){ gaps=[]; obstacles=[]; overheads=[]; anchors=[]; coinsArr=[]; powerups=[]; genX=player.worldX+200; }
function ensureWorld(){ const limit=camX+VW+400; while(genX<limit){ genFeature(); } }
function addCoinRun(x0, baseY, n, step, amp){ for(let i=0;i<n;i++){ const y=baseY-Math.sin(i/(Math.max(1,n-1))*Math.PI)*(amp||0); coinsArr.push({worldX:x0+i*step, y, r:17, taken:false}); } }
function maybePowerup(x,y){ if(Math.random()<0.16){ const t=['shield','magnet','boost'][Math.floor(Math.random()*3)]; powerups.push({worldX:x, y:y-90, r:24, type:t, taken:false}); } }
function genFeature(){
  const L=level, m=runDist/PX_PER_M;
  if(m<INTRO_M){ addCoinRun(genX+120, GROUND_Y-150, 6, 60, 80); genX+=520; return; }
  const d=Math.min((L-1)/7,1);
  const pool=['obstacle','smallGap'];
  if(L>=2) pool.push('overhead','obstacle');
  if(L>=3) pool.push('wideGap');
  if(L>=4) pool.push('smallGap','obstacle');
  const type=pool[Math.floor(Math.random()*pool.length)];
  if(type==='obstacle'){
    const h=70+d*70+Math.random()*40, w=46+Math.random()*40;
    obstacles.push({worldX:genX, w, h, kind:Math.random()<0.5?'crate':'zap'});
    addCoinRun(genX-20, GROUND_Y-h-70, 5, 46, 70); maybePowerup(genX, GROUND_Y-h-40);
    genX += 360 - d*70 + Math.random()*120;
  } else if(type==='smallGap'){
    const w=120 + d*120 + Math.random()*60;
    gaps.push({x0:genX, x1:genX+w});
    addCoinRun(genX+10, GROUND_Y-150, Math.ceil(w/46), 46, 120);
    genX += w + 260 - d*60 + Math.random()*120;
  } else if(type==='overhead'){
    overheads.push({worldX:genX, w:90+Math.random()*70, bottomY:GROUND_Y-210-Math.random()*40});
    addCoinRun(genX-10, GROUND_Y-60, 6, 46, 0);
    genX += 360 + Math.random()*120;
  } else {
    const w=300 + d*180 + Math.random()*80;
    gaps.push({x0:genX, x1:genX+w});
    anchors.push({worldX:genX+w*0.5, y:GROUND_Y-360, r:18, used:false});
    addCoinRun(genX+w*0.5-120, GROUND_Y-330, 6, 48, 150); maybePowerup(genX+w*0.5, GROUND_Y-360);
    genX += w + 300 - d*60 + Math.random()*120;
  }
}

/* ---------- Player ------------------------------------------------------ */
function makePlayer(){ return { worldX:0, y:GROUND_Y, vy:0, onGround:true, coyote:0, jumps:0, swing:null, swingExitVX:null, alive:true, squash:1 }; }
function doPressAction(){
  const p=player;
  if(p.swing) return;
  if(!p.onGround && tryGrab()) return;
  if(p.onGround || p.coyote>0){ jump(JUMP_V); Audio2.jump(); p.jumps=1; p.coyote=0; p.onGround=false; }
  else if(p.jumps<2){ jump(DJUMP_V); Audio2.djump(); p.jumps=2; }
  else { pressBuf=now; }
}
function jump(v){ player.vy=v; player.squash=0.7; spawnPuff(); }
function spawnPuff(){ const s=sx(player.worldX); for(let i=0;i<6;i++) particles.push({x:s-10+Math.random()*20,y:player.y-6,vx:(Math.random()-0.5)*120,vy:Math.random()*-60,life:0.4,age:0,color:'#cdbfae',r:3+Math.random()*3}); }
function tryGrab(){
  const p=player; const tipX=p.worldX+20, tipY=p.y-150;
  for(const a of anchors){ if(a.used) continue;
    if(Math.hypot(a.worldX-tipX, a.y-tipY)<150){
      const dx=p.worldX-a.worldX, dy=p.y-a.y, len=Math.max(120,Math.min(280,Math.hypot(dx,dy)));
      const theta=Math.atan2(dx,dy);
      const vtheta=(p.vy*Math.sin(theta)+speed*Math.cos(theta))/len*0.6 + 0.9;
      p.swing={a,len,theta,vtheta}; Audio2.swing(); return true;
    }
  }
  return false;
}
function releaseSwing(){
  const p=player; if(!p.swing) return; const {a,len,theta,vtheta}=p.swing;
  p.vy = -len*Math.sin(theta)*vtheta - 120;
  const vx = len*Math.cos(theta)*vtheta;
  p.swingExitVX = Math.max(speed, vx);
  p.swing=null; p.jumps=1; a.used=true; Audio2.djump();
}

/* ---------- Lifecycle --------------------------------------------------- */
function startRun(){
  player=makePlayer();
  camX=player.worldX; speed=levelSpeed(1); runDist=0; coins=0; runTime=0;
  level=1; levelStartM=0; introActive=true; shakeT=0; deathT=0; particles=[]; floats=[];
  activePU={shield:false, magnet:0, boost:0};
  bg=makeBG(); resetGen(); ensureWorld();
  state='play';
  show('hud',true); el('pauseBtn').classList.remove('hidden'); hideAllOverlays(); showHint(true);
  Audio2.musicStart(); updateHUD();
}
function levelSpeed(L){ return Math.min(560, 300+(L-1)*34); }
function pauseGame(){ if(state!=='play')return; state='paused'; Audio2.musicStop(); show('pause',true); }
function resumeGame(){ if(state!=='paused')return; state='play'; show('pause',false); Audio2.musicStart(); lastT=performance.now(); }
function quitToMenu(){ state='menu'; Audio2.musicStop(); showHint(false); hideAllOverlays(); show('menu',true); show('hud',false); el('pauseBtn').classList.add('hidden'); refreshMenu(); }
function die(){ if(state!=='play')return; state='dying'; deathT=0; player.alive=false; showHint(false);
  Audio2.boom(); shake(15,0.5); const s=sx(player.worldX); burst(s,player.y-50,'#ff9f1a',24,420); burst(s,player.y-50,'#ffd23f',16,300); }
function endRun(){
  state='over'; Audio2.musicStop();
  const dm=Math.floor(runDist/PX_PER_M);
  coinsBanked+=coins; localStorage.setItem('mc_coins',coinsBanked);
  let best=false; if(dm>bestDist){ bestDist=dm; localStorage.setItem('mc_best',bestDist); best=true; }
  if(level>bestLevel){ bestLevel=level; localStorage.setItem('mc_level',bestLevel); }
  el('oDist').textContent=dm+' m'; el('oCoins').textContent=coins; el('oLevel').textContent=level;
  el('overBadge').textContent=best?'NEW BEST!':('LEVEL '+level+' REACHED');
  el('oMission').innerHTML='Tip: <b>tap to jump, tap again to double-jump</b>. Over wide pits, <b>hold</b> as you reach a glowing vine to swing across.';
  show('over',true);
}

/* ---------- Update ------------------------------------------------------ */
function update(dt){
  if(state==='play'||state==='dying') runTime+=dt;
  if(state==='play') step(dt);
  else if(state==='dying'){ deathT+=dt; if(deathT>0.7) endRun(); }
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.age+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=900*dt; if(p.age>=p.life) particles.splice(i,1); }
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.age+=dt; f.y-=42*dt; if(f.age>=f.life) floats.splice(i,1); }
  if(shakeT>0) shakeT-=dt;
}
function step(dt){
  const p=player;
  const tgt=levelSpeed(level)*(activePU.boost>0?1.4:1);
  speed += (tgt-speed)*Math.min(1,dt*2);
  if(p.swing){
    const s=p.swing;
    const angAcc=-(GRAVITY/s.len)*Math.sin(s.theta);
    s.vtheta+=angAcc*dt; s.vtheta*=0.999; s.theta+=s.vtheta*dt;
    p.worldX=s.a.worldX+s.len*Math.sin(s.theta);
    p.y=s.a.y+s.len*Math.cos(s.theta); p.vy=0;
    if(s.theta>1.15 && s.vtheta>0) releaseSwing();
  } else {
    if(p.onGround){ p.worldX += speed*dt; }
    else { const vx=(p.swingExitVX!=null?p.swingExitVX:speed); p.worldX+=vx*dt; p.vy+=GRAVITY*dt; if(p.vy>MAX_FALL)p.vy=MAX_FALL; p.y+=p.vy*dt; }
  }
  runDist=p.worldX; camX=Math.max(camX,p.worldX);
  if(p.coyote>0) p.coyote-=dt;
  p.squash += (1-p.squash)*Math.min(1,dt*10);
  if(p.onGround) runCycle += speed*dt*0.018;
  if(p.onGround && overGap(p.worldX)){ p.onGround=false; p.coyote=COYOTE; p.swingExitVX=null; }
  if(!p.swing && !p.onGround && p.vy>=0 && p.y>=GROUND_Y && !overGap(p.worldX)){
    p.y=GROUND_Y; p.vy=0; p.onGround=true; p.jumps=0; p.swingExitVX=null; p.squash=0.78; Audio2.land();
    burst(sx(p.worldX),GROUND_Y,'#cdbfae',5,160);
    if(pressBuf>0 && now-pressBuf<=BUFFER){ jump(JUMP_V); Audio2.jump(); p.jumps=1; p.onGround=false; pressBuf=-10; }
  }
  if(p.onGround && !overGap(p.worldX)) p.y=GROUND_Y;
  if(held && !p.onGround && !p.swing) tryGrab();
  const m=runDist/PX_PER_M;
  if(m-levelStartM>=LEVEL_LEN){ level++; levelStartM+=LEVEL_LEN; showBanner('LEVEL '+level); Audio2.power(); shake(5,0.25); }
  if(introActive && m>=INTRO_M){ introActive=false; showHint(false); }
  if(activePU.magnet>0) activePU.magnet-=dt;
  if(activePU.boost>0){ activePU.boost-=dt; if(Math.random()<0.5) burst(sx(p.worldX),p.y-50,'#5ad6ff',1,120); }
  ensureWorld(); cull(); collisions();
  if(p.y>VH+70) die();
  updateHUD();
}
function cull(){
  const minX=camX-200;
  obstacles=obstacles.filter(o=>o.worldX+(o.w||0)>minX);
  overheads=overheads.filter(o=>o.worldX+(o.w||0)>minX);
  anchors=anchors.filter(a=>a.worldX>minX-200);
  gaps=gaps.filter(g=>g.x1>minX);
  coinsArr=coinsArr.filter(c=>!c.taken && c.worldX>minX);
  powerups=powerups.filter(pp=>!pp.taken && pp.worldX>minX);
}
function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }
function collisions(){
  const p=player; if(!p.alive) return;
  const s=sx(p.worldX); const px=s-32, py=p.y-104, pw=64, ph=98;
  for(const o of obstacles){ const ox=sx(o.worldX); if(aabb(px,py,pw,ph, ox-o.w/2, GROUND_Y-o.h, o.w, o.h)){ hit(); return; } }
  for(const o of overheads){ const ox=sx(o.worldX); if(aabb(px,py,pw,ph, ox-o.w/2, CEIL_Y, o.w, o.bottomY-CEIL_Y)){ hit(); return; } }
  const reach=activePU.magnet>0?230:46;
  for(const c of coinsArr){ if(c.taken) continue;
    if(activePU.magnet>0){ const d=Math.hypot(sx(c.worldX)-s, c.y-(p.y-60)); if(d<reach){ c.worldX+=(p.worldX-c.worldX)*0.25; c.y+=((p.y-60)-c.y)*0.25; } }
    if(Math.hypot(sx(c.worldX)-s, c.y-(p.y-60))<c.r+44){ c.taken=true; coins++; Audio2.coin(); burst(sx(c.worldX),c.y,'#ffd23f',5,170); floatText(sx(c.worldX),c.y,'+1','#ffd23f'); } }
  for(const pp of powerups){ if(pp.taken) continue; if(Math.hypot(sx(pp.worldX)-s, pp.y-(p.y-60))<pp.r+44){ pp.taken=true; applyPU(pp.type); Audio2.power(); burst(sx(pp.worldX),pp.y,'#5ad6ff',16,260); } }
}
function hit(){
  if(activePU.boost>0) return;
  if(activePU.shield){ activePU.shield=false; showToast('Shield down!'); Audio2.power(); shake(8,0.25); player.vy=Math.min(player.vy,-300); burst(sx(player.worldX),player.y-50,'#5ad6ff',18,300); return; }
  die();
}
function applyPU(t){ if(t==='shield'){activePU.shield=true; showToast('Shield up');}
  else if(t==='magnet'){activePU.magnet=8; showToast('Coin magnet!');}
  else if(t==='boost'){activePU.boost=3.5; showToast('Overcharge!'); shake(6,0.2);} }
function shake(m,t){ shakeMag=m; shakeT=t; }
function burst(x,y,color,n,spd){ for(let i=0;i<n;i++){ const a=Math.random()*6.28,sp=spd*(0.3+Math.random()); particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.4,age:0,color,r:2+Math.random()*4}); } }
function floatText(x,y,txt,color){ floats.push({x,y,txt,color,age:0,life:0.9}); }

/* ---------- Render ------------------------------------------------------ */
function render(){
  ctx.clearRect(0,0,VW,VH);
  ctx.save();
  if(shakeT>0){ const m=shakeMag*shakeT; ctx.translate((Math.random()-0.5)*m,(Math.random()-0.5)*m); }
  drawBG(renderDt);
  if(state==='menu'){ ctx.restore(); if(!ready) loadingVeil(); return; }
  drawGround(); drawAnchors(); drawCoinsPU(); drawObstacles();
  if(player) drawDuo();
  for(const p of particles){ ctx.globalAlpha=1-p.age/p.life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
  ctx.globalAlpha=1; ctx.textAlign='center';
  for(const f of floats){ ctx.globalAlpha=1-f.age/f.life; ctx.fillStyle=f.color; ctx.font='bold 22px Trebuchet MS, sans-serif'; ctx.fillText(f.txt,f.x,f.y); }
  ctx.globalAlpha=1; ctx.textAlign='left';
  ctx.restore();
  if(!ready) loadingVeil();
}
function loadingVeil(){ ctx.fillStyle='#0e0a14'; ctx.fillRect(0,0,VW,VH); ctx.fillStyle='#ffd23f'; ctx.font='bold 28px Trebuchet MS, sans-serif'; ctx.textAlign='center'; ctx.fillText('Loading…',VW/2,VH/2); ctx.textAlign='left'; }
function drawGround(){
  const segs=[];
  const solidStart=camX-PLAYER_X-100, solidEnd=camX+(VW-PLAYER_X)+100;
  const localGaps=gaps.filter(g=>g.x1>solidStart&&g.x0<solidEnd).sort((a,b)=>a.x0-b.x0);
  let cursor=solidStart;
  for(const g of localGaps){ if(g.x0>cursor) segs.push([cursor,g.x0]); cursor=Math.max(cursor,g.x1); }
  if(cursor<solidEnd) segs.push([cursor,solidEnd]);
  const gg=ctx.createLinearGradient(0,GROUND_Y,0,VH); gg.addColorStop(0,'#3a2a1c'); gg.addColorStop(1,'#221710');
  for(const seg of segs){ const a=sx(seg[0]), b=sx(seg[1]);
    ctx.fillStyle=gg; ctx.fillRect(a,GROUND_Y,b-a,VH-GROUND_Y);
    ctx.fillStyle='#3f7a3a'; ctx.fillRect(a,GROUND_Y-6,b-a,12);
    ctx.fillStyle='#1c130c'; ctx.fillRect(a-3,GROUND_Y-6,4,VH-GROUND_Y); ctx.fillRect(b-1,GROUND_Y-6,4,VH-GROUND_Y);
  }
}
function drawAnchors(){
  for(const a of anchors){ const x=sx(a.worldX); if(x<-60||x>VW+60) continue;
    ctx.strokeStyle='hsl(110,40%,30%)'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,a.y); ctx.stroke();
    const pulse=0.6+0.4*Math.sin(now*5); ctx.save(); ctx.globalAlpha=pulse*0.5; ctx.fillStyle='#7CFF8A'; ctx.beginPath(); ctx.arc(x,a.y,a.r+8,0,7); ctx.fill(); ctx.restore();
    ctx.fillStyle=a.used?'#6b8d6b':'#9be86b'; ctx.strokeStyle='#2c5a1e'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(x,a.y,a.r,0,7); ctx.fill(); ctx.stroke();
  }
}
function drawObstacles(){
  for(const o of obstacles){ const x=sx(o.worldX); if(x<-80||x>VW+80) continue;
    if(o.kind==='zap'){ if(img.zapper.complete&&img.zapper.naturalWidth) ctx.drawImage(img.zapper,x-o.w/2,GROUND_Y-o.h,o.w,o.h); else { ctx.fillStyle='#5ad6ff'; ctx.fillRect(x-o.w/2,GROUND_Y-o.h,o.w,o.h); } }
    else { ctx.fillStyle='#7a5230'; ctx.strokeStyle='#3a2616'; ctx.lineWidth=5; ctx.fillRect(x-o.w/2,GROUND_Y-o.h,o.w,o.h); ctx.strokeRect(x-o.w/2,GROUND_Y-o.h,o.w,o.h);
      ctx.beginPath(); ctx.moveTo(x-o.w/2,GROUND_Y-o.h); ctx.lineTo(x+o.w/2,GROUND_Y); ctx.moveTo(x+o.w/2,GROUND_Y-o.h); ctx.lineTo(x-o.w/2,GROUND_Y); ctx.stroke(); }
  }
  for(const o of overheads){ const x=sx(o.worldX); if(x<-80||x>VW+80) continue;
    ctx.strokeStyle='#566472'; ctx.lineWidth=8; ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,o.bottomY-110); ctx.stroke();
    if(img.zapper.complete&&img.zapper.naturalWidth) ctx.drawImage(img.zapper,x-23,o.bottomY-130,46,130); else { ctx.fillStyle='#5ad6ff'; ctx.fillRect(x-10,o.bottomY-130,20,130); }
  }
}
function drawCoinsPU(){
  for(const c of coinsArr){ if(c.taken) continue; const x=sx(c.worldX); if(x<-40||x>VW+40) continue;
    const s2=Math.sin(now*4+c.worldX*0.05)*0.12+1; if(img.coin.complete&&img.coin.naturalWidth) ctx.drawImage(img.coin,x-c.r*1.05*s2,c.y-c.r*1.05,c.r*2.1*s2,c.r*2.1); else { ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.arc(x,c.y,c.r,0,7); ctx.fill(); } }
  for(const pp of powerups){ if(pp.taken) continue; const x=sx(pp.worldX); if(x<-50||x>VW+50) continue;
    const im=pp.type==='shield'?img.shield:pp.type==='magnet'?img.magnet:img.boost;
    ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle=pp.type==='boost'?'#ffb000':pp.type==='magnet'?'#ff4d4d':'#5ad6ff'; ctx.beginPath(); ctx.arc(x,pp.y,pp.r*1.5,0,7); ctx.fill(); ctx.restore();
    if(im&&im.complete&&im.naturalWidth) ctx.drawImage(im,x-pp.r*1.1,pp.y-pp.r*1.1,pp.r*2.2,pp.r*2.2); }
}

/* ---------- Duo (procedural, animated) ---------------------------------- */
function drawDuo(){
  const p=player; const s=sx(p.worldX); const fy=p.y;
  const air=!p.onGround && !p.swing;
  let rot=0; if(p.swing){ rot=Math.sin(p.swing.theta)*0.5; } else if(air){ rot=Math.max(-0.25,Math.min(0.35,p.vy*0.0004)); }
  ctx.save(); ctx.translate(s,fy); ctx.rotate(rot);
  const sq=p.squash, sqx=1+(1-sq)*0.5, sqy=sq; ctx.scale(sqx,sqy);
  const runP=runCycle; const legCol1='#241f22', legCol2='#2b2422';
  ctx.strokeStyle='#2b2422'; ctx.lineWidth=11; ctx.lineCap='round';
  ctx.beginPath(); ctx.moveTo(-52,-44); ctx.quadraticCurveTo(-86,-54+Math.sin(now*6)*4,-80,-86); ctx.stroke();
  function leg(bx,ph,front){ ctx.strokeStyle=front?legCol2:legCol1; ctx.lineWidth=12; ctx.lineCap='round';
    let ang=air?(front?0.5:-0.4):Math.sin(ph)*0.8; const fxp=bx+Math.sin(ang)*20, fyp=air?-16:0, kx=bx+Math.sin(ang)*12;
    ctx.beginPath(); ctx.moveTo(bx,-26); ctx.lineTo(kx,-12); ctx.lineTo(fxp,fyp); ctx.stroke(); }
  leg(-30, runP, false); leg(34, runP+Math.PI, false);
  ctx.fillStyle='#332b2e'; ctx.strokeStyle='#15110f'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.ellipse(0,-46,58,30,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f1e4cb'; ctx.beginPath(); ctx.ellipse(6,-36,42,18,0,0,Math.PI); ctx.fill();
  leg(-12, runP+Math.PI, true); leg(40, runP, true);
  ctx.save(); ctx.translate(60,-58);
  ctx.fillStyle='#332b2e'; ctx.strokeStyle='#15110f'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(-12,-18); ctx.lineTo(-20,-40); ctx.lineTo(2,-26); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14,-22); ctx.lineTo(20,-44); ctx.lineTo(28,-22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(6,-2,26,24,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f1e4cb'; ctx.beginPath(); ctx.ellipse(22,6,14,11,0,0,7); ctx.fill();
  ctx.fillStyle='#f6829b'; ctx.beginPath(); ctx.ellipse(33,4,4,3,0,0,7); ctx.fill();
  ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.ellipse(14,-4,7,8,0,0,7); ctx.fill();
  ctx.fillStyle='#15110f'; ctx.beginPath(); ctx.ellipse(16,-3,3,6,0,0,7); ctx.fill();
  ctx.strokeStyle='#efe6d2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(30,4); ctx.lineTo(46,2); ctx.moveTo(30,8); ctx.lineTo(46,12); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.translate(-8,-72+(air?-2:Math.sin(runP)*2));
  ctx.fillStyle='#6b4630'; ctx.strokeStyle='#281612'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.ellipse(0,0,22,24,0,0,7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#5a3a28'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(8,6); ctx.quadraticCurveTo(22,14,28,8); ctx.stroke();
  ctx.fillStyle='#6b4630'; ctx.strokeStyle='#281612'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.ellipse(2,-22,17,16,0,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-12,-24,7,8,0,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(16,-22,7,8,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f0c79a'; ctx.beginPath(); ctx.ellipse(3,-19,11,12,0,0,7); ctx.fill();
  ctx.fillStyle='#281612'; ctx.beginPath(); ctx.ellipse(-1,-21,2.5,3,0,0,7); ctx.fill(); ctx.beginPath(); ctx.ellipse(8,-21,2.5,3,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(3,-13,5,0,Math.PI); ctx.lineWidth=2; ctx.strokeStyle='#281612'; ctx.stroke();
  ctx.restore();
  ctx.strokeStyle='#8a5a3c'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.beginPath();
  if(p.swing){ const ax=(sx(p.swing.a.worldX)-s)/sqx, ay=(p.swing.a.y-fy)/sqy;
    ctx.save(); ctx.rotate(-rot); ctx.moveTo(-14,-78); ctx.quadraticCurveTo((-14+ax)/2-10,(-78+ay)/2, ax, ay); ctx.stroke(); ctx.restore(); }
  else if(air){ ctx.moveTo(-14,-78); ctx.quadraticCurveTo(-46,-92,-40,-120); ctx.stroke(); ctx.beginPath(); ctx.arc(-40,-122,7,0,6.0); ctx.stroke(); }
  else { const w=Math.sin(now*8)*8; ctx.moveTo(-14,-78); ctx.quadraticCurveTo(-44,-96+w,-28,-128+w); ctx.stroke(); ctx.beginPath(); ctx.arc(-26,-130+w,7,0,6.0); ctx.stroke(); }
  ctx.restore();
}

/* ---------- HUD / overlays ---------------------------------------------- */
function el(id){ return document.getElementById(id); }
function show(id,on){ el(id).classList.toggle('hidden',!on); }
function hideAllOverlays(){ ['menu','howto','pause','over'].forEach(o=>show(o,false)); }
function showHint(on){ el('introHint').classList.toggle('hidden',!on); }
function showBanner(t){ const e=el('banner'); e.textContent=t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
let toastT=null; function showToast(t){ const e=el('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('show'),1500); }
function updateHUD(){ el('hudCoins').textContent=coins; const m=runDist/PX_PER_M;
  el('hudDist').textContent=Math.floor(m)+' m'; el('hudMissionTxt').textContent='Level '+level;
  el('hudMissionFill').style.width=Math.min(100,(m-levelStartM)/LEVEL_LEN*100)+'%';
  let pu=''; if(activePU.boost>0)pu='Overcharge '+activePU.boost.toFixed(1)+'s'; else if(activePU.magnet>0)pu='Magnet '+activePU.magnet.toFixed(1)+'s'; else if(activePU.shield)pu='Shield ready';
  el('hudPU').style.display=pu?'flex':'none'; el('hudPUtxt').textContent=pu; }
function refreshMenu(){ el('mBest').textContent=bestDist+' m'; el('mCoins').textContent=coinsBanked; el('mLevel').textContent=bestLevel; }

/* ---------- Loop -------------------------------------------------------- */
function loop(t){ requestAnimationFrame(loop);
  if(!lastT) lastT=t; let dt=(t-lastT)/1000; lastT=t; dt=Math.min(dt,0.05); now+=dt;
  renderDt=(state==='dying')?dt*0.35:dt;
  try{ if(ready) update((state==='dying')?dt*0.35:dt); render(); }catch(err){ if(!loop._w){ console.error('loop error',err); loop._w=true; } }
}
requestAnimationFrame(loop);

/* ---------- Buttons ----------------------------------------------------- */
el('playBtn').onclick=()=>{ Audio2.init(); Audio2.resume(); Audio2.ui(); startRun(); };
el('howBtn').onclick=()=>{ Audio2.ui(); show('menu',false); show('howto',true); };
el('howBack').onclick=()=>{ Audio2.ui(); show('howto',false); show('menu',true); };
el('pauseBtn').onclick=()=>{ Audio2.ui(); pauseGame(); };
el('resumeBtn').onclick=()=>{ Audio2.ui(); resumeGame(); };
el('quitBtn').onclick=()=>{ Audio2.ui(); quitToMenu(); };
el('againBtn').onclick=()=>{ Audio2.ui(); startRun(); };
el('menuBtn').onclick=()=>{ Audio2.ui(); quitToMenu(); };
el('muteBtn').onclick=()=>{ Audio2.init(); const m=Audio2.toggleMute(); el('muteBtn').textContent=m?'♪̸':'♪'; el('muteBtn').style.opacity=m?0.5:1; };
if(Audio2.isMuted()){ el('muteBtn').textContent='♪̸'; el('muteBtn').style.opacity=0.5; }
refreshMenu();
