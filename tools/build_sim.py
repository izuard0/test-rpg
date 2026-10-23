"""Membangun prototype/karakter/index.html dengan atlas tertanam (bisa dibuka langsung dari file)."""
import base64
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "prototype" / "karakter"
atlas_b64 = base64.b64encode((OUT / "atlas.png").read_bytes()).decode()
meta = (OUT / "atlas.json").read_text()
head_adj = (ROOT / "tools" / "head_adjust.json").read_text(encoding="utf-8")

HTML = r"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Simulasi Karakter</title>
<style>
:root{--dark:#1B2A41;--dark2:#24364F;--light:#F7F5F0;--line:#D9D4C7;--orange:#E8833A;--muted:#4F5D6E;--bg:#EDEAE2}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--dark);min-height:100vh;display:grid;grid-template-columns:1fr 360px}
#world{position:relative;background:#0E1522;display:flex;align-items:center;justify-content:center;overflow:hidden;height:100vh}
canvas{image-rendering:pixelated;image-rendering:crisp-edges}
#game{display:block}
#hint{position:absolute;left:16px;top:12px;color:#C9D3E0;font-size:14px;background:rgba(14,21,34,.7);padding:8px 12px;border-radius:8px}
#pad{position:absolute;right:20px;bottom:20px;display:grid;grid-template-columns:repeat(3,56px);grid-template-rows:repeat(3,56px);gap:4px}
#pad button{border:0;border-radius:12px;background:rgba(247,245,240,.18);color:#fff;font-size:22px;touch-action:none}
#pad button:active{background:rgba(232,131,58,.6)}
aside{background:var(--light);padding:18px 18px 28px;overflow-y:auto;max-height:100vh;border-left:2px solid var(--line)}
h1{font-size:20px;margin-bottom:4px}
.sub{font-size:13px;color:var(--muted);margin-bottom:14px}
h2{font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#B4501A;margin:16px 0 8px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.opt{border:2px solid var(--line);background:#fff;border-radius:10px;padding:4px 2px 6px;font-size:11px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:2px;color:var(--dark)}
.opt.on{border-color:var(--orange);background:#FFF4EA}
.opt canvas{width:52px;height:52px}
.sw{display:flex;flex-wrap:wrap;gap:8px}
.sw button{width:34px;height:34px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 2px var(--line);cursor:pointer}
.sw button.on{box-shadow:0 0 0 3px var(--orange)}
#dirs{display:flex;gap:6px;background:#fff;border:2px solid var(--line);border-radius:12px;padding:8px;justify-content:space-around}
#dirs canvas{width:64px;height:112px}
.row{display:flex;gap:8px;align-items:center;font-size:13px}
.accrow{display:grid;grid-template-columns:72px 1fr;align-items:center;gap:8px;margin-bottom:6px;font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chips button{border:2px solid var(--line);background:#fff;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer;color:var(--dark)}
.chips button.on{border-color:var(--orange);background:#FFF4EA}
.zbtn{width:36px;height:32px;border:2px solid var(--line);background:#fff;border-radius:8px;font-size:18px;cursor:pointer}
#tuner{margin-top:6px}
.tunewrap{display:flex;gap:14px;align-items:center;margin-top:8px}
#tuneView{width:144px;height:216px;background:#fff;border:2px solid var(--line);border-radius:12px}
.tunepad{display:grid;grid-template-columns:repeat(3,40px);grid-template-rows:repeat(3,40px);gap:4px}
.tunepad button{border:2px solid var(--line);background:#fff;border-radius:10px;font-size:16px;cursor:pointer}
.tunepad button:active{background:#FFF4EA;border-color:var(--orange)}
.note{font-size:12px;color:var(--muted);line-height:1.5;margin-top:14px}
@media (max-width:820px){body{grid-template-columns:1fr}#world{height:60vh}aside{max-height:none;border-left:0;border-top:2px solid var(--line)}}
</style>
</head>
<body>
<div id="world">
  <canvas id="game"></canvas>
  <div id="hint">← ↑ → ↓ / WASD lari · tahan Shift jalan pelan · − / + zoom</div>
  <div id="pad">
    <span></span><button data-d="up">▲</button><span></span>
    <button data-d="left">◀</button><span></span><button data-d="right">▶</button>
    <span></span><button data-d="down">▼</button><span></span>
  </div>
</div>
<aside>
  <h1>Simulasi Karakter</h1>
  <p class="sub">Prototipe kreator karakter · tanpa leher</p>
  <div id="dirs"></div>
  <div id="tuner">
    <h2>Setel posisi kepala</h2>
    <div class="chips" id="tuneDir"><button data-d="down">Depan</button><button data-d="left">Kiri</button><button data-d="right">Kanan</button><button data-d="up">Belakang</button></div>
    <div class="tunewrap"><canvas id="tuneView" width="48" height="72"></canvas>
      <div class="tunepad"><span></span><button data-n="0,-1">▲</button><span></span><button data-n="-1,0">◀</button><button data-n="reset" title="Kembalikan">↺</button><button data-n="1,0">▶</button><span></span><button data-n="0,1">▼</button><span></span></div>
    </div>
    <div class="row" style="margin-top:8px">Ukuran kepala: <button class="zbtn" id="scDown">−</button><b id="scVal">100%</b><button class="zbtn" id="scUp">+</button></div>
    <p class="note" id="tuneVal" style="margin-top:6px"></p>
    <details style="margin-top:4px;font-size:12px"><summary>Semua setelan (untuk disimpan Claude)</summary><pre id="adjOut" style="white-space:pre-wrap;font-size:11px;background:#fff;border:1px solid var(--line);border-radius:8px;padding:8px;margin-top:4px"></pre></details>
  </div>
  <h2>Jenis kelamin</h2>
  <div class="chips" id="gender"><button data-g="L">Laki-laki</button><button data-g="P">Perempuan</button></div>
  <h2>Baju</h2>
  <div class="grid" id="sets"></div>
  <p class="note" id="setNote" style="display:none;margin-top:6px">Untuk kepala berhijab, baju yang tersedia sementara Hoodie dan Flanel.</p>
  <h2>Kepala</h2>
  <div class="grid" id="heads"></div>
  <h2>Aksesori</h2>
  <div class="accrow"><span>Kacamata</span><div class="chips" data-slot="glasses" data-opts="acc_glasses_round,acc_glasses_square"></div></div>
  <div class="accrow"><span>Kepala</span><div class="chips" data-slot="headgear" data-opts="acc_headset,acc_vr_headset"></div></div>
  <div class="accrow"><span>Tas</span><div class="chips" data-slot="bag" data-opts="acc_backpack,acc_laptop_bag"></div></div>
  <div id="headColorBox"><h2 id="headColorTitle">Warna rambut</h2>
  <div class="sw" id="hairSw"></div></div>
  <h2>Warna atasan</h2>
  <div class="sw" id="topSw"></div>
  <h2>Warna kulit</h2>
  <div class="sw" id="skinSw"></div>
  <h2>Tampilan</h2>
  <div class="row">Zoom kamera: <button class="zbtn" data-z="-1">−</button><b id="zoomVal">1×</b><button class="zbtn" data-z="1">+</button></div>
  <div class="row" style="margin-top:8px"><label><input type="checkbox" id="grid"> Tampilkan grid petak 32×32</label></div>
  <p class="note">Badan perempuan dibuat lebih ramping dari badan laki-laki lewat kode. Pilihan kepala, baju, dan palet warna menyesuaikan jenis kelamin.</p>
</aside>
<script>
const META = __META__;
const HEAD_ADJ = __HEADADJ__;   // tools/head_adjust.json
const ATLAS = "data:image/png;base64,__ATLAS__";
const HEAD_LABEL = {hair_short_01:"Pendek rapi",hair_short_02:"Pendek acak",hair_buzz:"Cepak",hair_curly:"Keriting",hair_undercut:"Undercut",
  hair_medium:"Sebahu",hair_long:"Panjang",hair_ponytail:"Kuncir",hair_bun:"Cepol",hair_wavy:"Bergelombang",
  hijab_simple:"Hijab",hijab_long:"Hijab panjang",hijab_sport:"Hijab sport",peci:"Peci",cap_baseball:"Topi",beanie:"Beanie"};
// konfigurasi per jenis kelamin: kepala, baju, dan palet warna
const GENDER = {
  L: {label: "Laki-laki", btype: "a",
      heads: ["hair_short_01","hair_short_02","hair_buzz","hair_curly","hair_undercut","hair_medium","hair_wavy","peci","cap_baseball","beanie"],
      sets: ["hoodie","flannel","kaos","kemeja","batik","almamater","labcoat"],
      hair: ["#2B2B33","#3B2A20","#5A3A24","#7A5232","#A7A9AE"],
      top: [null,"#1B2A41","#2F6FB0","#2B2B2B","#4B5A3A","#7A2E3A","#E8833A","#E8DCC4"],
      def: {head: "hair_short_01", set: "hoodie", top: "#1B2A41", hair: "#2B2B33"}},
  P: {label: "Perempuan", btype: "b",
      heads: ["hijab_simple","hair_long",   // hijab panjang & sport dinonaktifkan sementara
             "hair_medium","hair_ponytail","hair_bun","hair_wavy","hair_short_01","beanie","cap_baseball"],
      sets: ["tunik","kemeja","kaos","hoodie","flannel","batik","almamater","labcoat"],
      hair: ["#2B2B33","#3B2A20","#5A3A24","#7A5232","#C9A35A","#8E3B3B"],
      top: [null,"#D9A5A0","#B9A7D6","#E8DCC4","#A9B89A","#1B2A41","#7A2E3A","#D9A441"],
      def: {head: "hijab_simple", set: "hoodie", top: "#E8DCC4", hair: "#3B2A20", hijab: "#A9B89A"}},
};
// baju yang cocok untuk kepala berhijab (sementara: hoodie & flanel)
const HIJAB_SETS = ["hoodie","flannel"];
const HIJAB = ["#2B2B33","#1B2A41","#E8DCC4","#A7A9AE","#7A2E3A","#A9B89A","#D9A5A0","#9C7A5B"];
const CAPS = ["#2B2B33","#1B2A41","#2F6FB0","#7A2E3A","#E8833A","#E3E6EC"];
const headCat = k => k.startsWith("hijab") ? "hijab" : (k === "cap_baseball" || k === "beanie") ? "topi" : k === "peci" ? "peci" : "rambut";
const HEAD_COLORS = {rambut: {title: "Warna rambut", key: "hairColor"}, hijab: {title: "Warna hijab", key: "hijabColor", pal: HIJAB},
                     topi: {title: "Warna topi", key: "capColor", pal: CAPS}};
const SKIN = [[247,214,186],[234,186,148],[205,150,110],[160,108,72],[110,70,46]];
const DIRS = ["down","left","right","up"];
const st = {gender:"L", set:"hoodie", glasses:null, headgear:null, bag:null, head:"hair_short_01", hairColor:"#2B2B33", hijabColor:"#2B2B33", capColor:"#1B2A41", topColor:"#1B2A41", skin:1, x:0, y:0, dir:"down", moving:false, t:0, grid:false};
const keys = new Set();

const img = new Image();
img.onload = start; img.src = ATLAS;

/* ---------- sprite extraction + recolor (cached) ---------- */
const raw = {};
function sprite(key){
  if (raw[key]) return raw[key];
  const f = META.frames[key], c = document.createElement("canvas");
  c.width = f.w; c.height = f.h;
  const x = c.getContext("2d"); x.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  return raw[key] = c;
}
const cache = {};
const hex = h => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
const lum = (r,g,b) => 0.299*r + 0.587*g + 0.114*b;
function isSkin(r,g,b){ return r > g + 18 && g > b + 5 && r > 150; }
const SKIN_REF = lum(234,186,148);
function recolor(key, tint, tintBelow, skinIdx){
  const id = key + "|" + tint + "|" + tintBelow + "|" + skinIdx;
  if (cache[id]) return cache[id];
  const src = sprite(key), c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const x = c.getContext("2d"); x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  const T = tint ? hex(tint) : null, S = SKIN[skinIdx];
  for (let i = 0; i < p.length; i += 4){
    if (!p[i+3]) continue;
    const r = p[i], g = p[i+1], b = p[i+2], y = (i/4) / c.width | 0;
    const L = lum(r,g,b), sat = Math.max(r,g,b) - Math.min(r,g,b);
    if (isSkin(r,g,b)){
      const k = L / SKIN_REF;
      p[i] = Math.min(255, S[0]*k); p[i+1] = Math.min(255, S[1]*k); p[i+2] = Math.min(255, S[2]*k);
    } else if (T && sat < 30 && L > 95 && y < tintBelow){
      const k = L / 185;
      p[i] = Math.min(255, T[0]*k + (k > 1.12 ? 30 : 0));
      p[i+1] = Math.min(255, T[1]*k + (k > 1.12 ? 30 : 0));
      p[i+2] = Math.min(255, T[2]*k + (k > 1.12 ? 30 : 0));
    }
  }
  x.putImageData(d, 0, 0);
  return cache[id] = c;
}

/* ---------- character drawing ---------- */
const SEQ = [0, 1, 2, 1];
function drawChar(ctx, cx, footY, dir, frame, headKey){
  const setKey = GENDER[st.gender].btype === "b" ? st.set + "_b" : st.set;
  const bm = META.sets[setKey][dir][frame];
  const body = recolor(bm.key, st.topColor, bm.tintBelow, st.skin);
  const sc = (((HEAD_ADJ[st.gender] || {})[headKey] || {}).scale) || 100;
  const hm = sc === 100 ? META.heads[headKey][dir] : META.headScale[sc][headKey][dir];
  const hc = HEAD_COLORS[headCat(headKey)];
  const head = recolor(hm.key, hc ? st[hc.key] : null, 999, st.skin);
  const bx = Math.round(cx - body.width / 2), by = footY - body.height;
  // bayangan
  ctx.fillStyle = "rgba(20,25,40,.28)";
  ctx.beginPath(); ctx.ellipse(cx, footY - 1, 10, 3, 0, 0, Math.PI*2); ctx.fill();
  ctx.drawImage(body, bx, by);
  // tas: posisinya relatif terhadap titik kerah badan
  const bg = st.bag && META.bags[st.bag][dir];
  if (bg) ctx.drawImage(sprite(bg.key), Math.round(bx + bm.neckX + bg.ax), by + bm.attachY + bg.ay);
  // tanpa leher: dagu langsung menempel di kerah
  const adj = ((HEAD_ADJ[st.gender] || {})[headKey] || {})[dir] || {};
  const hx = Math.round(bx + bm.neckX - hm.neckX) + (adj.dx || 0), hy = by + bm.attachY + META.overlap - hm.neckY + (adj.dy || 0);
  ctx.drawImage(head, hx, hy);
  // aksesori kepala: posisinya relatif terhadap dagu
  const chinX = hx + hm.neckX, chinY = hy + hm.neckY;
  [st.glasses, st.headgear].forEach(k => {
    const a = k && (sc === 100 ? META.acc[k][dir] : META.accScale[sc][k][dir]);
    if (a) ctx.drawImage(sprite(a.key), Math.round(chinX + a.ax), chinY + a.ay);
  });
}

/* ---------- world & camera ---------- */
const T = 32, COLS = 40, ROWS = 28, WW = COLS*T, WH = ROWS*T;   // seluas lobi
const game = document.getElementById("game"), g = game.getContext("2d");
let VW = 480, VH = 270, ZOOM = 1;
const cam = {x: 0, y: 0};
function fit(){
  const w = document.getElementById("world");
  VW = Math.min(WW, Math.ceil(w.clientWidth / ZOOM)); VH = Math.min(WH, Math.ceil(w.clientHeight / ZOOM));
  game.width = VW; game.height = VH;
  game.style.width = VW*ZOOM + "px"; game.style.height = VH*ZOOM + "px";
  g.imageSmoothingEnabled = false;
}
function setZoom(z){ ZOOM = Math.max(1, Math.min(4, z)); fit(); document.getElementById("zoomVal").textContent = ZOOM + "×"; }
addEventListener("resize", fit);

// dekorasi sederhana (perabot sementara, nanti diganti tileset asli)
const PROPS = [];
for (let i = 0; i < 6; i++) PROPS.push({x: 4*T + i*6*T, y: 1*T, w: 2*T, h: T, c: "#3FC1C9", k: "layar"});
[[6,8],[14,8],[24,8],[32,8],[6,18],[14,18],[24,18],[32,18]].forEach(([cx,cy]) => PROPS.push({x: cx*T, y: cy*T, w: 3*T, h: 2*T, c: "#24364F", k: "sofa"}));
[[2,4],[37,4],[2,24],[37,24],[19,13],[20,13]].forEach(([cx,cy]) => PROPS.push({x: cx*T+6, y: cy*T+4, w: 20, h: 24, c: "#3E9C7A", k: "tanaman"}));

function drawWorld(){
  const tx0 = Math.floor(cam.x / T), ty0 = Math.floor(cam.y / T);
  const tx1 = Math.ceil((cam.x + VW) / T), ty1 = Math.ceil((cam.y + VH) / T);
  g.fillStyle = "#0E1522"; g.fillRect(0, 0, VW, VH);
  for (let ty = ty0; ty < ty1; ty++) for (let tx = tx0; tx < tx1; tx++){
    const sx = tx*T - Math.round(cam.x), sy = ty*T - Math.round(cam.y);
    if (ty < 2){                         // dinding
      g.fillStyle = "#F7F5F0"; g.fillRect(sx, sy, T, T);
      if (ty === 1){ g.fillStyle = "#1B2A41"; g.fillRect(sx, sy + 24, T, 8); }
      continue;
    }
    const alt = (tx + ty) % 2;
    g.fillStyle = alt ? "#A8794F" : "#9C6B43"; g.fillRect(sx, sy, T, T);
    g.fillStyle = "rgba(0,0,0,.08)";
    for (let k = 0; k < 4; k++) g.fillRect(sx, sy + k*8, T, 1);
    g.fillRect(sx + (alt ? 12 : 22), sy, 1, T);
    if (tx === 0 || tx === COLS-1 || ty === ROWS-1){ g.fillStyle = "#1B2A41"; g.fillRect(sx, sy, T, T); }
  }
  PROPS.forEach(p => {
    const sx = p.x - Math.round(cam.x), sy = p.y - Math.round(cam.y);
    if (sx > VW || sy > VH || sx + p.w < 0 || sy + p.h < 0) return;
    g.fillStyle = "rgba(20,25,40,.25)"; g.fillRect(sx + 2, sy + p.h - 3, p.w, 4);
    g.fillStyle = p.c; g.fillRect(sx, sy, p.w, p.h);
    g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(sx, sy, p.w, 3);
  });
  if (st.grid){
    g.strokeStyle = "rgba(232,131,58,.55)"; g.lineWidth = 1;
    for (let tx = tx0; tx <= tx1; tx++){ const x = tx*T - Math.round(cam.x) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, VH); g.stroke(); }
    for (let ty = ty0; ty <= ty1; ty++){ const y = ty*T - Math.round(cam.y) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(VW, y); g.stroke(); }
  }
}
function updateCamera(dt, snap){
  const tx = Math.max(0, Math.min(WW - VW, st.x - VW/2)), ty = Math.max(0, Math.min(WH - VH, st.y - 24 - VH/2));
  const k = snap ? 1 : 1 - Math.exp(-dt * 8);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
}

/* ---------- input ---------- */
const KEYMAP = {ArrowUp:"up",KeyW:"up",ArrowDown:"down",KeyS:"down",ArrowLeft:"left",KeyA:"left",ArrowRight:"right",KeyD:"right"};
addEventListener("keydown", e => { if (KEYMAP[e.code]){ keys.add(KEYMAP[e.code]); e.preventDefault(); } if (e.key === "Shift") st.walk = true; });
addEventListener("keyup", e => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); if (e.key === "Shift") st.walk = false; });
document.querySelectorAll("#pad button").forEach(b => {
  const d = b.dataset.d;
  b.addEventListener("pointerdown", e => { keys.add(d); b.setPointerCapture(e.pointerId); });
  ["pointerup","pointercancel","pointerleave"].forEach(ev => b.addEventListener(ev, () => keys.delete(d)));
});

/* ---------- loop ---------- */
let last = 0;
function tick(now){
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
  let vx = 0, vy = 0;
  if (keys.has("left")) vx -= 1; if (keys.has("right")) vx += 1;
  if (keys.has("up")) vy -= 1; if (keys.has("down")) vy += 1;
  st.moving = vx || vy;
  if (st.moving){
    if (vx && vy){ vx *= Math.SQRT1_2; vy *= Math.SQRT1_2; }
    st.dir = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? "left" : "right") : (vy < 0 ? "up" : "down");
    const sp = st.walk ? 80 : 150;   // bawaan: lari
    st.x = Math.max(T + 12, Math.min(WW - T - 12, st.x + vx * sp * dt));
    st.y = Math.max(2*T + 8, Math.min(WH - T - 2, st.y + vy * sp * dt));
    st.t += dt * (st.walk ? 1 : 1.7);
  } else st.t = 0;
  updateCamera(dt);
  drawWorld();
  const frame = st.moving ? SEQ[Math.floor(st.t * 8) % 4] : 1;
  drawChar(g, Math.round(st.x - cam.x), Math.round(st.y - cam.y), st.dir, frame, st.head);
  requestAnimationFrame(tick);
}

/* ---------- side panel ---------- */
function thumb(c, headKey, dir, frame, scale){
  const x = c.getContext("2d"); x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, c.width, c.height);
  x.save(); x.scale(scale, scale);
  drawChar(x, c.width / scale / 2, c.height / scale - 2, dir, frame, headKey);
  x.restore();
}
function availSets(){
  const list = GENDER[st.gender].sets.filter(k => META.sets[k]);
  return headCat(st.head) === "hijab" ? list.filter(k => HIJAB_SETS.includes(k)) : list;
}
function enforceSet(){ const a = availSets(); if (!a.includes(st.set)) st.set = a[0]; }
function availHeads(){ return GENDER[st.gender].heads.filter(k => META.heads[k]); }
function swatches(id, arr, key, nullLabel){
  const el = document.getElementById(id); el.innerHTML = "";
  arr.forEach(v => {
    const b = document.createElement("button");
    b.style.background = v || "linear-gradient(135deg,#eee,#aaa)"; b.title = v || nullLabel || "warna asli";
    b.dataset.v = v || ""; b.onclick = () => { st[key] = v; refreshPanel(); }; el.append(b);
  });
}
function buildLists(){
  buildSets();
  const hs = document.getElementById("heads"); hs.innerHTML = "";
  availHeads().forEach(k => {
    const b = document.createElement("button"); b.className = "opt"; b.dataset.k = k;
    const c = document.createElement("canvas"); c.width = 40; c.height = 40;
    b.append(c, document.createTextNode(HEAD_LABEL[k] || k));
    b.onclick = () => { st.head = k; enforceSet(); buildSets(); buildHeadColors(); refreshPanel(); };
    hs.append(b);
  });
  swatches("topSw", GENDER[st.gender].top, "topColor");
  buildHeadColors();
}
function buildSets(){
  const ss = document.getElementById("sets"); ss.innerHTML = "";
  availSets().forEach(k => {
    const b = document.createElement("button"); b.className = "opt"; b.dataset.s = k;
    const c = document.createElement("canvas"); c.width = 40; c.height = 66; c.style.height = "86px"; c.style.width = "52px";
    b.append(c, document.createTextNode(META.sets[k].label));
    b.onclick = () => { st.set = k; refreshPanel(); };
    ss.append(b);
  });
  const note = document.getElementById("setNote");
  note.style.display = headCat(st.head) === "hijab" ? "" : "none";
}
function buildHeadColors(){
  const hc = HEAD_COLORS[headCat(st.head)];
  document.getElementById("headColorBox").style.display = hc ? "" : "none";   // peci: warna tetap
  if (!hc) return;
  document.getElementById("headColorTitle").textContent = hc.title;
  swatches("hairSw", hc.pal || GENDER[st.gender].hair, hc.key);
}
function setGender(gk){
  // ganti jenis kelamin = pasang setelan bawaan jenis kelamin tersebut
  st.gender = gk;
  const G = GENDER[gk], D = G.def;
  st.head = D.head;
  st.set = D.set; enforceSet();
  st.topColor = D.top; st.hairColor = D.hair; st.hijabColor = D.hijab || HIJAB[0]; st.capColor = CAPS[0];
  buildLists(); refreshPanel();
}
function refreshPanel(){
  document.querySelectorAll("#gender button").forEach(b => b.classList.toggle("on", b.dataset.g === st.gender));
  document.querySelectorAll(".chips[data-slot]").forEach(box =>
    box.querySelectorAll("button").forEach(b => b.classList.toggle("on", (b.dataset.k || null) === st[box.dataset.slot])));
  document.querySelectorAll("#heads .opt").forEach(o => {
    o.classList.toggle("on", o.dataset.k === st.head);
    const c = o.querySelector("canvas"); thumb(c, o.dataset.k, "down", 1, 1);
  });
  document.querySelectorAll("#sets .opt").forEach(o => {
    o.classList.toggle("on", o.dataset.s === st.set);
    const c = o.querySelector("canvas"), x = c.getContext("2d"), keep = st.set;
    x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height);
    st.set = o.dataset.s; drawChar(x, c.width / 2, c.height - 2, "down", 1, st.head); st.set = keep;
  });
  drawTuner();
  const dc = document.querySelectorAll("#dirs canvas");
  DIRS.forEach((d, i) => thumb(dc[i], st.head, d, 1, 1));
  const hc = HEAD_COLORS[headCat(st.head)];
  document.querySelectorAll("#hairSw button").forEach(b => b.classList.toggle("on", hc && (b.dataset.v || null) === st[hc.key]));
  document.querySelectorAll("#topSw button").forEach(b => b.classList.toggle("on", (b.dataset.v || null) === st.topColor));
  document.querySelectorAll("#skinSw button").forEach((b, i) => b.classList.toggle("on", i === st.skin));
}
st.tuneDir = "down";
// setelan yang belum disimpan Claude: hanya untuk jenis kelamin yang belum dikunci
const LOCKED = HEAD_ADJ.locked || [];
try {
  localStorage.removeItem("headAdj");                       // format lama
  const saved = JSON.parse(localStorage.getItem("headAdj2") || "null");
  if (saved) Object.keys(saved).filter(g => !LOCKED.includes(g)).forEach(g => HEAD_ADJ[g] = saved[g]);
} catch(e) {}
function saveAdj(){ try { const o = {}; ["L","P"].filter(g => !LOCKED.includes(g)).forEach(g => o[g] = HEAD_ADJ[g] || {}); localStorage.setItem("headAdj2", JSON.stringify(o)); } catch(e) {} }
function drawTuner(){
  const c = document.getElementById("tuneView"), x = c.getContext("2d");
  x.imageSmoothingEnabled = false; x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = "rgba(232,131,58,.25)";
  drawChar(x, c.width / 2, c.height - 3, st.tuneDir, 1, st.head);
  const locked = LOCKED.includes(st.gender);
  document.querySelectorAll(".tunepad button").forEach(b => { b.disabled = locked; b.style.opacity = locked ? .35 : 1; });
  const a = ((HEAD_ADJ[st.gender] || {})[st.head] || {})[st.tuneDir] || {};
  document.getElementById("scVal").textContent = ((((HEAD_ADJ[st.gender] || {})[st.head] || {}).scale) || 100) + "%";
  ["scDown","scUp"].forEach(id => { const b = document.getElementById(id); b.disabled = locked; b.style.opacity = locked ? .35 : 1; });
  document.getElementById("tuneVal").textContent = (locked ? "🔒 " + GENDER[st.gender].label + " sudah dikunci · " : "") + `${HEAD_LABEL[st.head] || st.head} · ${ {down:"depan",left:"kiri",right:"kanan",up:"belakang"}[st.tuneDir] }: geser x ${a.dx || 0}, y ${a.dy || 0} piksel`;
  document.querySelectorAll("#tuneDir button").forEach(b => b.classList.toggle("on", b.dataset.d === st.tuneDir));
  document.getElementById("adjOut").textContent = JSON.stringify({L: HEAD_ADJ.L || {}, P: HEAD_ADJ.P || {}});
}
const SCALES = [100, 95, 90, 85, 80];
function setScale(step){
  if (LOCKED.includes(st.gender)) return;
  const G = HEAD_ADJ[st.gender] = HEAD_ADJ[st.gender] || {};
  const h = G[st.head] = G[st.head] || {};
  const i = Math.max(0, Math.min(SCALES.length - 1, SCALES.indexOf(h.scale || 100) + step));
  if (SCALES[i] === 100) delete h.scale; else h.scale = SCALES[i];
  if (!Object.keys(h).length) delete G[st.head];
  saveAdj(); refreshPanel();
}
function nudge(n){
  if (LOCKED.includes(st.gender)) return;
  const G = HEAD_ADJ[st.gender] = HEAD_ADJ[st.gender] || {};
  const h = G[st.head] = G[st.head] || {};
  if (n === "reset"){ delete h[st.tuneDir]; }
  else {
    const [dx, dy] = n.split(",").map(Number), a = h[st.tuneDir] = h[st.tuneDir] || {};
    a.dx = (a.dx || 0) + dx; a.dy = (a.dy || 0) + dy;
    if (!a.dx) delete a.dx; if (!a.dy) delete a.dy; if (!Object.keys(a).length) delete h[st.tuneDir];
  }
  if (!Object.keys(h).length) delete G[st.head];
  saveAdj(); refreshPanel();
}
function buildPanel(){
  document.querySelectorAll("#tuneDir button").forEach(b => b.onclick = () => { st.tuneDir = b.dataset.d; refreshPanel(); });
  document.getElementById("scDown").onclick = () => setScale(1);
  document.getElementById("scUp").onclick = () => setScale(-1);
  document.querySelectorAll(".tunepad button").forEach(b => b.onclick = () => nudge(b.dataset.n));
  document.querySelectorAll("#gender button").forEach(b => b.onclick = () => setGender(b.dataset.g));
  document.querySelectorAll(".chips[data-slot]").forEach(box => {
    const slot = box.dataset.slot;
    [null, ...box.dataset.opts.split(",")].forEach(k => {
      const b = document.createElement("button"); b.dataset.k = k || "";
      b.textContent = k ? (META.acc[k] || META.bags[k]).label : "Tidak ada";
      b.onclick = () => { st[slot] = k; refreshPanel(); };
      box.append(b);
    });
  });
  const dirs = document.getElementById("dirs");
  DIRS.forEach(() => { const c = document.createElement("canvas"); c.width = 40; c.height = 70; dirs.append(c); });
  const sk = document.getElementById("skinSw");
  SKIN.forEach((v, i) => { const b = document.createElement("button"); b.style.background = `rgb(${v.join(",")})`;
    b.onclick = () => { st.skin = i; refreshPanel(); }; sk.append(b); });
  document.getElementById("grid").onchange = e => { st.grid = e.target.checked; };
  buildLists();
}
// potret kepala di tombol: gambar karakter lalu geser agar kepala terlihat
const _thumb = thumb;
thumb = function(c, headKey, dir, frame, scale){
  if (c.width === 40 && c.height === 40){
    const x = c.getContext("2d"); x.imageSmoothingEnabled = false; x.clearRect(0, 0, 40, 40);
    drawChar(x, 20, 70, dir, frame, headKey);
    return;
  }
  _thumb(c, headKey, dir, frame, scale);
};

function start(){
  st.x = WW / 2; st.y = WH / 2 + 40;
  buildPanel(); setGender("L"); fit(); updateCamera(0, true);
  document.querySelectorAll("[data-z]").forEach(b => b.onclick = () => setZoom(ZOOM + (+b.dataset.z)));
  addEventListener("keydown", e => { if (e.key === "-") setZoom(ZOOM - 1); if (e.key === "=" || e.key === "+") setZoom(ZOOM + 1); });
  requestAnimationFrame(tick);
}
</script>
</body>
</html>
"""
html = HTML.replace("__META__", meta).replace("__HEADADJ__", head_adj).replace("__ATLAS__", atlas_b64)
(OUT / "index.html").write_text(html, encoding="utf-8")
print("index.html", len(html) // 1024, "KB")
