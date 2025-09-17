// ================== Rescate Submarino • Lógica principal ==================
// Mantiene: 10 niveles, 10 tanques/ nivel, subida de velocidad y complejidad,
// HUD, pausa, resumen final, toast de vidas, banner “Nivel X”.
// NUEVO: Modal “Terminar” (navbar) y opción “Terminar aquí” al cerrar nivel.
// EXTRA: Mar “real” en canvas (gradiente profundo + rayos de luz + cáusticas + burbujas).

// ------------------ Helpers ------------------
const rand = (min, max) => Math.random() * (max - min) + min;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist2 = (x1, y1, x2, y2) => { const dx=x2-x1, dy=y2-y1; return dx*dx + dy*dy; };
const circleHit = (a, b) => dist2(a.x,a.y,b.x,b.y) <= (a.r+b.r)*(a.r+b.r);

// ------------------ Estado del juego ------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const HUD = {
  level:  document.getElementById('hudLevel'),
  tokens: document.getElementById('hudTokens'),
  lives:  document.getElementById('hudLives'),
  score:  document.getElementById('hudScore'),
  speed:  document.getElementById('hudSpeed'),
};

const btnStart   = document.getElementById('btnStart');
const btnPause   = document.getElementById('btnPause');
const btnResume  = document.getElementById('btnResume');
const btnRestart = document.getElementById('btnRestart');
const btnEnd     = document.getElementById('btnEnd');

const levelModalEl = document.getElementById('levelModal');
const levelModal   = new bootstrap.Modal(levelModalEl);
const levelSummary = document.getElementById('levelSummary');
const btnNextLevel = document.getElementById('btnNextLevel');
const btnEndHere   = document.getElementById('btnEndHere');

const finalModalEl = document.getElementById('finalModal');
const finalModal   = new bootstrap.Modal(finalModalEl);
const finalSummary = document.getElementById('finalSummary');
const btnPlayAgain = document.getElementById('btnPlayAgain');

// Modal confirmar terminar
const endConfirmEl   = document.getElementById('endConfirmModal');
const endConfirmModal= new bootstrap.Modal(endConfirmEl);
const btnCancelEnd   = document.getElementById('btnCancelEnd');
const btnConfirmEnd  = document.getElementById('btnConfirmEnd');

// Toast (vidas restantes)
const lifeToastEl   = document.getElementById('lifeToast');
const lifeToastBody = document.getElementById('lifeToastBody');
const lifeToast     = new bootstrap.Toast(lifeToastEl, { delay: 2200 });

const GAME = {
  level: 1,
  maxLevels: 10,
  tokensTarget: 10,
  tokensGot: 0,
  score: 0,
  lives: 3,
  running: false,
  paused: false,
  baseSpeed: 1.0,
  entities: { player:null, tokens:[], mines:[], currents:[], powerups:[] },
  perLevelStats: [],
  lastCounts: { mines:0, currents:0 }
};

// Banner de nivel
let levelBannerTimer = 0; // frames (~60fps)
function startLevelBanner(){ levelBannerTimer = 90; }

// ------------------ Entidades ------------------
class Player { // Submarino
  constructor(){
    this.r=16; this.x=canvas.width/2; this.y=canvas.height-60;
    this.speed=2.4; this.vx=0; this.vy=0; this.shield=0; this.angle=0;
  }
  update(keys){
    const s = this.speed * GAME.baseSpeed;
    const ax = (keys['ArrowRight']||keys['d']?1:0) - (keys['ArrowLeft']||keys['a']?1:0);
    const ay = (keys['ArrowDown'] ||keys['s']?1:0) - (keys['ArrowUp']  ||keys['w']?1:0);
    const mag = Math.hypot(ax,ay)||1;
    this.vx=(ax/mag)*s; this.vy=(ay/mag)*s;
    this.x+=this.vx; this.y+=this.vy;

    // Corrientes
    for (const c of GAME.entities.currents){
      const d = Math.hypot(c.x-this.x, c.y-this.y);
      const infl = Math.max(0, 1 - d/c.range);
      if (infl>0){ this.x += c.vx*infl; this.y += c.vy*infl; }
    }

    // Bordes
    this.x = clamp(this.x, this.r, canvas.width - this.r);
    this.y = clamp(this.y, this.r, canvas.height - this.r);

    // Orientación
    if (Math.hypot(this.vx,this.vy)>0.05){
      const target = Math.atan2(this.vy,this.vx);
      this.angle = this.angle*0.85 + target*0.15;
    }

    if (this.shield>0) this.shield--;
  }
  draw(){
    ctx.save(); ctx.translate(this.x,this.y); ctx.rotate(this.angle);

    // Escudo
    if (this.shield>0){
      ctx.beginPath(); ctx.arc(0,0,this.r+8,0,Math.PI*2);
      ctx.strokeStyle='rgba(34,211,238,0.85)'; ctx.lineWidth=3; ctx.stroke();
    }

    // Casco en cápsula
    const L=56, H=24, R=H/2;
    const grad = ctx.createLinearGradient(-L/2,0,L/2,0);
    grad.addColorStop(0,'#22d3ee'); grad.addColorStop(1,'#38bdf8');
    ctx.fillStyle=grad;
    ctx.beginPath();
    ctx.moveTo(-L/2+R,-H/2);
    ctx.lineTo(L/2-R,-H/2);
    ctx.arc(L/2-R,0,R,-Math.PI/2,Math.PI/2);
    ctx.lineTo(-L/2+R,H/2);
    ctx.arc(-L/2+R,0,R,Math.PI/2,-Math.PI/2);
    ctx.closePath(); ctx.fill();

    // Ventanilla
    ctx.beginPath(); ctx.fillStyle='#0b0f17';
    ctx.arc(L*0.15,0,6.5,0,Math.PI*2); ctx.fill();

    // Periscopio + aletas + hélice
    ctx.fillStyle='#0b0f17';
    ctx.fillRect(-4,-H/2-10,8,10);  // tubo
    ctx.fillRect(-4,-H/2-12,16,4); // cabeza
    ctx.beginPath(); ctx.moveTo(-L/2+6,H/2-2); ctx.lineTo(-L/2+20,H/2+8); ctx.lineTo(-L/2+26,H/2-2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-L/2-2,-6); ctx.lineTo(-L/2-12,0); ctx.lineTo(-L/2-2,6);
    ctx.closePath(); ctx.fill();

    ctx.restore();
  }
}

class Token { // Tanque O₂
  constructor(x,y){ this.x=x; this.y=y; this.r=10; this.pulse=Math.random()*Math.PI*2; }
  drawRoundedRect(x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y); ctx.arc(x+w-r, y+r, r, -Math.PI/2, 0);
    ctx.lineTo(x+w, y+h-r); ctx.arc(x+w-r, y+h-r, r, 0, Math.PI/2);
    ctx.lineTo(x+r, y+h); ctx.arc(x+r, y+h-r, r, Math.PI/2, Math.PI);
    ctx.lineTo(x, y+r); ctx.arc(x+r, y+r, r, Math.PI, -Math.PI/2);
    ctx.closePath();
  }
  draw(){
    this.pulse+=0.08; const glow=0.4+Math.sin(this.pulse)*0.4;
    const w=18,h=26,x=this.x-w/2,y=this.y-h/2;

    // Halo
    ctx.beginPath(); ctx.arc(this.x,this.y,this.r+8,0,Math.PI*2);
    ctx.fillStyle=`rgba(34,197,94,${0.15+glow*0.15})`; ctx.fill();

    // Cuerpo
    const body=ctx.createLinearGradient(x,y,x+w,y);
    body.addColorStop(0,'#22c55e'); body.addColorStop(1,'#16a34a');
    ctx.fillStyle=body; this.drawRoundedRect(x,y+3,w,h-6,5); ctx.fill();

    // Válvula y maneral
    ctx.fillStyle='#cbd5e1'; ctx.fillRect(this.x-4,y-2,8,6); ctx.fillRect(this.x-10,y,20,3);

    // Texto O₂
    ctx.fillStyle='#0b0f17'; ctx.font='bold 10px system-ui';
    ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('O₂',this.x,this.y+1);
  }
}

class Mine {
  constructor(x,y,sp){ this.x=x; this.y=y; this.r=12; const a=rand(0,Math.PI*2); this.vx=Math.cos(a)*sp; this.vy=Math.sin(a)*sp; }
  update(){
    this.x+=this.vx*GAME.baseSpeed; this.y+=this.vy*GAME.baseSpeed;
    if (this.x<this.r || this.x>canvas.width -this.r) this.vx*=-1;
    if (this.y<this.r || this.y>canvas.height-this.r) this.vy*=-1;
  }
  draw(){
    ctx.beginPath(); ctx.fillStyle='#ef4444'; ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#991b1b';
    for (let i=0;i<8;i++){
      const ang=(Math.PI*2/8)*i;
      const x1=this.x+Math.cos(ang)*this.r, y1=this.y+Math.sin(ang)*this.r;
      const x2=this.x+Math.cos(ang)*(this.r+6), y2=this.y+Math.sin(ang)*(this.r+6);
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
    }
  }
}

class Current {
  constructor(x,y,range,vx,vy){ this.x=x; this.y=y; this.range=range; this.vx=vx; this.vy=vy; this.t=Math.random()*1000; }
  update(){ this.t+=0.02; this.vx*=(0.99+Math.sin(this.t)*0.005); this.vy*=(0.99+Math.cos(this.t)*0.005); }
  draw(){
    ctx.beginPath(); ctx.strokeStyle='rgba(56,189,248,.35)'; ctx.setLineDash([4,4]);
    ctx.arc(this.x,this.y,this.range,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(this.x,this.y); ctx.lineTo(this.x+this.vx*25,this.y+this.vy*25);
    ctx.strokeStyle='rgba(34,211,238,.8)'; ctx.stroke();
  }
}

class PowerUp {
  constructor(x,y,type){ this.x=x; this.y=y; this.r=9; this.type=type; this.life=12*60; }
  update(){ this.life--; }
  draw(){
    let c='#22d3ee'; if (this.type==='slow') c='#f59e0b'; if (this.type==='score') c='#22c55e';
    ctx.beginPath(); ctx.fillStyle=c; ctx.arc(this.x,this.y,this.r,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#0b0f17'; ctx.font='bold 10px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
    const symbol=this.type==='shield'?'🛡': this.type==='slow'?'🐢':'★'; ctx.fillText(symbol,this.x,this.y+1);
  }
}

// ------------------ Generación por nivel (escala) ------------------
function setupLevel(level){
  GAME.tokensGot=0;
  GAME.entities.tokens=[]; GAME.entities.mines=[]; GAME.entities.currents=[]; GAME.entities.powerups=[];
  GAME.baseSpeed = 1 + (level-1)*0.12;

  if (!GAME.entities.player) GAME.entities.player = new Player();

  // 10 tanques
  for (let i=0;i<GAME.tokensTarget;i++){
    const x=rand(30,canvas.width-30), y=rand(30,canvas.height-30);
    GAME.entities.tokens.push(new Token(x,y));
  }

  // Más minas y corrientes cada nivel
  const minesCount    = Math.min(4 + Math.floor(level*0.9), 18);
  const currentsCount = Math.min(1 + Math.floor(level/3), 6);
  GAME.lastCounts.mines=minesCount; GAME.lastCounts.currents=currentsCount;

  for (let i=0;i<minesCount;i++){
    const x=rand(20,canvas.width-20), y=rand(20,canvas.height-20);
    const sp = rand(0.6,1.5) + level*0.07;
    GAME.entities.mines.push(new Mine(x,y,sp));
  }
  for (let i=0;i<currentsCount;i++){
    const x=rand(80,canvas.width-80), y=rand(80,canvas.height-80);
    const range=rand(60,120)+level*4; const vx=rand(-0.6,0.6), vy=rand(-0.6,0.6);
    GAME.entities.currents.push(new Current(x,y,range,vx,vy));
  }

  // Posición inicial + escudo
  const p=GAME.entities.player; p.x=canvas.width/2; p.y=canvas.height-60; p.shield=60;

  updateHUD();
  startLevelBanner();
}

function updateHUD(){
  HUD.level.textContent  = `${GAME.level} / ${GAME.maxLevels}`;
  HUD.tokens.textContent = `${GAME.tokensGot} / ${GAME.tokensTarget}`;
  HUD.lives.textContent  = GAME.lives;
  HUD.score.textContent  = GAME.score;
  HUD.speed.textContent  = `${GAME.baseSpeed.toFixed(1)}x`;
}

// ------------------ Render del mar realista ------------------
let flash = 0; function flashScreen(){ flash = 12; }

// Rayos de luz descendentes
function drawLightRays(t){
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let i=0;i<3;i++){
    const x = (canvas.width/4)*(i+0.5) + Math.sin((t*0.0005)+(i*2))*80;
    const grad = ctx.createLinearGradient(x,0,x,canvas.height);
    grad.addColorStop(0, 'rgba(255,255,255,0.20)');
    grad.addColorStop(0.2,'rgba(255,255,255,0.09)');
    grad.addColorStop(1, 'rgba(255,255,255,0.00)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    const spread = 160 + Math.sin((t*0.0007)+i)*60;
    ctx.moveTo(x-spread/2,0);
    ctx.lineTo(x+spread/2,0);
    ctx.lineTo(x+spread*0.2,canvas.height);
    ctx.lineTo(x-spread*0.2,canvas.height);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Cáusticas simples (ondas sinuosas muy sutiles)
function drawCaustics(t){
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  for (let k=0;k<6;k++){
    const yBase = (k+1)*canvas.height/7;
    ctx.beginPath();
    for (let x=0;x<=canvas.width; x+=12){
      const y = yBase + Math.sin( (x*0.03) + (t*0.002) + k*1.3 )*6
                      + Math.sin( (x*0.013)+ (t*0.003) + k*0.7 )*3;
      if (x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// Burbujas ascendentes suaves
function drawBubbles(t){
  for (let i=0;i<18;i++){
    const x = (t*0.02 + i*50) % canvas.width;
    const y = (i*40 + (t*0.05)%canvas.height);
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(56,189,248,.10)';
    ctx.arc(x, canvas.height - (y%canvas.height), 6, 0, Math.PI*2);
    ctx.stroke();
  }
}

// Fondo marino: gradiente + oscurecido inferior
function drawSea(t){
  // base
  const g = ctx.createLinearGradient(0,0,0,canvas.height);
  g.addColorStop(0,'#0f2a44'); g.addColorStop(0.55,'#0a1e32'); g.addColorStop(1,'#071625');
  ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);

  // flash de daño
  if (flash>0){ ctx.fillStyle=`rgba(239,68,68,${flash/20})`; ctx.fillRect(0,0,canvas.width,canvas.height); flash--; }

  // rayos + cáusticas + burbujas
  drawLightRays(t);
  drawCaustics(t);
  drawBubbles(t);

  // “fondo” oscuro al fondo
  const floor = ctx.createLinearGradient(0,canvas.height*0.8,0,canvas.height);
  floor.addColorStop(0,'rgba(0,0,0,0)');
  floor.addColorStop(1,'rgba(0,0,0,0.35)');
  ctx.fillStyle=floor; ctx.fillRect(0,canvas.height*0.8,canvas.width,canvas.height*0.2);
}

// ------------------ Bucle principal ------------------
const keys = {};
window.addEventListener('keydown', e=> keys[e.key]=true);
window.addEventListener('keyup',   e=> keys[e.key]=false);

let rafId=null; let lastFrame=performance.now();

function loop(now){
  const dt = Math.min(32, now-lastFrame); lastFrame=now;

  // Agua realista
  drawSea(now);

  // Currents, tokens, powerups, minas
  for (const c of GAME.entities.currents){ c.update(); c.draw(); }
  for (const t of GAME.entities.tokens) t.draw();

  for (let i=GAME.entities.powerups.length-1;i>=0;i--){
    const p=GAME.entities.powerups[i]; p.update(); p.draw();
    if (p.life<=0) GAME.entities.powerups.splice(i,1);
  }

  for (const m of GAME.entities.mines){ m.update(); m.draw(); }

  // Player + colisiones
  if (GAME.entities.player){
    const pl=GAME.entities.player; pl.update(keys); pl.draw();

    // Token pickup
    for (let i=GAME.entities.tokens.length-1;i>=0;i--){
      if (circleHit(pl, GAME.entities.tokens[i])){
        GAME.entities.tokens.splice(i,1);
        GAME.tokensGot++; GAME.score += 100 + Math.floor(10*GAME.baseSpeed);
        if (Math.random() < 0.10 + (GAME.level*0.008)) dropRandomPowerUp();
        updateHUD();
      }
    }
    // PowerUp pickup
    for (let i=GAME.entities.powerups.length-1;i>=0;i--){
      const p=GAME.entities.powerups[i];
      if (circleHit(pl,p)){ applyPowerUp(p.type); GAME.entities.powerups.splice(i,1); updateHUD(); }
    }
    // Minas
    for (const m of GAME.entities.mines){
      if (circleHit(pl,m)){
        if (pl.shield>0){ m.vx*=-1; m.vy*=-1; }
        else{
          GAME.lives--; pl.shield=90; flashScreen(); updateHUD(); showLivesToast();
          if (GAME.lives<=0){ endGame(false); return; }
        }
      }
    }
  }

  // Fin de nivel
  if (GAME.tokensGot >= GAME.tokensTarget){
    recordLevelStats();
    if (GAME.level >= GAME.maxLevels){ endGame(true); return; }
    else { GAME.level++; showLevelModal(); return; }
  }

  // Banner de nivel
  if (levelBannerTimer>0){ drawLevelBanner(); levelBannerTimer--; }

  if (GAME.running && !GAME.paused) rafId=requestAnimationFrame(loop);
}

// ------------------ Power-ups ------------------
function dropRandomPowerUp(){
  const types=['shield','slow','score'];
  const type=types[Math.floor(rand(0,types.length))];
  const x=rand(30,canvas.width-30), y=rand(30,canvas.height-30);
  GAME.entities.powerups.push(new PowerUp(x,y,type));
}
function applyPowerUp(type){
  if (type==='shield'){ GAME.entities.player.shield=Math.max(GAME.entities.player.shield,240); }
  else if (type==='slow'){ for (const m of GAME.entities.mines){ m.vx*=0.6; m.vy*=0.6; } }
  else if (type==='score'){ GAME.score+=500; }
}

// ------------------ Banners y resúmenes ------------------
function drawLevelBanner(){
  const alpha=Math.min(1, levelBannerTimer/30);
  ctx.save(); ctx.globalAlpha=alpha;
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='white'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.font='bold 42px system-ui'; ctx.fillText(`Nivel ${GAME.level}`, canvas.width/2, canvas.height/2 - 10);
  ctx.font='16px system-ui';
  const line2=`Velocidad ${GAME.baseSpeed.toFixed(1)}x • Minas ${GAME.lastCounts.mines} • Corrientes ${GAME.lastCounts.currents}`;
  ctx.fillText(line2, canvas.width/2, canvas.height/2 + 24);
  ctx.restore();
}

function recordLevelStats(){
  GAME.perLevelStats.push({ level:GAME.level, speed:GAME.baseSpeed.toFixed(1)+'x', score:GAME.score, lives:GAME.lives });
}

function showLevelModal(){
  levelSummary.textContent =
    `Nivel ${GAME.level-1} completado. Oxígeno: ${GAME.tokensTarget}/${GAME.tokensTarget}. ` +
    `Velocidad: ${(1 + (GAME.level-2)*0.12).toFixed(1)}x. Puntos: ${GAME.score}. Vidas: ${GAME.lives}.`;
  GAME.running=false; GAME.paused=true; cancelAnimationFrame(rafId);
  levelModal.show();
}

function endGame(victory){
  GAME.running=false; cancelAnimationFrame(rafId);
  let html = `<p class="mb-2">${victory ? '¡Misión cumplida! 🎉' : 'Partida finalizada.'}</p>`;
  html += `<ul class="list-group mb-3">`;
  for (const s of GAME.perLevelStats){
    html += `<li class="list-group-item bg-dark text-light d-flex justify-content-between">
      <span>Nivel ${s.level} <span class="badge bg-secondary ms-2">vel ${s.speed}</span></span>
      <span>Puntos: <strong>${s.score}</strong> · Vidas: <strong>${s.lives}</strong></span>
    </li>`;
  }
  html += `</ul><p class="mb-0">Puntuación total: <strong>${GAME.score}</strong></p>`;
  finalSummary.innerHTML=html; finalModal.show();
}

// ------------------ UI ------------------
btnStart.addEventListener('click', ()=>{
  resetGame(); GAME.running=true; GAME.paused=false; lastFrame=performance.now(); rafId=requestAnimationFrame(loop);
});
btnPause.addEventListener('click', ()=>{ if (!GAME.running) return; GAME.paused=true; cancelAnimationFrame(rafId); });
btnResume.addEventListener('click', ()=>{ if (!GAME.running||!GAME.paused) return;
  GAME.paused=false; lastFrame=performance.now(); rafId=requestAnimationFrame(loop);
});
btnRestart.addEventListener('click', ()=>{ resetGame(); });
btnEnd.addEventListener('click', ()=>{ endConfirmModal.show(); });

btnNextLevel.addEventListener('click', ()=>{
  setupLevel(GAME.level); updateHUD(); GAME.running=true; GAME.paused=false;
  lastFrame=performance.now(); rafId=requestAnimationFrame(loop);
});
btnEndHere.addEventListener('click', ()=>{ endGame(false); });

btnCancelEnd.addEventListener('click', ()=>{/* solo cierra modal */});
btnConfirmEnd.addEventListener('click', ()=>{ endConfirmModal.hide(); endGame(false); });

btnPlayAgain.addEventListener('click', ()=>{ resetGame(); });

// Toast helper
function showLivesToast(){
  const n=GAME.lives;
  lifeToastBody.textContent = n<=0 ? 'Sin vidas.' : `¡Impacto! Te ${n===1?'queda':'quedan'} ${n} ${n===1?'vida':'vidas'}.`;
  lifeToast.show();
}

// Reset
function resetGame(){
  GAME.level=1; GAME.score=0; GAME.lives=3; GAME.perLevelStats=[]; GAME.entities.player=null;
  setupLevel(GAME.level); updateHUD();
}

// Estado inicial
resetGame();
