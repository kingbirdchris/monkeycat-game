/* ===========================================================================
   MonkeyCat: Backyard Breakout  —  run + jump + tail-swing platformer
   Cat runs a Phoenix backyard wall; the monkey's tail swings them across gaps.
   Homeowners hurl shoes; animal control storms in for periodic chases.
   ======================================================================== */
'use strict';

const VW=1280, VH=720;
const canvas=document.getElementById('game');
const ctx=canvas.getContext('2d');
let scale=1, dpr=Math.min(window.devicePixelRatio||1,2);
function resize(){ const aw=window.innerWidth, ah=window.innerHeight; scale=Math.min(aw/VW,ah/VH);
  canvas.style.width=Math.round(VW*scale)+'px'; canvas.style.height=Math.round(VH*scale)+'px';
  canvas.width=Math.round(VW*scale*dpr); canvas.height=Math.round(VH*scale*dpr);
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0); ctx.imageSmoothingEnabled=true; }
window.addEventListener('resize',resize); resize();

/* ---------- Tunables ---------------------------------------------------- */
const WALL_Y=560, GROUND_Y=560, CEIL_Y=8, PX_PER_M=18;
const GRAVITY=2600, JUMP_V=-1080, DJUMP_V=-940, MAX_FALL=1180;
const COYOTE=0.10, BUFFER=0.13, CUT=0.45, PGRAV=1900;
const PLAYER_X=VW*0.30, LEVEL_LEN=240, INTRO_M=55;

const ASSETS={ coin:'assets/coin.svg', shield:'assets/pu-shield.svg', magnet:'assets/pu-magnet.svg', boost:'assets/pu-boost.svg' };
const img={}; let loaded=0, total=Object.keys(ASSETS).length, ready=false;
for(const k in ASSETS){ const im=new Image(); im.onload=()=>{ if(++loaded>=total) ready=true; }; im.onerror=()=>{ if(++loaded>=total) ready=true; }; im.src=ASSETS[k]; img[k]=im; }

/* ---------- Audio ------------------------------------------------------- */
const Audio2=(()=>{
  let A=null,master=null,music=null,sfx=null,mt=null; let muted=localStorage.getItem('mc_muted')==='1';
  function init(){ if(A) return; try{ A=new (window.AudioContext||window.webkitAudioContext)();
    master=A.createGain(); master.gain.value=muted?0:0.9; master.connect(A.destination);
    music=A.createGain(); music.gain.value=0.14; music.connect(master); sfx=A.createGain(); sfx.gain.value=0.9; sfx.connect(master);
  }catch(e){ A=null; } }
  function resume(){ if(A&&A.state==='suspended') A.resume(); }
  function blip(f,d,t='square',v=0.25,to=null){ if(!A||muted)return; const o=A.createOscillator(),g=A.createGain(); o.type=t; o.frequency.value=f;
    if(to)o.frequency.exponentialRampToValueAtTime(to,A.currentTime+d); g.gain.setValueAtTime(v,A.currentTime); g.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+d);
    o.connect(g); g.connect(sfx); o.start(); o.stop(A.currentTime+d+0.02); }
  function jump(){ blip(420,0.16,'square',0.22,760); }
  function djump(){ blip(620,0.16,'square',0.2,1040); }
  function land(){ blip(170,0.09,'sine',0.18,90); }
  function swing(){ blip(300,0.25,'sine',0.2,640); }
  function coin(){ blip(900,0.08,'square',0.2,1340); }
  function power(){ blip(440,0.18,'sawtooth',0.24,1100); setTimeout(()=>blip(680,0.16,'square',0.18,1500),60); }
  function throwS(){ blip(330,0.14,'square',0.2,150); }
  function swipe(){ blip(520,0.18,'sawtooth',0.22,140); }
  function siren(){ blip(740,0.18,'square',0.2,520); setTimeout(()=>blip(560,0.2,'square',0.2,760),160); }
  function ui(){ blip(520,0.06,'triangle',0.16,720); }
  function boom(){ if(!A||muted)return; const b=A.createBufferSource(),len=A.sampleRate*0.5,buf=A.createBuffer(1,len,A.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/len,2); b.buffer=buf;
    const f=A.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(1500,A.currentTime); f.frequency.exponentialRampToValueAtTime(120,A.currentTime+0.45);
    const g=A.createGain(); g.gain.setValueAtTime(0.6,A.currentTime); g.gain.exponentialRampToValueAtTime(0.001,A.currentTime+0.5); b.connect(f); f.connect(g); g.connect(sfx); b.start(); }
  const sc=[0,3,5,7,10,12], roots=[174.61,196,164.81,146.83]; let step=0;
  function note(){ if(!A||muted) return; const root=roots[Math.floor(step/8)%roots.length], f=root*Math.pow(2,sc[step%sc.length]/12);
    const o=A.createOscillator(),g=A.createGain(); o.type='triangle'; o.frequency.value=f; g.gain.setValueAtTime(0.0001,A.currentTime); g.gain.linearRampToValueAtTime(0.5,A.currentTime+0.02);
    g.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+0.3); o.connect(g); g.connect(music); o.start(); o.stop(A.currentTime+0.32);
    if(step%4===0){ const bo=A.createOscillator(),bg=A.createGain(); bo.type='sine'; bo.frequency.value=root/2; bg.gain.setValueAtTime(0.0001,A.currentTime); bg.gain.linearRampToValueAtTime(0.6,A.currentTime+0.03);
      bg.gain.exponentialRampToValueAtTime(0.0001,A.currentTime+0.5); bo.connect(bg); bg.connect(music); bo.start(); bo.stop(A.currentTime+0.52); } step++; }
  function musicStart(){ if(mt)return; init(); mt=setInterval(note,205); }
  function musicStop(){ if(mt){ clearInterval(mt); mt=null; } }
  function toggleMute(){ muted=!muted; localStorage.setItem('mc_muted',muted?'1':'0'); if(master)master.gain.value=muted?0:0.9; return muted; }
  function isMuted(){ return muted; }
  return {init,resume,jump,djump,land,swing,coin,power,throwS,swipe,siren,ui,boom,musicStart,musicStop,toggleMute,isMuted};
})();

/* ---------- Input ------------------------------------------------------- */
let held=false, pressBuf=-10;
function onPress(){ Audio2.init(); Audio2.resume(); held=true; pressBuf=now; if(state==='play') doPressAction(); }
function onRelease(){ held=false; if(state==='play'){ if(player.swing) releaseSwing(); else if(player.vy<0) player.vy*=CUT; } }
canvas.addEventListener('pointerdown',e=>{ e.preventDefault(); if(state==='play') onPress(); },{passive:false});
window.addEventListener('pointerup',onRelease); window.addEventListener('pointercancel',onRelease);
window.addEventListener('keydown',e=>{ if(e.code==='Space'||e.code==='ArrowUp'){ e.preventDefault(); if(state==='play'&&!e.repeat) onPress(); } if(e.code==='KeyP'){ if(state==='play')pauseGame(); else if(state==='paused')resumeGame(); } });
window.addEventListener('keyup',e=>{ if(e.code==='Space'||e.code==='ArrowUp') onRelease(); });

/* ---------- State ------------------------------------------------------- */
let state='menu', now=0, lastT=0, renderDt=0;
let player, camX, speed, runDist, coins, runTime, level, levelStartM, introActive;
let shakeT=0, shakeMag=0, deathT=0, caught=false, tutorialDone=false;
let chaser, chaseTimer=0;
let gaps=[], obstacles=[], overheads=[], anchors=[], coinsArr=[], powerups=[], throwers=[], projectiles=[], particles=[], floats=[];
let genX=0;
let activePU={shield:false, magnet:0, boost:0};
let bg, runCycle=0;
let coinsBanked=+(localStorage.getItem('mc_coins')||0);
let bestDist=+(localStorage.getItem('mc_best')||0);
let bestLevel=+(localStorage.getItem('mc_level')||1);

/* ---------- Background --------------------------------------------------- */
function makeBG(){ const rnd=(a,b)=>a+Math.random()*(b-a);
  const houses=[]; for(let i=0;i<10;i++) houses.push({x:rnd(0,VW*2),w:rnd(150,230),h:rnd(120,210),hue:rnd(255,285)});
  const palms=[]; for(let i=0;i<8;i++) palms.push({x:rnd(0,VW*2),h:rnd(180,280)});
  const sag=[]; for(let i=0;i<10;i++) sag.push({x:rnd(0,VW*2),h:rnd(110,170)});
  const agave=[]; for(let i=0;i<16;i++) agave.push({x:rnd(0,VW*2)});
  return {ox1:0,ox2:0,houses,palms,sag,agave,t:0}; }
function drawBG(dt){ if(!bg) bg=makeBG(); const b=bg; b.t+=dt;
  const sp=state==='play'?speed:70; b.ox1+=sp*0.08*dt; b.ox2+=sp*0.22*dt; const wrap=VW*2;
  let g=ctx.createLinearGradient(0,0,0,VH); g.addColorStop(0,'#3b2f6e'); g.addColorStop(0.42,'#9c5a7a'); g.addColorStop(0.7,'#e0815a'); g.addColorStop(1,'#f3b46a');
  ctx.fillStyle=g; ctx.fillRect(0,0,VW,VH);
  const sun=ctx.createRadialGradient(VW*0.78,300,10,VW*0.78,300,280); sun.addColorStop(0,'rgba(255,244,210,.95)'); sun.addColorStop(1,'rgba(255,200,120,0)'); ctx.fillStyle=sun; ctx.fillRect(0,0,VW,VH);
  for(const h of bg.palms){ let x=((h.x-b.ox1)%wrap+wrap)%wrap; palm(x,h.h); if(x>VW) palm(x-wrap,h.h); }
  for(const h of bg.houses){ let x=((h.x-b.ox1)%wrap+wrap)%wrap; house(x,h); if(x>VW) house(x-wrap,h); }
  ctx.fillStyle='rgba(58,42,38,0.45)'; ctx.fillRect(0,WALL_Y-70,VW,70);
  for(const sgi of bg.sag){ let x=((sgi.x-b.ox2)%wrap+wrap)%wrap; saguaro(x,sgi.h); if(x>VW) saguaro(x-wrap,sgi.h); }
  for(const a of bg.agave){ let x=((a.x-b.ox2)%wrap+wrap)%wrap; agave(x); if(x>VW) agave(x-wrap); }
  ctx.save(); const vig=ctx.createRadialGradient(VW*0.5,VH*0.5,VH*0.4,VW*0.5,VH*0.5,VH*0.9); vig.addColorStop(0,'rgba(0,0,0,0)'); vig.addColorStop(1,'rgba(20,10,24,0.4)'); ctx.fillStyle=vig; ctx.fillRect(0,0,VW,VH); ctx.restore(); }
function house(x,h){ ctx.fillStyle=`hsl(${h.hue},22%,34%)`; ctx.fillRect(x,WALL_Y-h.h,h.w,h.h);
  ctx.beginPath(); ctx.moveTo(x-12,WALL_Y-h.h); ctx.lineTo(x+h.w/2,WALL_Y-h.h-42); ctx.lineTo(x+h.w+12,WALL_Y-h.h); ctx.fill();
  ctx.fillStyle='rgba(255,214,130,0.92)'; ctx.fillRect(x+18,WALL_Y-h.h+30,18,22); ctx.fillRect(x+h.w-36,WALL_Y-h.h+30,18,22); }
function palm(x,h){ ctx.strokeStyle='#41335a'; ctx.lineWidth=10; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x,WALL_Y); ctx.quadraticCurveTo(x+12,WALL_Y-h*0.6,x+5,WALL_Y-h); ctx.stroke();
  ctx.fillStyle='#3a5236'; for(let i=0;i<6;i++){ const a=-Math.PI/2+(i-2.5)*0.5; ctx.save(); ctx.translate(x+5,WALL_Y-h); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(40,0,46,12,0,0,7); ctx.fill(); ctx.restore(); } }
function saguaro(x,h){ ctx.fillStyle='#3c6b3a'; ctx.strokeStyle='#274d28'; ctx.lineWidth=4; rr(x-12,WALL_Y-h,24,h,12); ctx.fill(); ctx.stroke();
  rr(x-40,WALL_Y-h*0.6-40,16,56,8); ctx.fill(); rr(x-40,WALL_Y-h*0.6,28,16,8); ctx.fill(); rr(x+24,WALL_Y-h*0.7-52,16,62,8); ctx.fill(); rr(x+12,WALL_Y-h*0.7,28,16,8); ctx.fill(); }
function agave(x){ ctx.fillStyle='#6a8f4a'; for(let i=0;i<7;i++){ const a=-Math.PI/2+(i-3)*0.4; ctx.save(); ctx.translate(x,WALL_Y); ctx.rotate(a); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(8,-38); ctx.lineTo(-8,-38); ctx.closePath(); ctx.fill(); ctx.restore(); } }
function rr(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

/* ---------- World helpers ----------------------------------------------- */
function sx(worldX){ return PLAYER_X + (worldX - camX); }
function overGap(wx){ for(const g of gaps){ if(wx>g.x0 && wx<g.x1) return true; } return false; }

/* ---------- Generation -------------------------------------------------- */
function resetGen(){ gaps=[]; obstacles=[]; overheads=[]; anchors=[]; coinsArr=[]; powerups=[]; throwers=[]; projectiles=[]; genX=player.worldX+240; }
function ensureWorld(){ const limit=camX+VW+520; let guard=0; while(genX<limit && guard++<40){ genFeature(); } }
function addCoinRun(x0,baseY,n,stp,amp){ for(let i=0;i<n;i++){ const y=baseY-Math.sin(i/(Math.max(1,n-1))*Math.PI)*(amp||0); coinsArr.push({worldX:x0+i*stp,y,r:17,taken:false}); } }
function maybePowerup(x,y){ if(Math.random()<0.16){ const t=['shield','magnet','boost'][Math.floor(Math.random()*3)]; powerups.push({worldX:x,y:y-90,r:24,type:t,taken:false}); } }
function genWideGap(tut){ const d=Math.min((level-1)/7,1); const w=tut?280:(300+d*150+Math.random()*70); gaps.push({x0:genX,x1:genX+w});
  anchors.push({worldX:genX+w*0.5, y:WALL_Y-300, r:16, used:false, tut:!!tut}); addCoinRun(genX+w*0.5-120, WALL_Y-280, 6, 48, 150); maybePowerup(genX+w*0.5, WALL_Y-300);
  genX += w + (tut?340:300 - d*60 + Math.random()*120); }
function genFeature(){
  const L=level, m=runDist/PX_PER_M;
  if(m<INTRO_M){ addCoinRun(genX+120, WALL_Y-150, 6, 60, 80); genX+=500; return; }
  if(!tutorialDone){ tutorialDone=true; genWideGap(true); return; }
  const d=Math.min((L-1)/7,1);
  const pool=['obstacle','smallGap'];
  if(L>=2) pool.push('thrower','overhead','obstacle','wideGap');
  if(L>=3) pool.push('wideGap','thrower');
  if(L>=4) pool.push('smallGap','obstacle');
  const type=pool[Math.floor(Math.random()*pool.length)];
  if(type==='obstacle'){ const h=64+d*60+Math.random()*36, w=44+Math.random()*36;
    obstacles.push({worldX:genX,w,h,kind:Math.random()<0.5?'cactus':'gnome'}); addCoinRun(genX-20, WALL_Y-h-70, 5, 46, 70); maybePowerup(genX, WALL_Y-h-40); genX += 360 - d*70 + Math.random()*120; }
  else if(type==='smallGap'){ const w=120+d*120+Math.random()*60; gaps.push({x0:genX,x1:genX+w}); addCoinRun(genX+10, WALL_Y-150, Math.ceil(w/46), 46, 120); genX += w + 260 - d*60 + Math.random()*120; }
  else if(type==='overhead'){ overheads.push({worldX:genX, w:90+Math.random()*60, bottomY:WALL_Y-180-Math.random()*30}); addCoinRun(genX-10, WALL_Y-56, 6, 46, 0); genX += 360 + Math.random()*120; }
  else if(type==='thrower'){ throwers.push({worldX:genX+280, fired:0, wind:0, anim:0, volley:0, volleyT:0}); addCoinRun(genX, WALL_Y-150, 5, 50, 90); genX += 520 + Math.random()*100; }
  else genWideGap(false);
}

/* ---------- Player / actions -------------------------------------------- */
function makePlayer(){ return { worldX:0, y:WALL_Y, vy:0, onGround:true, coyote:0, jumps:0, swing:null, swingExitVX:null, alive:true, squash:1, reach:0 }; }
function doPressAction(){ const p=player; if(p.swing) return; if(!p.onGround && tryGrab()) return;
  if(p.onGround||p.coyote>0){ doJump(JUMP_V); Audio2.jump(); p.jumps=1; p.coyote=0; p.onGround=false; } else if(p.jumps<2){ doJump(DJUMP_V); Audio2.djump(); p.jumps=2; } else { pressBuf=now; } }
function doJump(v){ player.vy=v; player.squash=0.7; puff(); }
function puff(){ const s=sx(player.worldX); for(let i=0;i<7;i++) particles.push({x:s-12+Math.random()*24,y:player.y-4,vx:(Math.random()-0.5)*130,vy:Math.random()*-70,life:0.4,age:0,color:'#d8c4a0',r:3+Math.random()*3}); }
function tryGrab(){ const p=player, tipX=p.worldX+24, tipY=p.y-150;
  for(const a of anchors){ if(a.used) continue; if(Math.hypot(a.worldX-tipX,a.y-tipY)<175){
    const dx=p.worldX-a.worldX, dy=p.y-a.y, len=Math.max(120,Math.min(260,Math.hypot(dx,dy))); const theta=Math.atan2(dx,dy);
    const vtheta=(p.vy*Math.sin(theta)+speed*Math.cos(theta))/len*0.6+0.95; p.swing={a,len,theta,vtheta}; Audio2.swing(); return true; } } return false; }
function releaseSwing(){ const p=player; if(!p.swing) return; const {a,len,theta,vtheta}=p.swing;
  p.vy=Math.min(-240,-len*Math.sin(theta)*vtheta-140); const vx=len*Math.cos(theta)*vtheta; p.swingExitVX=Math.max(speed*1.05,vx); p.swing=null; p.jumps=1; a.used=true; Audio2.djump(); }

/* ---------- Lifecycle --------------------------------------------------- */
function startRun(){ player=makePlayer(); camX=player.worldX; speed=levelSpeed(1); runDist=0; coins=0; runTime=0;
  level=1; levelStartM=0; introActive=true; shakeT=0; deathT=0; caught=false; tutorialDone=false; particles=[]; floats=[];
  chaser={active:false,worldX:0,state:'run',swipeT:0,swipeWin:0,checked:false,giveupT:0}; chaseTimer=16;
  activePU={shield:false,magnet:0,boost:0}; bg=makeBG(); resetGen(); ensureWorld(); state='play';
  show('hud',true); el('pauseBtn').classList.remove('hidden'); hideAllOverlays(); showHint(true); Audio2.musicStart(); updateHUD(); }
function levelSpeed(L){ return Math.min(560, 300+(L-1)*34); }
function pauseGame(){ if(state!=='play')return; state='paused'; Audio2.musicStop(); show('pause',true); }
function resumeGame(){ if(state!=='paused')return; state='play'; show('pause',false); Audio2.musicStart(); lastT=performance.now(); }
function quitToMenu(){ state='menu'; Audio2.musicStop(); showHint(false); hideAllOverlays(); show('menu',true); show('hud',false); el('pauseBtn').classList.add('hidden'); refreshMenu(); }
function die(reason){ if(state!=='play')return; state='dying'; deathT=0; player.alive=false; caught=(reason==='caught'); showHint(false);
  Audio2.boom(); shake(16,0.5); const s=sx(player.worldX); burst(s,player.y-50,'#ff9f1a',22,420); burst(s,player.y-50,'#ffd23f',14,300); }
function endRun(){ state='over'; Audio2.musicStop(); const dm=Math.floor(runDist/PX_PER_M);
  coinsBanked+=coins; localStorage.setItem('mc_coins',coinsBanked);
  let best=false; if(dm>bestDist){ bestDist=dm; localStorage.setItem('mc_best',bestDist); best=true; }
  if(level>bestLevel){ bestLevel=level; localStorage.setItem('mc_level',bestLevel); }
  el('oDist').textContent=dm+' m'; el('oCoins').textContent=coins; el('oLevel').textContent=level;
  el('overBadge').textContent= best?'NEW BEST!':(caught?'CAUGHT BY ANIMAL CONTROL':('LEVEL '+level+' REACHED'));
  el('oMission').innerHTML='Tip: <b>jump the shoes</b> (watch the red crosshair). When <b>animal control</b> charges, jump its net swipes and <b>cross a gap</b> to lose it.';
  show('over',true); }

/* ---------- Update ------------------------------------------------------ */
function update(dt){ if(state==='play'||state==='dying') runTime+=dt;
  if(state==='play') step(dt); else if(state==='dying'){ deathT+=dt; stepProjectiles(dt*0.4); if(deathT>0.8) endRun(); }
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.age+=dt; p.x+=p.vx*dt; p.y+=p.vy*dt; p.vy+=900*dt; if(p.age>=p.life) particles.splice(i,1); }
  for(let i=floats.length-1;i>=0;i--){ const f=floats[i]; f.age+=dt; f.y-=42*dt; if(f.age>=f.life) floats.splice(i,1); }
  if(shakeT>0) shakeT-=dt; }
function step(dt){ const p=player;
  const tgt=levelSpeed(level)*(activePU.boost>0?1.4:1); speed+=(tgt-speed)*Math.min(1,dt*2);
  if(p.swing){ const s=p.swing; const angAcc=-(GRAVITY/s.len)*Math.sin(s.theta); s.vtheta+=angAcc*dt; s.vtheta*=0.999; s.theta+=s.vtheta*dt;
    p.worldX=s.a.worldX+s.len*Math.sin(s.theta); p.y=s.a.y+s.len*Math.cos(s.theta); p.vy=0; if((s.theta>0.6&&s.vtheta>0)||(s.vtheta<=0&&s.theta>0.15)) releaseSwing(); }
  else { if(p.onGround){ p.worldX+=speed*dt; } else { const vx=(p.swingExitVX!=null?p.swingExitVX:speed); p.worldX+=vx*dt; p.vy+=GRAVITY*dt; if(p.vy>MAX_FALL)p.vy=MAX_FALL; p.y+=p.vy*dt; } }
  runDist=p.worldX; camX=Math.max(camX,p.worldX);
  if(p.coyote>0) p.coyote-=dt; p.squash+=(1-p.squash)*Math.min(1,dt*10); if(p.onGround) runCycle+=speed*dt*0.018;
  p.reach += ((held&&!p.onGround?1:0)-p.reach)*Math.min(1,dt*12);
  if(p.onGround && overGap(p.worldX)){ p.onGround=false; p.coyote=COYOTE; p.swingExitVX=null; }
  if(!p.swing && !p.onGround && p.vy>=0 && p.y>=WALL_Y && !overGap(p.worldX)){ p.y=WALL_Y; p.vy=0; p.onGround=true; p.jumps=0; p.swingExitVX=null; p.squash=0.8; Audio2.land(); burst(sx(p.worldX),WALL_Y,'#d8c4a0',5,150);
    if(pressBuf>0&&now-pressBuf<=BUFFER){ doJump(JUMP_V); Audio2.jump(); p.jumps=1; p.onGround=false; pressBuf=-10; } }
  if(p.onGround && !overGap(p.worldX)) p.y=WALL_Y;
  if(held && !p.onGround && !p.swing) tryGrab();
  const m=runDist/PX_PER_M;
  if(m-levelStartM>=LEVEL_LEN){ level++; levelStartM+=LEVEL_LEN; showBanner('LEVEL '+level); Audio2.power(); shake(5,0.25); }
  if(introActive && m>=INTRO_M){ introActive=false; showHint(false); }
  if(activePU.magnet>0) activePU.magnet-=dt; if(activePU.boost>0){ activePU.boost-=dt; if(Math.random()<0.5) burst(sx(p.worldX),p.y-50,'#5ad6ff',1,120); }
  updateThrowers(dt); updateChaser(dt);
  stepProjectiles(dt); ensureWorld(); cull(); collisions();
  if(p.y>VH+80) die('fell'); updateHUD(); }

/* ---------- Homeowners / shoes ------------------------------------------ */
function updateThrowers(dt){ const p=player;
  for(const t of throwers){ if(t.anim>0) t.anim-=dt;
    if(t.volley>0){ t.volleyT-=dt; if(t.volleyT<=0){ lob(t.worldX,p.worldX); t.anim=0.25; t.volley--; t.volleyT=0.34; } }
    if(t.fired) continue; const tsx=sx(t.worldX);
    if(tsx<VW-90 && tsx>sx(p.worldX)+120){ t.wind+=dt; if(t.wind>0.55){ t.fired=1; lob(t.worldX,p.worldX); t.anim=0.25; if(level>=3){ t.volley=1; t.volleyT=0.34; } } } } }
function lob(fromX, playerX){ const vy=-300; const t=(300+Math.sqrt(300*300+2*PGRAV*66))/PGRAV; const target=playerX+speed*t+110; const vx=(target-fromX)/t;
  projectiles.push({worldX:fromX, y:WALL_Y-70, vx, vy, kind:'shoe', landX:target}); Audio2.throwS(); }
function stepProjectiles(dt){ for(let i=projectiles.length-1;i>=0;i--){ const pr=projectiles[i]; pr.worldX+=pr.vx*dt; pr.vy+=PGRAV*dt; pr.y+=pr.vy*dt;
  if(pr.y>WALL_Y-6){ burst(sx(pr.worldX),WALL_Y,'#7a5a3a',7,170); projectiles.splice(i,1); continue; }
  if(pr.worldX>camX+VW+220 || pr.worldX<camX-460) projectiles.splice(i,1); } }

/* ---------- Animal control (event-driven chase) ------------------------- */
function startChase(){ chaser.active=true; chaser.worldX=player.worldX-600; chaser.state='run'; chaser.swipeT=1.6; chaser.checked=false; chaser.giveupT=0; showToast('🚨 Animal control!'); Audio2.siren(); }
function updateChaser(dt){ const p=player;
  if(!chaser.active){ if(level>=2 && !introActive){ chaseTimer-=dt; if(chaseTimer<=0) startChase(); } return; }
  if(chaser.state==='giveup'){ chaser.giveupT-=dt; if(chaser.giveupT<=0){ chaser.active=false; chaseTimer=11+Math.random()*8; } return; }
  for(const g of gaps){ if((g.x1-g.x0)>240 && g.x0>chaser.worldX+20 && g.x1 < p.worldX-30){ chaser.state='giveup'; chaser.giveupT=1.5; Audio2.power(); showToast('Lost him!'); return; } }
  const close=30+level*8; chaser.worldX += (speed+close)*dt;
  let gap=p.worldX-chaser.worldX;
  if(gap>900){ chaser.state='giveup'; chaser.giveupT=0.9; return; }
  if(chaser.state==='swipe'){ chaser.swipeWin-=dt;
    if(!chaser.checked && chaser.swipeWin<0.22){ chaser.checked=true; Audio2.swipe();
      if(p.onGround && gap<235){ die('caught'); return; } else { chaser.worldX-=80; } }
    if(chaser.swipeWin<=0){ chaser.state='run'; chaser.swipeT=1.5; }
  } else { chaser.swipeT-=dt; if(chaser.swipeT<=0 && gap<290){ chaser.state='swipe'; chaser.swipeWin=0.5; chaser.checked=false; } }
  if(gap<60 && p.onGround){ die('caught'); }
}

function cull(){ const minX=camX-300;
  obstacles=obstacles.filter(o=>o.worldX+(o.w||0)>minX); overheads=overheads.filter(o=>o.worldX+(o.w||0)>minX);
  anchors=anchors.filter(a=>a.worldX>minX-200); gaps=gaps.filter(g=>g.x1>minX-400);
  coinsArr=coinsArr.filter(c=>!c.taken&&c.worldX>minX); powerups=powerups.filter(pp=>!pp.taken&&pp.worldX>minX); throwers=throwers.filter(t=>t.worldX>minX); }
function aabb(ax,ay,aw,ah,bx,by,bw,bh){ return ax<bx+bw&&ax+aw>bx&&ay<by+bh&&ay+ah>by; }
function collisions(){ const p=player; if(!p.alive) return; const s=sx(p.worldX); const px=s-30, py=p.y-102, pw=60, ph=96;
  for(const o of obstacles){ const ox=sx(o.worldX); if(aabb(px,py,pw,ph, ox-o.w/2, WALL_Y-o.h, o.w, o.h)){ hit('obstacle'); return; } }
  for(const o of overheads){ const ox=sx(o.worldX); if(aabb(px,py,pw,ph, ox-o.w/2, CEIL_Y, o.w, o.bottomY-CEIL_Y)){ hit('obstacle'); return; } }
  for(const pr of projectiles){ const x=sx(pr.worldX); if(aabb(px,py,pw,ph, x-18, pr.y-16, 36, 32)){ hit('thrown'); return; } }
  const reach=activePU.magnet>0?230:46;
  for(const c of coinsArr){ if(c.taken) continue; if(activePU.magnet>0){ const dd=Math.hypot(sx(c.worldX)-s,c.y-(p.y-60)); if(dd<reach){ c.worldX+=(p.worldX-c.worldX)*0.25; c.y+=((p.y-60)-c.y)*0.25; } }
    if(Math.hypot(sx(c.worldX)-s,c.y-(p.y-60))<c.r+44){ c.taken=true; coins++; Audio2.coin(); burst(sx(c.worldX),c.y,'#ffd23f',5,170); floatText(sx(c.worldX),c.y,'+1','#ffd23f'); } }
  for(const pp of powerups){ if(pp.taken) continue; if(Math.hypot(sx(pp.worldX)-s,pp.y-(p.y-60))<pp.r+44){ pp.taken=true; applyPU(pp.type); Audio2.power(); burst(sx(pp.worldX),pp.y,'#5ad6ff',16,260); } } }
function hit(reason){ if(activePU.boost>0) return;
  if(activePU.shield){ activePU.shield=false; showToast('Shield down!'); Audio2.power(); shake(8,0.25); player.vy=Math.min(player.vy,-300);
    projectiles=projectiles.filter(pr=>Math.abs(sx(pr.worldX)-sx(player.worldX))>140); burst(sx(player.worldX),player.y-50,'#5ad6ff',18,300); if(!chaser.active && level>=2) startChase(); return; }
  die(reason==='caught'?'caught':reason); }
function applyPU(t){ if(t==='shield'){activePU.shield=true; showToast('Shield up');} else if(t==='magnet'){activePU.magnet=8; showToast('Coin magnet!');} else if(t==='boost'){activePU.boost=3.5; showToast('Overcharge!'); shake(6,0.2);} }
function shake(m,t){ shakeMag=m; shakeT=t; }
function burst(x,y,color,n,spd){ for(let i=0;i<n;i++){ const a=Math.random()*6.28,sp=spd*(0.3+Math.random()); particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:0.5+Math.random()*0.4,age:0,color,r:2+Math.random()*4}); } }
function floatText(x,y,txt,color){ floats.push({x,y,txt,color,age:0,life:0.9}); }

/* ---------- Render ------------------------------------------------------ */
function render(){ ctx.clearRect(0,0,VW,VH); ctx.save(); if(shakeT>0){ const m=shakeMag*shakeT; ctx.translate((Math.random()-0.5)*m,(Math.random()-0.5)*m); }
  drawBG(renderDt);
  if(state==='menu'){ ctx.restore(); if(!ready) loadingVeil(); return; }
  drawWall(); drawChaser(); drawThrowers(); drawAnchors(); drawCoinsPU(); drawObstacles(); drawReticles(); drawProjectiles();
  if(player) drawDuo();
  for(const p of particles){ ctx.globalAlpha=1-p.age/p.life; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
  ctx.globalAlpha=1; ctx.textAlign='center';
  for(const f of floats){ ctx.globalAlpha=1-f.age/f.life; ctx.fillStyle=f.color; ctx.font='bold 22px Trebuchet MS, sans-serif'; ctx.fillText(f.txt,f.x,f.y); }
  ctx.globalAlpha=1; ctx.textAlign='left'; ctx.restore(); if(!ready) loadingVeil(); }
function loadingVeil(){ ctx.fillStyle='#1a1020'; ctx.fillRect(0,0,VW,VH); ctx.fillStyle='#ffd23f'; ctx.font='bold 28px Trebuchet MS, sans-serif'; ctx.textAlign='center'; ctx.fillText('Loading…',VW/2,VH/2); ctx.textAlign='left'; }
function drawWall(){ const segs=[]; const a0=camX-PLAYER_X-120, a1=camX+(VW-PLAYER_X)+120;
  const lg=gaps.filter(g=>g.x1>a0&&g.x0<a1).sort((x,y)=>x.x0-y.x0); let cur=a0;
  for(const g of lg){ if(g.x0>cur) segs.push([cur,g.x0]); cur=Math.max(cur,g.x1); } if(cur<a1) segs.push([cur,a1]);
  const gg=ctx.createLinearGradient(0,WALL_Y,0,VH); gg.addColorStop(0,'#cdbfa6'); gg.addColorStop(1,'#9c8b71');
  for(const seg of segs){ const a=sx(seg[0]), b=sx(seg[1]); const w=b-a;
    ctx.fillStyle=gg; ctx.fillRect(a,WALL_Y,w,VH-WALL_Y);
    ctx.fillStyle='#bdae90'; ctx.fillRect(a,WALL_Y-12,w,16); ctx.fillStyle='#8a7a60'; ctx.fillRect(a,WALL_Y+4,w,3);
    ctx.strokeStyle='rgba(90,75,55,0.42)'; ctx.lineWidth=2;
    for(let y=WALL_Y+34;y<VH;y+=34){ ctx.beginPath(); ctx.moveTo(a,y); ctx.lineTo(b,y); ctx.stroke(); }
    let row=0; for(let y=WALL_Y+6;y<VH;y+=34){ for(let x=a-((camX)%80); x<b; x+=80){ if(x<a)continue; ctx.beginPath(); ctx.moveTo(x+(row%2)*40,y); ctx.lineTo(x+(row%2)*40,y+34); ctx.stroke(); } row++; }
    ctx.fillStyle='#6f5f49'; ctx.fillRect(a-3,WALL_Y-12,4,VH-WALL_Y); ctx.fillRect(b-1,WALL_Y-12,4,VH-WALL_Y); }
}
function shadow(x,y,w){ ctx.save(); ctx.fillStyle='rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(x,y,w,w*0.22,0,0,7); ctx.fill(); ctx.restore(); }
function drawChaser(){ if(!chaser.active) return; const by=WALL_Y, x=sx(chaser.worldX); if(x<-200||x>VW+120) return;
  const gap=player.worldX-chaser.worldX, danger=Math.max(0,1-(gap-60)/240);
  if(danger>0.05 && chaser.state!=='giveup'){ ctx.save(); const dg=ctx.createRadialGradient(x,by-60,20,x,by-60,320); dg.addColorStop(0,`rgba(255,40,40,${0.32*danger})`); dg.addColorStop(1,'rgba(255,40,40,0)'); ctx.fillStyle=dg; ctx.fillRect(0,0,VW,VH); ctx.restore(); }
  const st=chaser.state, run=Math.sin(now*12);
  ctx.save(); ctx.translate(x,0); shadow(0,by+2,40);
  ctx.strokeStyle='#27563a'; ctx.lineWidth=13; ctx.lineCap='round';
  if(st==='giveup'){ ctx.beginPath(); ctx.moveTo(-8,by-58); ctx.lineTo(-12,by); ctx.moveTo(8,by-58); ctx.lineTo(12,by); ctx.stroke(); }
  else { ctx.beginPath(); ctx.moveTo(-6,by-58); ctx.lineTo(-6+run*24,by); ctx.moveTo(6,by-58); ctx.lineTo(6-run*24,by); ctx.stroke(); }
  const lean=st==='giveup'?0:0.12; ctx.save(); ctx.translate(0,by-90); ctx.rotate(lean);
  ctx.fillStyle='#2f6e4e'; ctx.strokeStyle='#1e4a32'; ctx.lineWidth=3; rr(-22,-28,44,64,12); ctx.fill(); ctx.stroke(); ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.arc(-8,-6,6,0,7); ctx.fill(); ctx.restore();
  const hx=st==='giveup'?-2:6;
  ctx.fillStyle='#e8b894'; ctx.beginPath(); ctx.arc(hx,by-132,16,0,7); ctx.fill();
  ctx.fillStyle='#27563a'; rr(hx-17,by-146,34,12,4); ctx.fill(); rr(hx-2,by-152,22,8,4); ctx.fill();
  ctx.strokeStyle='#3a2a1a'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(hx+2,by-138); ctx.lineTo(hx+14,by-134); ctx.stroke(); ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(hx+8,by-130,2.5,0,7); ctx.fill();
  if(st==='swipe'){ const ext=1-Math.max(0,chaser.swipeWin)/0.5;
    ctx.strokeStyle='#2f6e4e'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(10,by-104); ctx.lineTo(20+ext*40,by-90); ctx.stroke();
    ctx.strokeStyle='#9a7a4a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(20+ext*40,by-92); ctx.lineTo(80+ext*70,by-72); ctx.stroke();
    ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=5; const nx=100+ext*70; ctx.beginPath(); ctx.arc(nx,by-68,30,0,7); ctx.stroke();
    ctx.strokeStyle='rgba(230,230,230,0.6)'; ctx.lineWidth=1.4; for(let i=-2;i<3;i++){ ctx.beginPath(); ctx.moveTo(nx+i*10,by-98); ctx.lineTo(nx+i*10,by-38); ctx.stroke(); ctx.beginPath(); ctx.moveTo(nx-30,by-68+i*10); ctx.lineTo(nx+30,by-68+i*10); ctx.stroke(); }
    ctx.strokeStyle='rgba(255,255,255,0.5)'; ctx.lineWidth=3; for(let i=0;i<3;i++){ ctx.beginPath(); ctx.moveTo(70-i*16,by-150); ctx.lineTo(100-i*16,by-150); ctx.stroke(); }
  } else if(st==='giveup'){ ctx.strokeStyle='#2f6e4e'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(12,by-104); ctx.lineTo(28,by-150); ctx.stroke();
    ctx.fillStyle='#e8b894'; ctx.beginPath(); ctx.arc(30,by-156,8,0,7); ctx.fill();
    ctx.strokeStyle='#9a7a4a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(-14,by-30); ctx.lineTo(-60,by-6); ctx.stroke(); ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(-74,by-4,24,0,7); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 26px sans-serif'; ctx.fillText('!?',hx+22,by-150);
  } else { ctx.strokeStyle='#2f6e4e'; ctx.lineWidth=12; ctx.beginPath(); ctx.moveTo(14,by-110); ctx.lineTo(44,by-138); ctx.stroke();
    ctx.strokeStyle='#9a7a4a'; ctx.lineWidth=7; ctx.beginPath(); ctx.moveTo(40,by-132); ctx.lineTo(92,by-180); ctx.stroke();
    ctx.strokeStyle='#e8e8e8'; ctx.lineWidth=5; ctx.beginPath(); ctx.arc(104,by-192,26,0,7); ctx.stroke();
    ctx.strokeStyle='rgba(230,230,230,0.6)'; ctx.lineWidth=1.4; for(let i=-2;i<3;i++){ ctx.beginPath(); ctx.moveTo(104+i*9,by-218); ctx.lineTo(104+i*9,by-166); ctx.stroke(); ctx.beginPath(); ctx.moveTo(78,by-192+i*9); ctx.lineTo(130,by-192+i*9); ctx.stroke(); } }
  ctx.restore(); }
function drawThrowers(){ for(const t of throwers){ const x=sx(t.worldX); if(x<-40||x>VW+90) continue; const by=WALL_Y;
  ctx.save(); ctx.translate(x,0); shadow(0,by+2,32);
  ctx.strokeStyle='#3a4a6a'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(-8,by-40); ctx.lineTo(-10,by); ctx.moveTo(8,by-40); ctx.lineTo(10,by); ctx.stroke();
  ctx.fillStyle='#c85a3f'; ctx.strokeStyle='#8a3a26'; ctx.lineWidth=3; rr(-20,by-96,40,58,12); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#e8b894'; ctx.beginPath(); ctx.arc(0,by-112,17,0,7); ctx.fill();
  ctx.fillStyle='#5a4a3a'; ctx.beginPath(); ctx.arc(0,by-120,18,Math.PI,0); ctx.fill();
  ctx.strokeStyle='#7a2a1a'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,by-104,6,0.1*Math.PI,0.9*Math.PI); ctx.stroke();
  ctx.strokeStyle='#c85a3f'; ctx.lineWidth=11; ctx.lineCap='round';
  if(t.anim>0){ ctx.beginPath(); ctx.moveTo(-12,by-92); ctx.lineTo(-44,by-110); ctx.stroke(); }
  else { const w=Math.min(1,t.wind/0.55); ctx.beginPath(); ctx.moveTo(14,by-88); ctx.lineTo(14+w*22,by-100-w*34); ctx.stroke();
    if(!t.fired){ ctx.save(); ctx.translate(16+w*26,by-104-w*38); ctx.rotate(-0.5); ctx.fillStyle='#3a2a22'; ctx.beginPath(); ctx.ellipse(0,0,16,10,0,0,7); ctx.fill(); ctx.fillStyle='#5a4234'; ctx.fillRect(-16,3,32,5); ctx.restore();
      const pr=0.7+0.3*Math.sin(now*12); ctx.save(); ctx.globalAlpha=pr; ctx.fillStyle='#fff'; ctx.strokeStyle='#ff3b3b'; ctx.lineWidth=3; ctx.beginPath(); ctx.arc(0,by-160,15,0,7); ctx.fill(); ctx.stroke(); ctx.fillStyle='#ff3b3b'; ctx.font='bold 22px sans-serif'; ctx.textAlign='center'; ctx.fillText('!',0,by-152); ctx.textAlign='left'; ctx.restore(); } }
  ctx.restore(); } }
function drawReticles(){ for(const pr of projectiles){ if(pr.y>WALL_Y-30) continue; const x=sx(pr.landX);
  ctx.save(); const pulse=0.55+0.45*Math.sin(now*14); ctx.globalAlpha=pulse; ctx.strokeStyle='#ff3b3b'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.arc(x,WALL_Y-8,24,0,7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x-32,WALL_Y-8); ctx.lineTo(x+32,WALL_Y-8); ctx.moveTo(x,WALL_Y-32); ctx.lineTo(x,WALL_Y+12); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalAlpha=0.32; ctx.strokeStyle='#fff'; ctx.setLineDash([3,9]); ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(sx(pr.worldX),pr.y); ctx.quadraticCurveTo((sx(pr.worldX)+x)/2,pr.y-50,x,WALL_Y-20); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); } }
function drawProjectiles(){ for(const pr of projectiles){ const x=sx(pr.worldX); shadow(x,WALL_Y-4,16);
  ctx.save(); ctx.translate(x,pr.y); ctx.rotate(Math.sin(now*22)*0.5); ctx.fillStyle='#3a2a22'; ctx.beginPath(); ctx.ellipse(0,0,20,12,0,0,7); ctx.fill(); ctx.fillStyle='#5a4234'; ctx.fillRect(-20,4,40,6); ctx.fillStyle='#7a5a44'; ctx.beginPath(); ctx.ellipse(-6,-4,9,6,0,0,7); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(18,2); ctx.lineTo(40,8); ctx.stroke(); ctx.restore(); } }
function drawAnchors(){ for(const a of anchors){ const x=sx(a.worldX); if(x<-120||x>VW+120) continue;
  ctx.strokeStyle='#5a3f28'; ctx.lineWidth=12; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x-120,0); ctx.quadraticCurveTo(x-40,a.y-30,x,a.y); ctx.stroke();
  ctx.fillStyle='#3a5a2e'; for(let i=0;i<5;i++){ ctx.beginPath(); ctx.ellipse(x-92+i*22,20+i*8,17,9,0.4,0,7); ctx.fill(); }
  const pulse=0.6+0.4*Math.sin(now*5); ctx.save(); ctx.globalAlpha=pulse*0.55; ctx.fillStyle='#7CFF8A'; ctx.beginPath(); ctx.arc(x,a.y,a.r+10,0,7); ctx.fill(); ctx.restore();
  ctx.fillStyle=a.used?'#7d8d6b':'#9be86b'; ctx.strokeStyle='#2c5a1e'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(x,a.y,a.r,0,7); ctx.fill(); ctx.stroke();
  if(!a.used && player && player.worldX>a.worldX-460 && player.worldX<a.worldX+40){
    ctx.fillStyle='rgba(20,12,22,0.82)'; ctx.strokeStyle='#7CFF8A'; ctx.lineWidth=2; rr(x-58,a.y-66,116,30,8); ctx.fill(); ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='bold 16px Trebuchet MS, sans-serif'; ctx.textAlign='center'; ctx.fillText('HOLD to swing',x,a.y-46); ctx.textAlign='left'; } } }
function drawObstacles(){ for(const o of obstacles){ const x=sx(o.worldX); if(x<-80||x>VW+80) continue; shadow(x,WALL_Y-4,o.w*0.5);
  if(o.kind==='cactus'){ ctx.fillStyle='#cf9a5a'; rr(x-o.w/2,WALL_Y-22,o.w,22,6); ctx.fill();
    ctx.fillStyle='#3c6b3a'; ctx.strokeStyle='#274d28'; ctx.lineWidth=4; rr(x-12,WALL_Y-o.h,24,o.h-16,12); ctx.fill(); ctx.stroke(); rr(x-30,WALL_Y-o.h*0.7,16,30,8); ctx.fill(); rr(x+14,WALL_Y-o.h*0.6,16,26,8); ctx.fill(); }
  else { ctx.fillStyle='#e0d2b8'; ctx.beginPath(); ctx.arc(x,WALL_Y-o.h*0.5,o.w*0.5,Math.PI,0); ctx.fill();
    ctx.fillStyle='#c0452f'; ctx.beginPath(); ctx.moveTo(x-o.w*0.45,WALL_Y-o.h*0.5); ctx.lineTo(x,WALL_Y-o.h); ctx.lineTo(x+o.w*0.45,WALL_Y-o.h*0.5); ctx.fill();
    ctx.fillStyle='#e8c9a0'; ctx.beginPath(); ctx.arc(x,WALL_Y-o.h*0.42,o.w*0.26,0,7); ctx.fill(); ctx.fillStyle='#dfe7ec'; ctx.beginPath(); ctx.arc(x,WALL_Y-o.h*0.34,o.w*0.18,0,Math.PI); ctx.fill(); } }
  for(const o of overheads){ const x=sx(o.worldX); if(x<-80||x>VW+80) continue;
    ctx.strokeStyle='#5a3f28'; ctx.lineWidth=10; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(x-40,0); ctx.quadraticCurveTo(x,40,x,o.bottomY); ctx.stroke();
    ctx.fillStyle='#3a5a2e'; for(let i=0;i<4;i++){ ctx.beginPath(); ctx.ellipse(x-20+i*14, 30+i*((o.bottomY-40)/4), 16,9,0.5,0,7); ctx.fill(); }
    ctx.fillStyle='#2c4a24'; ctx.beginPath(); ctx.ellipse(x,o.bottomY,26,18,0,0,7); ctx.fill(); } }
function drawCoinsPU(){ for(const c of coinsArr){ if(c.taken) continue; const x=sx(c.worldX); if(x<-40||x>VW+40) continue;
    const s2=Math.sin(now*4+c.worldX*0.05)*0.12+1; if(img.coin.complete&&img.coin.naturalWidth) ctx.drawImage(img.coin,x-c.r*1.05*s2,c.y-c.r*1.05,c.r*2.1*s2,c.r*2.1); else { ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.arc(x,c.y,c.r,0,7); ctx.fill(); } }
  for(const pp of powerups){ if(pp.taken) continue; const x=sx(pp.worldX); if(x<-50||x>VW+50) continue; const im=pp.type==='shield'?img.shield:pp.type==='magnet'?img.magnet:img.boost;
    ctx.save(); ctx.globalAlpha=0.4; ctx.fillStyle=pp.type==='boost'?'#ffb000':pp.type==='magnet'?'#ff4d4d':'#5ad6ff'; ctx.beginPath(); ctx.arc(x,pp.y,pp.r*1.5,0,7); ctx.fill(); ctx.restore();
    if(im&&im.complete&&im.naturalWidth) ctx.drawImage(im,x-pp.r*1.1,pp.y-pp.r*1.1,pp.r*2.2,pp.r*2.2); } }

/* ---------- Duo --------------------------------------------------------- */
function drawDuo(){ const p=player; const s=sx(p.worldX); const fy=p.y; const air=!p.onGround&&!p.swing;
  if(!overGap(p.worldX)){ const hgt=Math.max(0,WALL_Y-p.y); const sw=Math.max(18,46-hgt*0.08); ctx.save(); ctx.globalAlpha=Math.max(0.08,0.28-hgt*0.0006); ctx.fillStyle='#000'; ctx.beginPath(); ctx.ellipse(s,WALL_Y+2,sw,sw*0.2,0,0,7); ctx.fill(); ctx.restore(); }
  let rot=0; if(p.swing){ rot=Math.sin(p.swing.theta)*0.5; } else if(air){ rot=Math.max(-0.25,Math.min(0.35,p.vy*0.0004)); }
  ctx.save(); ctx.translate(s,fy); ctx.rotate(rot); const sq=p.squash, sqx=1+(1-sq)*0.5, sqy=sq; ctx.scale(sqx,sqy);
  const runP=runCycle, L1='#241f22', L2='#2b2422';
  ctx.strokeStyle='#2b2422'; ctx.lineWidth=11; ctx.lineCap='round'; ctx.beginPath(); ctx.moveTo(-52,-44); ctx.quadraticCurveTo(-86,-54+Math.sin(now*6)*4,-80,-86); ctx.stroke();
  function leg(bx,ph,front){ ctx.strokeStyle=front?L2:L1; ctx.lineWidth=12; ctx.lineCap='round'; let ang=air?(front?0.5:-0.4):Math.sin(ph)*0.8; const fx=bx+Math.sin(ang)*20, fyy=air?-16:0, kx=bx+Math.sin(ang)*12; ctx.beginPath(); ctx.moveTo(bx,-26); ctx.lineTo(kx,-12); ctx.lineTo(fx,fyy); ctx.stroke(); }
  leg(-30,runP,false); leg(34,runP+Math.PI,false);
  ctx.fillStyle='#332b2e'; ctx.strokeStyle='#15110f'; ctx.lineWidth=5; ctx.beginPath(); ctx.ellipse(0,-46,58,30,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f1e4cb'; ctx.beginPath(); ctx.ellipse(6,-36,42,18,0,0,Math.PI); ctx.fill();
  leg(-12,runP+Math.PI,true); leg(40,runP,true);
  ctx.save(); ctx.translate(60,-58);
  ctx.fillStyle='#332b2e'; ctx.strokeStyle='#15110f'; ctx.lineWidth=4;
  ctx.beginPath(); ctx.moveTo(-12,-18); ctx.lineTo(-20,-40); ctx.lineTo(2,-26); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(14,-22); ctx.lineTo(20,-44); ctx.lineTo(28,-22); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(6,-2,26,24,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f1e4cb'; ctx.beginPath(); ctx.ellipse(22,6,14,11,0,0,7); ctx.fill();
  ctx.fillStyle='#f6829b'; ctx.beginPath(); ctx.ellipse(33,4,4,3,0,0,7); ctx.fill();
  ctx.fillStyle='#ffd23f'; ctx.beginPath(); ctx.ellipse(14,-4,7,8,0,0,7); ctx.fill();
  ctx.fillStyle='#15110f'; ctx.beginPath(); ctx.ellipse(16,-3,3,6,0,0,7); ctx.fill();
  ctx.strokeStyle='#efe6d2'; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(30,4); ctx.lineTo(46,2); ctx.moveTo(30,8); ctx.lineTo(46,12); ctx.stroke(); ctx.restore();
  const mb=air?-2:Math.sin(runP)*2;
  ctx.save(); ctx.translate(-8,-72+mb);
  ctx.fillStyle='#6b4630'; ctx.strokeStyle='#281612'; ctx.lineWidth=4; ctx.beginPath(); ctx.ellipse(0,0,22,24,0,0,7); ctx.fill(); ctx.stroke();
  ctx.strokeStyle='#5a3a28'; ctx.lineWidth=8; ctx.lineCap='round'; ctx.beginPath();
  if(p.reach>0.3 || p.swing){ ctx.moveTo(2,-6); ctx.lineTo(-16,-42); } else { ctx.moveTo(8,6); ctx.quadraticCurveTo(22,14,28,8); } ctx.stroke();
  ctx.fillStyle='#6b4630'; ctx.strokeStyle='#281612'; ctx.lineWidth=4; ctx.beginPath(); ctx.ellipse(2,-22,17,16,0,0,7); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-12,-24,7,8,0,0,7); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.ellipse(16,-22,7,8,0,0,7); ctx.fill(); ctx.stroke();
  ctx.fillStyle='#f0c79a'; ctx.beginPath(); ctx.ellipse(3,-19,11,12,0,0,7); ctx.fill();
  ctx.fillStyle='#281612'; ctx.beginPath(); ctx.ellipse(-1,-21,2.5,3,0,0,7); ctx.fill(); ctx.beginPath(); ctx.ellipse(8,-21,2.5,3,0,0,7); ctx.fill();
  ctx.beginPath(); ctx.arc(3,-13,5,0,Math.PI); ctx.lineWidth=2; ctx.strokeStyle='#281612'; ctx.stroke(); ctx.restore();
  ctx.strokeStyle='#8a5a3c'; ctx.lineWidth=9; ctx.lineCap='round'; ctx.beginPath();
  if(p.swing){ const ax=(sx(p.swing.a.worldX)-s)/sqx, ay=(p.swing.a.y-fy)/sqy; ctx.save(); ctx.rotate(-rot); ctx.moveTo(-14,-78); ctx.quadraticCurveTo((-14+ax)/2-10,(-78+ay)/2,ax,ay); ctx.stroke(); ctx.restore(); }
  else if(air){ ctx.moveTo(-14,-78); ctx.quadraticCurveTo(-46,-92,-40,-120); ctx.stroke(); ctx.beginPath(); ctx.arc(-40,-122,7,0,6); ctx.stroke(); }
  else { const w=Math.sin(now*8)*8; ctx.moveTo(-14,-78); ctx.quadraticCurveTo(-44,-96+w,-28,-128+w); ctx.stroke(); ctx.beginPath(); ctx.arc(-26,-130+w,7,0,6); ctx.stroke(); }
  ctx.restore(); }

/* ---------- HUD / overlays ---------------------------------------------- */
function el(id){ return document.getElementById(id); }
function show(id,on){ el(id).classList.toggle('hidden',!on); }
function hideAllOverlays(){ ['menu','howto','pause','over'].forEach(o=>show(o,false)); }
function showHint(on){ el('introHint').classList.toggle('hidden',!on); }
function showBanner(t){ const e=el('banner'); e.textContent=t; e.classList.remove('show'); void e.offsetWidth; e.classList.add('show'); }
let toastT=null; function showToast(t){ const e=el('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toastT); toastT=setTimeout(()=>e.classList.remove('show'),1500); }
function updateHUD(){ el('hudCoins').textContent=coins; const m=runDist/PX_PER_M; el('hudDist').textContent=Math.floor(m)+' m'; el('hudMissionTxt').textContent='Level '+level;
  el('hudMissionFill').style.width=Math.min(100,(m-levelStartM)/LEVEL_LEN*100)+'%';
  let pu=''; if(activePU.boost>0)pu='Overcharge '+activePU.boost.toFixed(1)+'s'; else if(activePU.magnet>0)pu='Magnet '+activePU.magnet.toFixed(1)+'s'; else if(activePU.shield)pu='Shield ready';
  el('hudPU').style.display=pu?'flex':'none'; el('hudPUtxt').textContent=pu; }
function refreshMenu(){ el('mBest').textContent=bestDist+' m'; el('mCoins').textContent=coinsBanked; el('mLevel').textContent=bestLevel; }

/* ---------- Loop -------------------------------------------------------- */
function loop(t){ requestAnimationFrame(loop); if(!lastT) lastT=t; let dt=(t-lastT)/1000; lastT=t; dt=Math.min(dt,0.05); now+=dt;
  renderDt=(state==='dying')?dt*0.4:dt; try{ if(ready) update((state==='dying')?dt*0.4:dt); render(); }catch(err){ if(!loop._w){ console.error('loop error',err); loop._w=true; } } }
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
