import * as pdfjs from "./vendor/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.min.mjs";

const byId = (id) => document.getElementById(id);
const studio = byId("videoStudio");
const canvas = byId("videoCanvas");
const ctx = canvas.getContext("2d");
const DB_NAME = "fotos-video-projects";
const DB_STORE = "projects";
const EMOJIS = [
  ["😊","feliz sonrisa"],["😂","risa feliz"],["🥰","amor corazón"],["😍","amor ojos"],["🥳","fiesta celebrar"],["😎","gafas sol"],["🤩","estrella feliz"],["😭","llorar triste"],
  ["❤️","corazón amor rojo"],["🧡","corazón naranja"],["💛","corazón amarillo"],["💚","corazón verde"],["💙","corazón azul"],["💜","corazón morado"],["💔","corazón roto"],["💕","dos corazones"],
  ["👍","bien aprobar"],["👏","aplauso"],["💪","fuerza"],["🙏","gracias rezar"],["👋","hola adiós"],["✌️","victoria"],["🤝","acuerdo trabajo"],["👌","perfecto"],
  ["🎉","fiesta confeti"],["🎂","cumpleaños tarta"],["🎁","regalo"],["🎈","globo fiesta"],["✨","brillo estrella"],["🌟","estrella"],["🔥","fuego"],["💥","explosión"],
  ["🌹","rosa flor"],["🌻","girasol flor"],["🍀","suerte trébol"],["🌞","sol"],["🌙","luna"],["🌈","arcoiris"],["🌊","mar ola"],["🏖️","playa vacaciones"],
  ["🎵","música canción"],["🎤","micrófono música"],["🎧","auriculares"],["🎸","guitarra"],["📷","foto cámara"],["🎬","cine vídeo"],["🎨","arte pintura"],["💡","idea"],
  ["🏠","casa hogar"],["🚗","coche viaje"],["✈️","avión viaje"],["📍","lugar ubicación"],["💼","trabajo"],["🛠️","herramientas trabajo"],["✅","correcto"],["⚠️","aviso peligro"],
  ["🍕","pizza comida"],["🍻","cerveza brindar"],["🥂","brindis"],["☕","café"],["🏆","premio copa"],["⚽","fútbol deporte"],["🏋️","gimnasio deporte"],["💯","cien perfecto"]
];

let items = [];
let selected = -1;
let musicBlob = null;
let musicFileName = "";
let tool = "move";
let drawing = null;
let generatedBlob = null;
let previewFrame = 0;
let insertBeforeSelection = false;

function uid() { return `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function current() { return items[selected] || null; }
function totalDuration() { return items.reduce((sum, item) => sum + Number(item.duration || 0), 0); }
function setStatus(text) { byId("videoStatus").textContent = text; }
function revokeItems() { items.forEach((item) => item.url && URL.revokeObjectURL(item.url)); }

function openStudio() {
  studio.hidden = false;
  document.body.classList.add("studio-open");
  renderEmojis();
  renderTimeline();
  renderSavedProjects();
  renderFinishedVideos();
  drawPreview();
}
function closeStudio() {
  studio.hidden = true;
  document.body.classList.remove("studio-open");
  cancelAnimationFrame(previewFrame);
}

byId("createVideo").onclick = openStudio;
byId("closeStudio").onclick = closeStudio;
byId("addVideoMedia").onclick = () => { insertBeforeSelection = false; byId("videoMediaInput").click(); };
byId("addVideoMusic").onclick = () => byId("videoMusicInput").click();

function fileDuration(file) {
  if (!file.type.startsWith("video/")) return Promise.resolve(4);
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => { const value = Number.isFinite(video.duration) ? video.duration : 4; URL.revokeObjectURL(url); resolve(Math.max(1, value)); };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(4); };
    video.src = url;
  });
}

async function pdfToImage(file) {
  const documentPdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await documentPdf.getPage(1);
  const viewport = page.getViewport({ scale: 2 });
  const output = document.createElement("canvas"); output.width = viewport.width; output.height = viewport.height;
  await page.render({ canvasContext: output.getContext("2d"), viewport }).promise;
  const blob = await new Promise((resolve) => output.toBlob(resolve, "image/png", .95));
  return blob;
}

byId("videoMediaInput").onchange = async (event) => {
  const files = [...event.target.files].filter((file) => file.type.startsWith("image/") || file.type.startsWith("video/") || file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  const addedItems = [];
  for (const file of files) {
    const duration = await fileDuration(file);
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const blob = isPdf ? await pdfToImage(file) : file;
    addedItems.push({ id: uid(), name: isPdf ? `${file.name} (página 1)` : file.name, type: file.type.startsWith("video/") ? "video" : "image", blob, url: URL.createObjectURL(blob), duration: Math.round(duration * 10) / 10, text: "", textColor: "#ffffff", textSize: 48, textX: .5, textY: .78, strokes: [] });
  }
  if (addedItems.length) {
    if (insertBeforeSelection && selected >= 0) { const position = selected; items.splice(position, 0, ...addedItems); selected = position; setStatus(`${addedItems.length} archivo${addedItems.length > 1 ? "s" : ""} insertado${addedItems.length > 1 ? "s" : ""} antes de la parte marcada`); }
    else { const firstAdded = items.length; items.push(...addedItems); selected = firstAdded; setStatus(`${addedItems.length} archivo${addedItems.length > 1 ? "s" : ""} añadido${addedItems.length > 1 ? "s" : ""}. El vídeo tiene ${items.length} parte${items.length > 1 ? "s" : ""}.`); }
  }
  insertBeforeSelection = false;
  event.target.value = "";
  generatedBlob = null;
  updateEditor(); renderTimeline(); drawPreview();
};

byId("videoMusicInput").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  musicBlob = file;
  musicFileName = file.name;
  byId("musicName").textContent = `Música: ${file.name}`;
  setStatus("Música añadida");
  event.target.value = "";
};

function updateEditor() {
  const item = current();
  const controls = ["videoText","videoTextColor","videoTextSize","videoDuration","deleteVideoPart","insertVideoPhoto"];
  controls.forEach((id) => byId(id).disabled = !item);
  byId("generateVideo").disabled = !items.length;
  if (!item) return;
  byId("videoText").value = item.text || "";
  byId("videoTextColor").value = item.textColor || "#ffffff";
  byId("videoTextSize").value = item.textSize || 48;
  byId("videoDuration").value = item.duration || 4;
}

function bindItemField(id, prop, transform = (value) => value) {
  byId(id).oninput = (event) => { const item = current(); if (!item) return; item[prop] = transform(event.target.value); generatedBlob = null; renderTimeline(); drawPreview(); };
}
bindItemField("videoText", "text");
bindItemField("videoTextColor", "textColor");
bindItemField("videoTextSize", "textSize", Number);
bindItemField("videoDuration", "duration", (value) => Math.max(1, Number(value) || 1));

document.querySelector(".draw-tools").onclick = (event) => {
  const button = event.target.closest("[data-video-tool]");
  if (!button) return;
  tool = button.dataset.videoTool;
  document.querySelectorAll("[data-video-tool]").forEach((node) => node.classList.toggle("active", node === button));
  canvas.style.cursor = tool === "move" ? "grab" : "crosshair";
};

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
}
canvas.onpointerdown = (event) => {
  const item = current(); if (!item) return;
  canvas.setPointerCapture(event.pointerId);
  const point = canvasPoint(event);
  if (tool === "eraser") {
    let best = -1, bestDistance = .05;
    item.strokes.forEach((stroke, index) => stroke.points.forEach((p) => { const distance = Math.hypot(p.x - point.x, p.y - point.y); if (distance < bestDistance) { bestDistance = distance; best = index; } }));
    if (best >= 0) item.strokes.splice(best, 1);
  } else if (tool === "pen") {
    drawing = { color: byId("videoDrawColor").value, size: Number(byId("videoDrawSize").value), points: [point] };
    item.strokes.push(drawing);
  } else {
    item.textX = point.x; item.textY = point.y;
  }
  generatedBlob = null; drawPreview();
};
canvas.onpointermove = (event) => {
  const item = current(); if (!item || !(event.buttons & 1)) return;
  const point = canvasPoint(event);
  if (tool === "pen" && drawing) drawing.points.push(point);
  if (tool === "move") { item.textX = point.x; item.textY = point.y; }
  drawPreview();
};
canvas.onpointerup = canvas.onpointercancel = () => { drawing = null; };

function fitRect(width, height) {
  const scale = Math.min(canvas.width / width, canvas.height / height);
  const w = width * scale, h = height * scale;
  return { x: (canvas.width - w) / 2, y: (canvas.height - h) / 2, w, h };
}
function drawFrame(source, item) {
  ctx.fillStyle = "#111"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (source) {
    const width = source.videoWidth || source.naturalWidth || 1, height = source.videoHeight || source.naturalHeight || 1;
    const rect = fitRect(width, height);
    try { ctx.drawImage(source, rect.x, rect.y, rect.w, rect.h); } catch {}
  }
  item.strokes.forEach((stroke) => {
    if (!stroke.points.length) return;
    ctx.beginPath(); ctx.lineCap = ctx.lineJoin = "round"; ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.size;
    stroke.points.forEach((point, index) => { const x = point.x * canvas.width, y = point.y * canvas.height; index ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke();
  });
  if (item.text) {
    ctx.font = `800 ${item.textSize}px Arial`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = Math.max(3, item.textSize / 12); ctx.strokeStyle = "rgba(0,0,0,.72)"; ctx.fillStyle = item.textColor;
    const lines = String(item.text).split("\n");
    lines.forEach((line, index) => { const y = item.textY * canvas.height + index * item.textSize * 1.15; ctx.strokeText(line, item.textX * canvas.width, y); ctx.fillText(line, item.textX * canvas.width, y); });
  }
}

async function loadSource(item, autoplay = false) {
  if (item.type === "image") {
    const image = new Image();
    await new Promise((resolve) => { image.onload = resolve; image.onerror = resolve; image.src = item.url; if (image.complete) resolve(); });
    return image;
  }
  const video = document.createElement("video"); video.src = item.url; video.muted = !autoplay; video.playsInline = true; video.preload = "auto";
  await new Promise((resolve) => { video.onloadeddata = resolve; video.onerror = resolve; });
  return video;
}

async function drawPreview() {
  cancelAnimationFrame(previewFrame);
  const item = current();
  byId("videoEmptyHint").hidden = Boolean(item);
  if (!item) { ctx.fillStyle = "#17191c"; ctx.fillRect(0, 0, canvas.width, canvas.height); return; }
  const source = await loadSource(item);
  drawFrame(source, item);
  if (item.type === "video") {
    source.muted = true; source.loop = true; source.play().catch(() => undefined);
    const loop = () => { if (current() !== item || studio.hidden) { source.pause(); return; } drawFrame(source, item); previewFrame = requestAnimationFrame(loop); };
    loop();
  }
}

function renderTimeline() {
  const timeline = byId("videoTimeline"); timeline.innerHTML = "";
  items.forEach((item, index) => {
    const startsAt = items.slice(0, index).reduce((sum, part) => sum + Number(part.duration || 0), 0);
    const card = document.createElement("button"); card.className = `timeline-card ${selected === index ? "selected" : ""}`;
    card.innerHTML = `<b>${index + 1}</b><span>${item.type === "video" ? "🎬" : "🖼️"} ${escapeHtml(item.name)}<small>Empieza en ${startsAt.toFixed(1)} s · dura ${Number(item.duration).toFixed(1)} s</small></span><i data-move="left">‹</i><i data-move="right">›</i>`;
    card.onclick = (event) => {
      const direction = event.target.dataset.move;
      if (direction) { event.stopPropagation(); const next = direction === "left" ? index - 1 : index + 1; if (next >= 0 && next < items.length) { [items[index], items[next]] = [items[next], items[index]]; selected = next; renderTimeline(); drawPreview(); } return; }
      selected = index; updateEditor(); renderTimeline(); drawPreview(); setStatus(`Esta parte empieza en el segundo ${startsAt.toFixed(1)}`);
    };
    timeline.append(card);
  });
  const total = totalDuration(); byId("videoTotal").textContent = `${total.toFixed(1)} s`; byId("videoTotal").classList.remove("over");
  const selectedStart = selected >= 0 ? items.slice(0, selected).reduce((sum, part) => sum + Number(part.duration || 0), 0) : null;
  byId("selectedSecond").textContent = selectedStart === null ? "Selecciona una parte" : `Parte seleccionada: segundo ${selectedStart.toFixed(1)}`;
  updateEditor();
}

byId("deleteVideoPart").onclick = () => { if (selected < 0) return; const [removed] = items.splice(selected, 1); if (removed?.url) URL.revokeObjectURL(removed.url); selected = Math.min(selected, items.length - 1); generatedBlob = null; updateEditor(); renderTimeline(); drawPreview(); };

byId("insertVideoPhoto").onclick = () => { insertBeforeSelection = true; byId("videoMediaInput").click(); };

function renderEmojis() {
  const query = byId("emojiSearch").value.trim().toLowerCase();
  const recent = JSON.parse(localStorage.getItem("fotos-emojis") || "[]");
  const ordered = [...recent.map((emoji) => [emoji, "guardado reciente"]), ...EMOJIS.filter(([emoji]) => !recent.includes(emoji))];
  const list = ordered.filter(([emoji, words]) => !query || emoji.includes(query) || words.includes(query)).slice(0, 64);
  byId("emojiGrid").innerHTML = "";
  list.forEach(([emoji, words]) => { const button = document.createElement("button"); button.textContent = emoji; button.title = words; button.onclick = () => { const item = current(); if (!item) return setStatus("Elige primero una foto o vídeo"); item.text = `${item.text || ""}${emoji}`; byId("videoText").value = item.text; const next = [emoji, ...recent.filter((value) => value !== emoji)].slice(0, 16); localStorage.setItem("fotos-emojis", JSON.stringify(next)); generatedBlob = null; renderEmojis(); drawPreview(); }; byId("emojiGrid").append(button); });
}
byId("emojiSearch").oninput = renderEmojis;

function waitFrame() { return new Promise((resolve) => requestAnimationFrame(resolve)); }
function waitBriefly(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function requestCanvasFrame(track) { try { track?.requestFrame?.(); } catch {} }
function createRecorder(stream, hasAudio) {
  const types = hasAudio
    ? ["video/webm;codecs=vp8,opus","video/webm","video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4"]
    : ["video/webm;codecs=vp8","video/webm","video/mp4;codecs=avc1.42E01E","video/mp4"];
  for (const mimeType of types) {
    if (!MediaRecorder.isTypeSupported(mimeType)) continue;
    try { return new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 }); } catch {}
  }
  return new MediaRecorder(stream);
}

async function generateVideo() {
  if (!items.length || !canvas.captureStream || !window.MediaRecorder) return setStatus("Este navegador no permite crear vídeos. Usa Chrome o Edge actualizado.");
  const generateButton = byId("generateVideo"); generateButton.disabled = true; byId("videoProgress").value = 0; setStatus("Preparando el vídeo…");
  let canvasStream = null, canvasTrack = null, audioContext = null, destination = null, music = null, recorder = null;
  try {
    canvasStream = canvas.captureStream(10); canvasTrack = canvasStream.getVideoTracks()[0];
    if (musicBlob) try {
      audioContext = new AudioContext(); destination = audioContext.createMediaStreamDestination(); await audioContext.resume();
      music = new Audio(URL.createObjectURL(musicBlob)); music.loop = true; music.volume = .8; audioContext.createMediaElementSource(music).connect(destination); await music.play();
    } catch { audioContext = destination = music = null; }
    const tracks = [...canvasStream.getVideoTracks(), ...(destination ? destination.stream.getAudioTracks() : [])];
    const outputStream = new MediaStream(tracks); recorder = createRecorder(outputStream, Boolean(destination));
    const chunks = []; recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    const stopped = new Promise((resolve) => recorder.onstop = resolve); const startedRecording = new Promise((resolve) => recorder.addEventListener("start", resolve, { once: true })); recorder.start(500); await Promise.race([startedRecording, waitBriefly(800)]);
    let elapsed = 0;
    for (let index = 0; index < items.length; index++) {
      const item = items[index]; const duration = Math.max(1, Number(item.duration) || 1); setStatus(`Preparando parte ${index + 1} de ${items.length}…`); const source = await loadSource(item, true);
      if (item.type === "video") {
        source.currentTime = 0;
        if (audioContext && destination) { try { audioContext.createMediaElementSource(source).connect(destination); source.muted = false; } catch { source.muted = true; } } else source.muted = true;
        await source.play().catch(() => undefined);
      }
      drawFrame(source, item); requestCanvasFrame(canvasTrack); await waitFrame(); await waitFrame();
      const partStarted = performance.now();
      while ((performance.now() - partStarted) / 1000 < duration) {
        drawFrame(source, item); requestCanvasFrame(canvasTrack); const currentElapsed = elapsed + (performance.now() - partStarted) / 1000; byId("videoProgress").value = currentElapsed / Math.max(totalDuration(), 1) * 100; byId("videoStatus").textContent = `Parte ${index + 1}/${items.length} · ${Math.round(currentElapsed)} de ${Math.ceil(totalDuration())} s`; await waitFrame();
      }
      if (item.type === "video") source.pause(); elapsed += duration;
      try { recorder.requestData(); } catch {}
      await waitBriefly(100);
    }
    recorder.stop(); await Promise.race([stopped, waitBriefly(2000)]);
    if (!chunks.length) throw new Error("El grabador no produjo datos");
    generatedBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
    const preview = byId("generatedVideo"); if (preview.src) URL.revokeObjectURL(preview.src); preview.src = URL.createObjectURL(generatedBlob); preview.hidden = false;
    byId("downloadVideo").disabled = false; byId("videoProgress").value = 100; setStatus("Vídeo creado con todas sus partes. Ya puedes guardarlo.");
  } catch (error) {
    console.error(error); setStatus(`No se pudo terminar: ${error?.message || "el grabador del móvil no respondió"}.`);
  } finally {
    if (recorder?.state === "recording") try { recorder.stop(); } catch {}
    canvasStream?.getTracks().forEach((track) => track.stop()); music?.pause(); if (music?.src?.startsWith("blob:")) URL.revokeObjectURL(music.src); audioContext?.close(); generateButton.disabled = false;
  }
}
byId("generateVideo").onclick = generateVideo;

function outputExtension() { return generatedBlob?.type.includes("mp4") ? "mp4" : "webm"; }
function downloadBlob(blob, name) {
  const extension = blob.type.includes("mp4") ? "mp4" : "webm";
  const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${safeName(name)}.${extension}`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 2000);
}

byId("downloadVideo").onclick = async () => {
  if (!generatedBlob) return;
  const proposed = byId("videoProjectName").value || "Mi estado";
  const name = window.prompt("Escribe un nombre para guardar el vídeo:", proposed);
  if (name === null) return;
  const cleanName = name.trim(); if (!cleanName) return setStatus("Es necesario escribir un nombre");
  byId("videoProjectName").value = cleanName;
  const record = { id: uid(), kind: "video", name: cleanName, created: Date.now(), updated: Date.now(), used: false, usedAt: null, musicBlob, musicFileName, generatedBlob, items: items.map(({ url, ...item }) => item) };
  try { await dbAction("readwrite", (store) => store.put(record)); await renderFinishedVideos(); await renderSavedProjects(); downloadBlob(generatedBlob, cleanName); setStatus(`Vídeo "${cleanName}" guardado en la lista y en el dispositivo.`); }
  catch { setStatus("No se pudo guardar el vídeo. Puede faltar espacio en el dispositivo."); }
};
function safeName(value) { return (value || "mi-estado").trim().replace(/[^a-z0-9áéíóúñ_-]+/gi, "-").replace(/^-|-$/g, "") || "mi-estado"; }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "\"":"&quot;", "'":"&#39;" }[char])); }

function db() {
  return new Promise((resolve, reject) => { const request = indexedDB.open(DB_NAME, 1); request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath: "id" }); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
async function dbAction(mode, action) { const database = await db(); return new Promise((resolve, reject) => { const transaction = database.transaction(DB_STORE, mode); const store = transaction.objectStore(DB_STORE); const request = action(store); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); transaction.oncomplete = () => database.close(); }); }

byId("saveVideoProject").onclick = async () => {
  if (!items.length) return setStatus("Añade contenido antes de guardar");
  const id = byId("videoProjectName").dataset.id || uid(); byId("videoProjectName").dataset.id = id;
  const record = { id, kind: "project", name: byId("videoProjectName").value || "Mi estado", created: Date.now(), updated: Date.now(), used: false, usedAt: null, musicBlob, musicFileName, generatedBlob, items: items.map(({ url, ...item }) => item) };
  try { await dbAction("readwrite", (store) => store.put(record)); setStatus("Proyecto guardado. Podrás abrirlo y modificarlo."); renderSavedProjects(); } catch { setStatus("No se pudo guardar. Puede faltar espacio en el dispositivo."); }
};

async function renderSavedProjects() {
  const holder = byId("savedVideoProjects");
  try {
    const allRecords = await dbAction("readonly", (store) => store.getAll()); const projects = allRecords.filter((project) => project.kind !== "video"); holder.innerHTML = "";
    if (!projects.length) return holder.innerHTML = "<small>Todavía no hay proyectos guardados.</small>";
    projects.sort((a,b) => b.updated - a.updated).forEach((project) => {
      const row = document.createElement("div"); row.className = "saved-project"; row.innerHTML = `<span><b>${escapeHtml(project.name)}</b><small>${project.items.length} partes</small></span><button data-open>Abrir</button><button data-delete>×</button>`;
      row.querySelector("[data-open]").onclick = () => loadProject(project);
      row.querySelector("[data-delete]").onclick = async () => { await dbAction("readwrite", (store) => store.delete(project.id)); if (byId("videoProjectName").dataset.id === project.id) byId("videoProjectName").dataset.id = ""; renderSavedProjects(); };
      holder.append(row);
    });
  } catch { holder.innerHTML = "<small>No se pueden leer los proyectos guardados.</small>"; }
}

function formattedDate(value) {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "short", timeStyle: "short" }).format(new Date(value || Date.now()));
}

async function renderFinishedVideos() {
  const holder = byId("finishedVideoList");
  try {
    const records = await dbAction("readonly", (store) => store.getAll()); const videos = records.filter((record) => record.generatedBlob).sort((a,b) => (b.created || b.updated) - (a.created || a.updated)); holder.innerHTML = "";
    if (!videos.length) return holder.innerHTML = "<small>Todavía no hay vídeos guardados.</small>";
    videos.forEach((project) => {
      const row = document.createElement("article"); row.className = `finished-video ${project.used ? "is-used" : ""}`;
      row.innerHTML = `<div class="finished-video-info"><b>${escapeHtml(project.name)}</b><small>Creado: ${formattedDate(project.created || project.updated)}${project.usedAt ? `<br>Usado: ${formattedDate(project.usedAt)}` : ""}</small></div><label class="used-check"><input type="checkbox" ${project.used ? "checked" : ""}> Ya lo he usado</label><div class="finished-video-actions"><button data-open>Abrir y modificar</button><button data-play>Ver</button><button data-download>Descargar</button><button data-delete class="mini-danger">Eliminar</button></div>`;
      row.querySelector(".used-check input").onchange = async (event) => { project.used = event.target.checked; project.usedAt = project.used ? Date.now() : null; await dbAction("readwrite", (store) => store.put(project)); renderFinishedVideos(); };
      row.querySelector("[data-open]").onclick = () => loadProject(project);
      row.querySelector("[data-play]").onclick = () => { const preview = byId("generatedVideo"); if (preview.src) URL.revokeObjectURL(preview.src); preview.src = URL.createObjectURL(project.generatedBlob); preview.hidden = false; preview.scrollIntoView({ behavior: "smooth", block: "center" }); preview.play().catch(() => undefined); };
      row.querySelector("[data-download]").onclick = () => downloadBlob(project.generatedBlob, project.name);
      row.querySelector("[data-delete]").onclick = async () => { if (!confirm(`¿Eliminar "${project.name}" de la lista?`)) return; await dbAction("readwrite", (store) => store.delete(project.id)); renderFinishedVideos(); renderSavedProjects(); };
      holder.append(row);
    });
  } catch { holder.innerHTML = "<small>No se puede leer la lista de vídeos.</small>"; }
}

function loadProject(project) {
  revokeItems(); items = project.items.map((item) => ({ ...item, url: URL.createObjectURL(item.blob), strokes: item.strokes || [] })); selected = items.length ? 0 : -1; musicBlob = project.musicBlob || null; musicFileName = project.musicFileName || ""; generatedBlob = project.generatedBlob || null;
  byId("videoProjectName").value = project.name; byId("videoProjectName").dataset.id = project.id; byId("musicName").textContent = musicFileName ? `Música: ${musicFileName}` : "Sin música";
  if (generatedBlob) { const preview = byId("generatedVideo"); preview.src = URL.createObjectURL(generatedBlob); preview.hidden = false; byId("downloadVideo").disabled = false; }
  updateEditor(); renderTimeline(); drawPreview(); setStatus("Proyecto abierto. Puedes modificar cualquier parte.");
}

function newProject() {
  revokeItems(); items = []; selected = -1; musicBlob = generatedBlob = null; musicFileName = ""; byId("musicName").textContent = "Sin música"; byId("videoProjectName").value = "Mi estado"; byId("videoProjectName").dataset.id = ""; byId("generatedVideo").hidden = true; byId("downloadVideo").disabled = true; byId("videoProgress").value = 0; updateEditor(); renderTimeline(); drawPreview(); setStatus("Proyecto nuevo");
}
byId("newVideoProject").onclick = newProject;

renderEmojis();
