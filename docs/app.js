import init, { process, ZipBuilder } from "./pkg/pixelforge.js";

const $ = (id) => document.getElementById(id);
const state = { fmt: "jpeg", items: [], busy: Promise.resolve() };
const EXT = { jpeg: "jpg", png: "png", webp: "webp" };
const MIME = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const kb = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : (n / 1024).toFixed(1) + " KB");

const ready = init().then(() => { $("engine").textContent = "engine ready"; });

$("fmt").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.fmt = b.dataset.v;
  document.querySelectorAll("#fmt button").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
  $("quality").disabled = state.fmt !== "jpeg";
  reprocessAll();
});
$("quality").addEventListener("input", () => { $("qv").textContent = $("quality").value; });
$("quality").addEventListener("change", reprocessAll);
$("maxside").addEventListener("change", reprocessAll);

const drop = $("drop");
drop.addEventListener("click", (e) => { if (e.target.id !== "sample") $("file").click(); });
drop.addEventListener("keydown", (e) => { if (e.target === drop && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); $("file").click(); } });
["dragover", "dragenter"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
$("file").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
$("sample").addEventListener("click", async () => addFiles(await makeSamples()));

function addFiles(files) {
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const it = { file: f, src: URL.createObjectURL(f), li: document.createElement("li") };
    it.li.className = "item";
    $("list").append(it.li);
    state.items.push(it);
    queue(() => run(it));
  }
}
function queue(fn) { state.busy = state.busy.then(fn); return state.busy; }
function reprocessAll() { state.items.forEach((it) => queue(() => run(it))); }

async function run(it) {
  await ready;
  const q = +$("quality").value, max = +$("maxside").value, fmt = state.fmt;
  try {
    const input = new Uint8Array(await it.file.arrayBuffer());
    await new Promise((r) => setTimeout(r, 0)); // let the UI paint between files
    const t0 = performance.now();
    const out = process(input, fmt, q, max);
    it.ms = performance.now() - t0;
    const bytes = out.bytes;
    if (it.out) URL.revokeObjectURL(it.out);
    it.bytes = bytes; it.fmt = fmt; it.err = null;
    it.w = out.width; it.h = out.height; it.sw = out.src_width; it.sh = out.src_height;
    it.out = URL.createObjectURL(new Blob([bytes], { type: MIME[fmt] }));
    out.free();
  } catch (e) { it.err = String(e.message || e); it.bytes = null; }
  render(it); summary();
}

function render(it) {
  const li = it.li;
  if (it.err) {
    li.innerHTML = `<div class="meta"><span class="nm"></span><span class="err"></span></div>`;
    li.querySelector(".nm").textContent = it.file.name;
    li.querySelector(".err").textContent = "Could not process: " + it.err;
    return;
  }
  const saved = 100 * (1 - it.bytes.length / it.file.size);
  li.innerHTML = `<button class="thumb" aria-label="Compare before and after"></button>
    <div class="meta"><span class="nm"></span>
    <div class="row"><span class="dim"></span><span class="pct"></span></div>
    <div class="row"><span class="sz"></span><span class="ms"></span></div></div>`;
  li.querySelector(".thumb").style.backgroundImage = `url(${it.out})`;
  li.querySelector(".thumb").onclick = () => openCmp(it);
  li.querySelector(".nm").textContent = it.file.name.replace(/\.[^.]+$/, "") + "." + EXT[it.fmt];
  li.querySelector(".dim").textContent = `${it.sw}×${it.sh}` + (it.sw !== it.w ? ` → ${it.w}×${it.h}` : "");
  const p = li.querySelector(".pct");
  p.textContent = (saved >= 0 ? "−" : "+") + Math.abs(saved).toFixed(1) + "%";
  p.classList.toggle("neg", saved < 0);
  li.querySelector(".sz").textContent = `${kb(it.file.size)} → ${kb(it.bytes.length)}`;
  li.querySelector(".ms").textContent = Math.round(it.ms) + " ms";
}

function summary() {
  const done = state.items.filter((i) => i.bytes);
  $("summary").hidden = done.length === 0;
  const a = done.reduce((s, i) => s + i.file.size, 0), b = done.reduce((s, i) => s + i.bytes.length, 0);
  $("s-count").textContent = done.length; $("s-before").textContent = kb(a); $("s-after").textContent = kb(b);
  $("s-saved").textContent = (a ? (100 * (1 - b / a)).toFixed(1) : 0) + "%";
  $("s-time").textContent = Math.round(done.reduce((s, i) => s + i.ms, 0)) + " ms";
}

$("zip").addEventListener("click", () => {
  const done = state.items.filter((i) => i.bytes);
  if (!done.length) return;
  const z = new ZipBuilder(), used = new Set();
  for (const it of done) {
    const n = it.file.name.replace(/\.[^.]+$/, "");
    let name = `${n}.${EXT[it.fmt]}`, k = 1;
    while (used.has(name)) name = `${n}-${k++}.${EXT[it.fmt]}`;
    used.add(name); z.add(name, it.bytes);
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([z.finish()], { type: "application/zip" }));
  a.download = "pixelforge.zip"; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});

function openCmp(it) {
  $("img-before").src = it.src; $("img-after").src = it.out;
  $("cmp-info").textContent = `${it.file.name} — ${kb(it.file.size)} → ${kb(it.bytes.length)}, ${Math.round(it.ms)} ms`;
  $("modal").hidden = false; setPos(50); $("close").focus();
}
function setPos(v) {
  $("slider").value = v;
  document.querySelector(".before").style.clipPath = `inset(0 ${100 - v}% 0 0)`;
  $("handle").style.left = v + "%";
}
$("slider").addEventListener("input", (e) => setPos(+e.target.value));
$("cmp").addEventListener("pointermove", (e) => {
  if (!e.buttons) return;
  const r = $("cmp").getBoundingClientRect();
  setPos(Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)));
});
const closeCmp = () => { $("modal").hidden = true; };
$("close").onclick = closeCmp;
$("modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeCmp(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeCmp(); });

// Fictional sample photos drawn on canvas (no assets needed).
async function makeSamples() {
  const defs = [["aurora", 3200, 2000, 265, 170], ["dunas", 2800, 1800, 28, 340], ["lagoa", 3000, 2000, 190, 110]];
  const out = [];
  for (const [name, w, h, h1, h2] of defs) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d");
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, `hsl(${h1} 70% 18%)`); bg.addColorStop(1, `hsl(${h2} 80% 55%)`);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `hsla(${h1 + i * 3} 80% ${40 + (i % 5) * 8}% / .18)`;
      g.beginPath(); g.ellipse((i * 977) % w, (i * 613) % h, 120 + (i % 9) * 40, 60 + (i % 7) * 30, i, 0, 7); g.fill();
    }
    const px = g.getImageData(0, 0, w, h), d = px.data;
    for (let i = 0; i < d.length; i += 4) { const n = ((i * 2654435761) >>> 24) % 14 - 7; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(px, 0, 0);
    const blob = await new Promise((r) => c.toBlob(r, "image/png"));
    out.push(new File([blob], `${name}.png`, { type: "image/png" }));
  }
  return out;
}
