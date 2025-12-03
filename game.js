/* =========================================================
   CANVAS & DOM
========================================================= */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const completeUI = document.getElementById("levelCompleteScreen");
const btnNext = document.getElementById("btnNext");
const btnRetry = document.getElementById("btnRetry");
const btnMenu = document.getElementById("btnMenu");
const menuPanel = document.getElementById("menuPanel");
const btnEditor = document.getElementById("btnEditor");
const editorHelp = document.getElementById("editorHelp");

const W = canvas.width;
const H = canvas.height;

const GROUND_Y = 390;
const CEIL_Y = 110;
let tick = 0;

const parallaxLayers = [
  { speed: 0.15, color: "rgba(0, 200, 255, 0.22)", stars: [] },
  { speed: 0.35, color: "rgba(0, 170, 255, 0.34)", stars: [] },
  { speed: 0.6,  color: "rgba(0, 255, 170, 0.55)", stars: [] }
];
const particles = [];
let shakeTimer = 0;
let shakeIntensity = 0;

function initStars() {
  parallaxLayers.forEach(layer => {
    layer.stars = Array.from({ length: 45 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: Math.random() * 2 + 1
    }));
  });
}

initStars();

/* =========================================================
   GAME STATE
========================================================= */
let scene = "menu"; // "menu", "playing", "dead", "complete", "editor"
let currentLevel = 0;
let isCustomLevel = false;

const player = {
  x: W * 0.2,
  y: GROUND_Y - 20,
  size: 40,
  velY: 0,
  rotation: 0,
  onGround: true,
  isDead: false,
};

let gravityDir = 1;
let gravityVal = 0.7;
let baseSpeed = 6;
let currentSpeedMult = 1;
let cameraX = 0;
let attempts = 0;

let currentObjects = [];
let finishPortalX = 0;
let completeShown = false;

/* Approximate pixels per second = speed * 60 fps */
const PIXELS_PER_SECOND = 6 * 60;

/* =========================================================
   LEVEL DEFINITIONS
========================================================= */
const levels = [
  { id: 0, name: "Stereo Lite",  targetSeconds: 25 },
  { id: 1, name: "Harder Dash",  targetSeconds: 35 },
  { id: 2, name: "Insane Run",   targetSeconds: 40 },
];

/* =========================================================
   EDITOR STATE
========================================================= */
const editor = {
  objects: [],
  camX: 0,
  grid: 50,
  selectedType: "spike", // spike, pad, gravityPortal, speedPortal
  speedModeIndex: 0,
  speedModes: [0.8, 1.0, 1.4, 1.8]
};

/* =========================================================
   INPUT
========================================================= */
let jumpQueued = false;

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp"].includes(e.code)) {
    if (scene === "playing") {
      e.preventDefault();
      jumpQueued = true;
    }
  }

  if (e.code === "Escape") {
    if (scene === "playing" || scene === "dead" || scene === "complete") {
      goMenu();
    } else if (scene === "editor") {
      goMenu();
    }
  }

  if (scene === "editor") {
    if (e.key === "a" || e.key === "A") editor.camX -= 40;
    if (e.key === "d" || e.key === "D") editor.camX += 40;
    if (e.key === "1") editor.selectedType = "spike";
    if (e.key === "2") editor.selectedType = "pad";
    if (e.key === "3") editor.selectedType = "gravityPortal";
    if (e.key === "4") editor.selectedType = "speedPortal";
    if (e.key === "e" || e.key === "E") {
      startCustomLevel();
    }
  }
});

canvas.addEventListener("mousedown", (e) => {
  if (scene === "playing") {
    jumpQueued = true;
    return;
  }

  if (scene === "editor") {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;

    const worldX = editor.camX + mx;
    const snapped = Math.round(worldX / editor.grid) * editor.grid;

    if (e.button === 2) {
      deleteEditorObject(snapped);
    } else if (e.button === 0) {
      placeEditorObject(snapped);
    }
  }
});

canvas.addEventListener("contextmenu", (e) => {
  if (scene === "editor") e.preventDefault();
});

/* =========================================================
   MENU BUTTONS
========================================================= */
document.querySelectorAll(".levelBtn").forEach(btn => {
  btn.onclick = () => {
    const id = parseInt(btn.dataset.level);
    startLevel(id);
  };
});

btnEditor.onclick = () => {
  scene = "editor";
  menuPanel.style.display = "none";
  editorHelp.style.display = "block";
};

btnRetry.onclick = () => {
  if (isCustomLevel) {
    startCustomLevel();
  } else {
    startLevel(currentLevel);
  }
};

btnMenu.onclick = () => goMenu();

btnNext.onclick = () => {
  if (isCustomLevel) {
    goMenu();
  } else {
    const next = currentLevel + 1;
    if (next < levels.length) startLevel(next);
    else goMenu();
  }
};

/* =========================================================
   EDITOR FUNCTIONS
========================================================= */
function placeEditorObject(x) {
  const exists = editor.objects.find(o => Math.abs(o.x - x) < 10);
  if (exists) return;

  if (editor.selectedType === "spike") {
    editor.objects.push({ type: "spike", x, w: 50, h: 60 });
  } else if (editor.selectedType === "pad") {
    editor.objects.push({ type: "pad", x, w: 60, h: 18 });
  } else if (editor.selectedType === "gravityPortal") {
    editor.objects.push({ type: "gravityPortal", x, w: 40, h: 80 });
  } else if (editor.selectedType === "speedPortal") {
    editor.speedModeIndex = (editor.speedModeIndex + 1) % editor.speedModes.length;
    const mult = editor.speedModes[editor.speedModeIndex];
    editor.objects.push({ type: "speedPortal", x, w: 40, h: 80, speedMult: mult });
  }
}

function deleteEditorObject(x) {
  editor.objects = editor.objects.filter(o => Math.abs(o.x - x) >= 25);
}

function startCustomLevel() {
  if (editor.objects.length === 0) return;
  isCustomLevel = true;
  completeShown = false;
  completeUI.style.display = "none";
  editorHelp.style.display = "none";

  currentObjects = editor.objects.map(o => ({ ...o, triggered: false }));
  const maxX = Math.max(...currentObjects.map(o => o.x));
  finishPortalX = maxX + 250;

  gravityDir = 1;
  currentSpeedMult = 1;
  baseSpeed = 6;
  cameraX = 0;

  player.x = W * 0.2;
  player.y = GROUND_Y - player.size / 2;
  player.velY = 0;
  player.rotation = 0;
  player.onGround = true;
  particles.length = 0;

  scene = "playing";
}

/* =========================================================
   LEVEL HELPERS
========================================================= */
function addSpike(x) {
  currentObjects.push({ type: "spike", x, w: 50, h: 60 });
}
function addPad(x) {
  currentObjects.push({ type: "pad", x, w: 60, h: 18 });
}
function addGravityPortal(x) {
  currentObjects.push({ type: "gravityPortal", x, w: 40, h: 80 });
}
function addSpeedPortal(x, mult) {
  currentObjects.push({ type: "speedPortal", x, w: 40, h: 80, speedMult: mult });
}

function buildLevelPattern(targetSeconds, difficulty) {
  currentObjects = [];
  const targetDistance = PIXELS_PER_SECOND * targetSeconds;
  let x = 600;
  let lastPattern = -1;

  while (x < targetDistance - 400) {
    let pattern;
    do {
      pattern = Math.floor(Math.random() * 5);
    } while (pattern === lastPattern);
    lastPattern = pattern;

    const gapBase = difficulty === "easy" ? 260 : difficulty === "hard" ? 220 : 200;

    if (pattern === 0) {
      addSpike(x);
      x += gapBase + 40;
    } else if (pattern === 1) {
      addSpike(x);
      addSpike(x + 60);
      x += gapBase + 80;
    } else if (pattern === 2) {
      addPad(x - 60);
      addSpike(x + 40);
      x += gapBase + 80;
    } else if (pattern === 3) {
      if (difficulty !== "easy") {
        addSpike(x);
        addSpike(x + 55);
        addSpike(x + 110);
        x += gapBase + 80;
      } else {
        addSpike(x);
        x += gapBase + 100;
      }
    } else if (pattern === 4) {
      if (difficulty !== "easy") {
        addGravityPortal(x);
        x += 200;
        const mult = difficulty === "hard" ? 1.2 : 1.4;
        addSpeedPortal(x, mult);
        x += gapBase + 120;
      } else {
        x += gapBase + 120;
      }
    }
  }

  finishPortalX = targetDistance;
}

/* =========================================================
   LEVEL START / MENU
========================================================= */
function startLevel(id) {
  isCustomLevel = false;
  currentLevel = id;
  completeShown = false;
  completeUI.style.display = "none";
  menuPanel.style.display = "none";
  editorHelp.style.display = "none";

  const lvl = levels[id];
  let diff = "easy";
  if (id === 1) diff = "hard";
  if (id === 2) diff = "insane";

  buildLevelPattern(lvl.targetSeconds, diff);

  gravityDir = 1;
  currentSpeedMult = 1;
  baseSpeed = 6;
  cameraX = 0;

  player.x = W * 0.2;
  player.y = GROUND_Y - player.size / 2;
  player.velY = 0;
  player.rotation = 0;
  player.onGround = true;
  player.isDead = false;
  particles.length = 0;

  attempts++;
  scene = "playing";
}

function goMenu() {
  scene = "menu";
  menuPanel.style.display = "flex";
  completeUI.style.display = "none";
  editorHelp.style.display = "none";
  baseSpeed = 6;
}

/* =========================================================
   COLLISION & TRIGGERS
========================================================= */
function rectCollide(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function hitSpike() {
  const px = player.x - player.size / 2;
  const py = player.y - player.size / 2;

  for (const ob of currentObjects) {
    if (ob.type !== "spike") continue;
    const sx = ob.x - cameraX;
    const baseY = gravityDir === 1 ? GROUND_Y : CEIL_Y;

    const sw = ob.w * 0.7;
    const sh = ob.h * 0.8;
    const sxAdj = sx + (ob.w - sw) / 2;
    const syAdj = gravityDir === 1 ? baseY - sh : baseY;

    if (rectCollide(px, py, player.size, player.size, sxAdj, syAdj, sw, sh)) {
      return true;
    }
  }
  return false;
}

function triggerObjects() {
  const worldX = cameraX + player.x;
  for (const ob of currentObjects) {
    if (ob.triggered) continue;
    if (Math.abs(worldX - ob.x) < 30) {
      if (ob.type === "pad") {
        player.velY = -gravityDir * 16;
        player.onGround = false;
        ob.triggered = true;
        spawnBurst(ob.x, (gravityDir === 1 ? GROUND_Y : CEIL_Y), "#ffdd55", 8);
        addShake(3, 12);
      } else if (ob.type === "gravityPortal") {
        gravityDir *= -1;
        player.rotation += Math.PI;
        ob.triggered = true;
        spawnBurst(ob.x, (gravityDir === 1 ? GROUND_Y : CEIL_Y), "#00ffe0", 14);
        addShake(6, 14);
      } else if (ob.type === "speedPortal") {
        currentSpeedMult = ob.speedMult || 1;
        ob.triggered = true;
        spawnBurst(ob.x, (gravityDir === 1 ? GROUND_Y : CEIL_Y), "#ff9c2f", 12);
        addShake(4, 12);
      }
    }
  }
}

/* =========================================================
   FINISH PORTAL + SOUND
========================================================= */
const finishSound = new Audio(
  "data:audio/wav;base64,UklGRlYAAABXQVZFZm10IBAAAAABAAEAESsAABErAAABAAgAZGF0Yc0AAAAA////AP//AAD//wAA//8AAP//AAD//wAA"
);

function reachedFinish() {
  const portalScreenX = finishPortalX - cameraX;
  return portalScreenX < player.x + player.size / 2;
}

/* =========================================================
   DRAWING
========================================================= */
function addShake(intensity, duration) {
  shakeIntensity = intensity;
  shakeTimer = duration;
}

function getShakeOffset() {
  if (shakeTimer > 0) {
    shakeTimer -= 1;
    return {
      x: (Math.random() - 0.5) * shakeIntensity,
      y: (Math.random() - 0.5) * shakeIntensity
    };
  }
  return { x: 0, y: 0 };
}

function spawnParticle(opts) {
  particles.push({
    x: opts.x,
    y: opts.y,
    vx: opts.vx || (Math.random() - 0.5) * 2,
    vy: opts.vy || (Math.random() - 0.5) * 2,
    gravity: opts.gravity || 0.1,
    size: opts.size || 3,
    color: opts.color || "#fff",
    glow: opts.glow || opts.color || "#fff",
    life: opts.life || 24,
  });
}

function spawnBurst(x, y, color, count = 14) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 2.4 + 0.6;
    spawnParticle({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0,
      size: Math.random() * 3 + 2,
      color,
      glow: color,
      life: 20 + Math.random() * 12,
    });
  }
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#0b3d75");
  g.addColorStop(1, "#010a17");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  parallaxLayers.forEach(layer => {
    ctx.fillStyle = layer.color;
    const offset = (cameraX * layer.speed) % W;
    layer.stars.forEach(star => {
      const x = (star.x - offset + W) % W;
      ctx.beginPath();
      ctx.arc(x, star.y, star.size, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.save();
  ctx.fillStyle = "rgba(0, 255, 204, 0.08)";
  ctx.fillRect(0, GROUND_Y - 120, W, 140);
  ctx.restore();
}

function drawGround() {
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const grad = ctx.createLinearGradient(0, gy, 0, gy + 140 * gravityDir);
  grad.addColorStop(0, "#012f52");
  grad.addColorStop(1, "#001320");
  ctx.fillStyle = grad;
  if (gravityDir === 1) ctx.fillRect(0, gy, W, H - gy);
  else ctx.fillRect(0, 0, W, gy);

  const size = 50;
  let off = -(cameraX % size);
  for (let x = off - size; x < W + size; x += size) {
    ctx.fillStyle = "#0a4a7d";
    const top = gravityDir === 1 ? gy - 20 : gy - 0;
    ctx.fillRect(x + 4, top, size - 8, 18 * gravityDir);

    ctx.fillStyle = "rgba(0,255,204,0.18)";
    ctx.fillRect(x + size * 0.25, top - 6 * gravityDir, size * 0.5, 6 * gravityDir);
  }
}

function drawSpike(ob) {
  const screenX = ob.x - cameraX;
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;

  ctx.save();
  const pulse = 0.7 + Math.sin(tick * 0.2) * 0.15;
  const grad = ctx.createLinearGradient(screenX, gy, screenX, gy - ob.h * gravityDir);
  grad.addColorStop(0, "#ff2a6f");
  grad.addColorStop(1, "#ff7fab");
  ctx.fillStyle = grad;
  ctx.strokeStyle = `rgba(255, 200, 230, ${0.6 + pulse * 0.2})`;
  ctx.lineWidth = 3;

  ctx.beginPath();
  if (gravityDir === 1) {
    ctx.moveTo(screenX, gy);
    ctx.lineTo(screenX + ob.w / 2, gy - ob.h);
    ctx.lineTo(screenX + ob.w, gy);
  } else {
    ctx.moveTo(screenX, gy);
    ctx.lineTo(screenX + ob.w / 2, gy + ob.h);
    ctx.lineTo(screenX + ob.w, gy);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.shadowColor = "#ff0077";
  ctx.shadowBlur = 12;
  ctx.stroke();
  ctx.restore();
}

function drawPad(ob) {
  const screenX = ob.x - cameraX;
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const y = gravityDir === 1 ? gy - ob.h : gy;

  ctx.save();
  const grad = ctx.createLinearGradient(screenX, y, screenX, y + ob.h * gravityDir);
  grad.addColorStop(0, "#ffe066");
  grad.addColorStop(1, "#ffb400");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#ffe9a6";
  ctx.lineWidth = 3;
  ctx.fillRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);
  ctx.shadowColor = "#ffdd55";
  ctx.shadowBlur = 16;
  ctx.strokeRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);
  ctx.restore();
}

function drawGravityPortal(ob) {
  const screenX = ob.x - cameraX;
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const y = gy - ob.h * (gravityDir === 1 ? 1 : 0);

  ctx.save();
  const pulse = 0.5 + Math.sin(tick * 0.18) * 0.15;
  const grad = ctx.createLinearGradient(screenX, y, screenX, y + ob.h * gravityDir);
  grad.addColorStop(0, "rgba(0, 255, 204, 0.7)");
  grad.addColorStop(1, "rgba(0, 180, 255, 0.4)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#00ffe0";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#00ffe0";
  ctx.shadowBlur = 16;
  ctx.fillRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);
  ctx.strokeRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);

  ctx.globalAlpha = 0.35 + pulse * 0.3;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(screenX, y + (ob.h / 2) * gravityDir, ob.w * 0.9, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawSpeedPortal(ob) {
  const screenX = ob.x - cameraX;
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const y = gy - ob.h * (gravityDir === 1 ? 1 : 0);

  ctx.save();
  const pulse = 0.65 + Math.sin(tick * 0.25) * 0.25;
  const grad = ctx.createLinearGradient(screenX, y, screenX, y + ob.h * gravityDir);
  grad.addColorStop(0, "rgba(255,180,64,0.7)");
  grad.addColorStop(1, "rgba(255,120,0,0.5)");
  ctx.fillStyle = grad;
  ctx.strokeStyle = "#ff9c2f";
  ctx.lineWidth = 3;
  ctx.shadowColor = "#ffb347";
  ctx.shadowBlur = 14;
  ctx.fillRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);
  ctx.strokeRect(screenX - ob.w / 2, y, ob.w, ob.h * gravityDir);

  ctx.globalAlpha = 0.45 + pulse * 0.3;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(screenX - ob.w / 2, y + ob.h * 0.25 * gravityDir);
  ctx.lineTo(screenX + ob.w / 2, y + ob.h * 0.75 * gravityDir);
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.font = "bold 13px system-ui";
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.fillText((ob.speedMult || 1) + "x", screenX, y + (ob.h / 2) * gravityDir + 4);
  ctx.restore();
}

function drawFinishPortal() {
  const screenX = finishPortalX - cameraX;
  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const w = 50, h = 130;
  const y = gy - (gravityDir === 1 ? h : 0);

  ctx.save();
  const pulse = 0.8 + Math.sin(tick * 0.15) * 0.25;
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#4dff9c";
  ctx.shadowColor = "#0f7";
  ctx.shadowBlur = 24;
  ctx.strokeRect(screenX - w / 2, y, w, h * gravityDir);

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.5 + pulse * 0.2;
  ctx.fillStyle = "#00ff66";
  for (let i = -12; i <= 12; i += 6) {
    ctx.fillRect(screenX + i - 2, y + 6, 4, h - 12);
  }

  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.arc(screenX, y + (h / 2) * gravityDir, w * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer() {
  const s = player.size;
  const half = s / 2;
  const speedPulse = Math.min(1.4, 0.8 + (currentSpeedMult - 1) * 0.5);
  const glow = currentSpeedMult > 1 ? "#4dd2ff" : "#ffd800";

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.rotation);

  const grad = ctx.createLinearGradient(-half, -half, half, half);
  grad.addColorStop(0, "#fff175");
  grad.addColorStop(1, "#ffc400");
  ctx.fillStyle = grad;
  ctx.shadowColor = glow;
  ctx.shadowBlur = 16 * speedPulse;
  ctx.fillRect(-half, -half, s, s);

  ctx.lineWidth = 4;
  ctx.strokeStyle = "#001322";
  ctx.strokeRect(-half, -half, s, s);

  ctx.fillStyle = "#001322";
  ctx.fillRect(-half + 8, -half + 10, 9, 9);
  ctx.fillRect(half - 17, -half + 10, 9, 9);
  ctx.fillStyle = "#0af";
  ctx.fillRect(-half + 8, -half + 10, 6, 6);
  ctx.fillRect(half - 17, -half + 10, 6, 6);

  ctx.fillStyle = "#001322";
  ctx.fillRect(-half + 10, half - 16, s - 20, 6);
  ctx.restore();
}

function drawObjects() {
  for (const ob of currentObjects) {
    const screenX = ob.x - cameraX;
    if (screenX < -200 || screenX > W + 200) continue;

    if (ob.type === "spike") drawSpike(ob);
    else if (ob.type === "pad") drawPad(ob);
    else if (ob.type === "gravityPortal") drawGravityPortal(ob);
    else if (ob.type === "speedPortal") drawSpeedPortal(ob);
  }
}

function updateAndDrawParticles() {
  ctx.save();
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= 1;
    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;

    ctx.globalAlpha = Math.max(0, p.life / 26);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(p.x - cameraX + (Math.random() - 0.5) * 1.2, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawEditor() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#14386f");
  g.addColorStop(1, "#020b1a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const gy = GROUND_Y;
  ctx.fillStyle = "#002b55";
  ctx.fillRect(0, gy, W, H - gy);

  const gs = editor.grid;
  const offset = -(editor.camX % gs);
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  for (let x = offset; x < W; x += gs) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.restore();

  for (const ob of editor.objects) {
    const screenX = ob.x - editor.camX;
    if (screenX < -100 || screenX > W + 100) continue;

    if (ob.type === "spike") {
      ctx.save();
      ctx.fillStyle = "#ff2a6f";
      ctx.strokeStyle = "#ffb3d1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screenX, gy);
      ctx.lineTo(screenX + ob.w / 2, gy - ob.h);
      ctx.lineTo(screenX + ob.w, gy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    } else if (ob.type === "pad") {
      ctx.save();
      const grad = ctx.createLinearGradient(screenX, gy - ob.h, screenX, gy);
      grad.addColorStop(0, "#ffe066");
      grad.addColorStop(1, "#ffb400");
      ctx.fillStyle = grad;
      ctx.strokeStyle = "#ffe9a6";
      ctx.lineWidth = 2;
      ctx.fillRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.strokeRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.restore();
    } else if (ob.type === "gravityPortal") {
      ctx.save();
      ctx.fillStyle = "rgba(0,255,204,0.25)";
      ctx.strokeStyle = "#00ffcc";
      ctx.lineWidth = 3;
      ctx.fillRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.strokeRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.restore();
    } else if (ob.type === "speedPortal") {
      ctx.save();
      ctx.fillStyle = "rgba(255,136,0,0.3)";
      ctx.strokeStyle = "#ff8800";
      ctx.lineWidth = 3;
      ctx.fillRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.strokeRect(screenX - ob.w / 2, gy - ob.h, ob.w, ob.h);
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      ctx.fillText((ob.speedMult || 1) + "x", screenX, gy - ob.h / 2);
      ctx.restore();
    }
  }

  ctx.fillStyle = "white";
  ctx.font = "13px system-ui";
  ctx.fillText(
    `EDITOR | Objects: ${editor.objects.length} | Selected: ${editor.selectedType}`,
    10, 18
  );
}

/* =========================================================
   GAME LOOP
========================================================= */
function snapRotation() {
  const q = Math.PI / 2;
  player.rotation = Math.round(player.rotation / q) * q;
}

function die() {
  player.isDead = true;
  scene = "dead";
  spawnBurst(player.x + cameraX, player.y, "#ff2a6f", 22);
  addShake(8, 16);
  setTimeout(() => {
    if (isCustomLevel) startCustomLevel();
    else startLevel(currentLevel);
  }, 500);
}

function levelComplete() {
  if (completeShown) return;
  completeShown = true;
  scene = "complete";
  baseSpeed = 0;
  currentSpeedMult = 0;
  player.velY = 0;
  finishSound.play();
  spawnBurst(player.x + cameraX, player.y, "#00ff99", 28);
  addShake(10, 18);
  setTimeout(() => {
    completeUI.style.display = "flex";
  }, 250);
}

function update() {
  tick++;
  if (scene === "menu") {
    const shake = getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawBackground();
    drawGround();
    updateAndDrawParticles();
    drawObjects();
    drawFinishPortal();
    drawPlayer();
    ctx.restore();
    requestAnimationFrame(update);
    return;
  }

  if (scene === "editor") {
    drawEditor();
    requestAnimationFrame(update);
    return;
  }

  if (scene === "dead" || scene === "complete") {
    const shake = getShakeOffset();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    drawBackground();
    drawGround();
    updateAndDrawParticles();
    drawObjects();
    drawFinishPortal();
    drawPlayer();
    ctx.restore();
    requestAnimationFrame(update);
    return;
  }

  cameraX += baseSpeed * currentSpeedMult;

  const wasOnGround = player.onGround;

  if (jumpQueued && player.onGround) {
    player.velY = -gravityDir * 13;
    player.onGround = false;
    spawnParticle({ x: player.x + cameraX, y: player.y + gravityDir * 14, vy: gravityDir * 0.4, size: 6, color: "#7be3ff", glow: "#7be3ff", life: 18 });
  }
  jumpQueued = false;

  player.velY += gravityVal * gravityDir;
  player.y += player.velY;

  const gy = gravityDir === 1 ? GROUND_Y : CEIL_Y;
  const half = player.size / 2;

  if (gravityDir === 1) {
    if (player.y + half >= gy) {
      player.y = gy - half;
      player.velY = 0;
      if (!player.onGround) snapRotation();
      player.onGround = true;
      if (!wasOnGround) {
        spawnBurst(player.x + cameraX, gy, "#00ffc6", 10);
        addShake(6, 10);
      }
    } else {
      player.onGround = false;
    }
  } else {
    if (player.y - half <= gy) {
      player.y = gy + half;
      player.velY = 0;
      if (!player.onGround) snapRotation();
      player.onGround = true;
      if (!wasOnGround) {
        spawnBurst(player.x + cameraX, gy, "#00ffc6", 10);
        addShake(6, 10);
      }
    } else {
      player.onGround = false;
    }
  }

  if (!player.onGround) {
    player.rotation += 0.22 * gravityDir;
  }

  triggerObjects();

  if (hitSpike()) {
    die();
  } else if (reachedFinish()) {
    levelComplete();
  }

  const shake = getShakeOffset();
  ctx.save();
  ctx.translate(shake.x, shake.y);
  drawBackground();
  drawGround();
  updateAndDrawParticles();
  drawObjects();
  drawFinishPortal();
  drawPlayer();
  ctx.restore();

  requestAnimationFrame(update);
}

/* =========================================================
   START
========================================================= */
drawBackground();
drawGround();
drawObjects();
drawFinishPortal();
drawPlayer();
requestAnimationFrame(update);