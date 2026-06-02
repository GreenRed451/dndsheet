import OBR, { buildLabel, buildShape } from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, onValue, off } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const FB_CONFIG = {
  apiKey: "AIzaSyBEjhg3RC4EzeaK792Ob2pn5krfXnn6rxk",
  authDomain: "dndsheet-1c7c2.firebaseapp.com",
  databaseURL: "https://dndsheet-1c7c2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "dndsheet-1c7c2",
  storageBucket: "dndsheet-1c7c2.firebasestorage.app",
  messagingSenderId: "771509243100",
  appId: "1:771509243100:web:b4655cafbe4935de447819"
};

const LINK_KEY = "ru.dndsheet.link/character";
const ROOM_KEY = "ru.dndsheet.link/room";
const OVERLAY_KEY = "ru.dndsheet.link/overlay";
const CLASS_LABELS = {
  barbarian: "Варвар",
  bard: "Бард",
  cleric: "Жрец",
  druid: "Друид",
  fighter: "Воин",
  monk: "Монах",
  paladin: "Паладин",
  ranger: "Следопыт",
  rogue: "Плут",
  sorcerer: "Чародей",
  warlock: "Колдун",
  wizard: "Волшебник"
};

let app;
let db;
let room = "";
let players = {};
let selectedCharacterKey = "";
let selectedItemId = "";
let selectedItemLink = null;
let playersRef = null;
let redrawTimer = null;
let unsubItems = null;
let unsubPlayer = null;

const $ = (id) => document.getElementById(id);

function sanitizeFirebaseKey(value) {
  return String(value || "").trim().replace(/[\x00-\x1F\x7F.#$\[\]\/'"`<>\\]/g, "_");
}

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

function setStatus(color, text) {
  $("statusDot").className = "dot" + (color ? " " + color : "");
  $("statusText").textContent = text;
}

function hpColor(cur, max) {
  const pct = max > 0 ? cur / max : 0;
  if (pct > 0.5) return "#639922";
  if (pct > 0.25) return "#BA7517";
  return "#993C1D";
}

function summary(key, data) {
  const hpMax = Math.max(1, parseInt(data.hpMax, 10) || 1);
  const hpCur = Math.max(0, parseInt(data.hpCur, 10) || 0);
  return {
    key,
    name: data.charName || data._name || key,
    playerName: data._name || key,
    cls: CLASS_LABELS[data.classSelect] || data.classSelect || "",
    level: parseInt(data.levelInput, 10) || 1,
    ac: parseInt(data.ac, 10) || 10,
    hpCur,
    hpMax
  };
}

function actualPlayers() {
  return Object.entries(players)
    .filter(([key]) => !String(key).startsWith("__"))
    .sort((a, b) => summary(a[0], a[1]).name.localeCompare(summary(b[0], b[1]).name, "ru"));
}

async function connectRoom() {
  initFirebase();
  const nextRoom = sanitizeFirebaseKey($("roomInput").value);
  if (!nextRoom) {
    setStatus("red", "Введите название комнаты.");
    return;
  }
  if (playersRef) off(playersRef);
  room = nextRoom;
  localStorage.setItem("dnd_obr_room", room);
  $("roomInput").value = room;
  if (await awaitSceneReady()) await OBR.scene.setMetadata({ [ROOM_KEY]: room });
  setStatus("orange", "Подключение...");
  playersRef = ref(db, `rooms/${room}/players`);
  onValue(playersRef, (snap) => {
    players = snap.val() || {};
    renderCharacters();
    scheduleOverlayRedraw();
    setStatus("green", `Подключено: ${room}`);
  }, (error) => {
    console.error(error);
    setStatus("red", "Ошибка чтения Firebase.");
  });
}

async function refreshSelection() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    $("selectionBox").textContent = "Откройте сцену Owlbear Rodeo.";
    $("linkBtn").disabled = true;
    $("unlinkBtn").disabled = true;
    return;
  }
  const selection = await OBR.player.getSelection();
  if (!selection || selection.length !== 1) {
    selectedItemId = "";
    selectedItemLink = null;
    $("selectionBox").textContent = "Выберите ровно один токен.";
    $("linkBtn").disabled = !selectedCharacterKey || !room;
    $("unlinkBtn").disabled = true;
    return;
  }
  selectedItemId = selection[0];
  const [item] = await OBR.scene.items.getItems([selectedItemId]);
  selectedItemLink = item?.metadata?.[LINK_KEY] || null;
  const text = selectedItemLink
    ? `Токен привязан к ${selectedItemLink.playerKey} в комнате ${selectedItemLink.room}.`
    : "Токен выбран, привязки пока нет.";
  $("selectionBox").textContent = text;
  $("linkBtn").disabled = !selectedCharacterKey || !room;
  $("unlinkBtn").disabled = !selectedItemLink;
}

async function awaitSceneReady() {
  try {
    return OBR.isAvailable && await OBR.scene.isReady();
  } catch {
    return false;
  }
}

function renderCharacters() {
  const list = $("characterList");
  const entries = actualPlayers();
  if (!entries.length) {
    list.innerHTML = '<div class="muted-box">В комнате пока нет персонажей.</div>';
    selectedCharacterKey = "";
    $("linkBtn").disabled = true;
    return;
  }
  list.innerHTML = "";
  for (const [key, data] of entries) {
    const s = summary(key, data);
    const pct = Math.max(0, Math.min(100, Math.round(s.hpCur / s.hpMax * 100)));
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (key === selectedCharacterKey ? " selected" : "");
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="meta">${escapeHtml(s.cls)} ${s.level} ур. · КД ${s.ac}</div>
        </div>
        <div class="hp">${s.hpCur}/${s.hpMax}</div>
      </div>
      <div class="hpbar"><div class="hpfill" style="width:${pct}%;background:${hpColor(s.hpCur, s.hpMax)}"></div></div>`;
    card.addEventListener("click", () => {
      selectedCharacterKey = key;
      renderCharacters();
      refreshSelection();
    });
    list.appendChild(card);
  }
}

async function linkSelectedToken() {
  await refreshSelection();
  if (!selectedItemId || !selectedCharacterKey || !room) return;
  const link = { room, playerKey: selectedCharacterKey };
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      item.metadata[LINK_KEY] = link;
    }
  });
  selectedItemLink = link;
  await refreshSelection();
  scheduleOverlayRedraw();
}

async function unlinkSelectedToken() {
  await refreshSelection();
  if (!selectedItemId) return;
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      delete item.metadata[LINK_KEY];
    }
  });
  selectedItemLink = null;
  await refreshSelection();
  scheduleOverlayRedraw();
}

function openSheet() {
  const url = new URL("../index.html", window.location.href);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function scheduleOverlayRedraw() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(redrawOverlays, 120);
}

async function redrawOverlays() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) return;
  const old = await OBR.scene.local.getItems((item) => Boolean(item.metadata?.[OVERLAY_KEY]));
  if (old.length) await OBR.scene.local.deleteItems(old.map((item) => item.id));
  if (!$("overlayToggle").checked || !room) return;

  const linkedItems = await OBR.scene.items.getItems((item) => {
    const link = item.metadata?.[LINK_KEY];
    return link?.room === room && Boolean(players[link.playerKey]);
  });

  const overlays = [];
  for (const item of linkedItems) {
    const link = item.metadata[LINK_KEY];
    const s = summary(link.playerKey, players[link.playerKey]);
    const bounds = await getBounds(item);
    const width = Math.max(84, Math.min(150, bounds.width || 110));
    const barHeight = 10;
    const x = bounds.center.x - width / 2;
    const y = bounds.top - 34;
    const pct = Math.max(0, Math.min(1, s.hpCur / s.hpMax));
    const color = hpColor(s.hpCur, s.hpMax);
    const metaBase = { [OVERLAY_KEY]: { tokenId: item.id } };

    overlays.push(
      buildLabel()
        .plainText(`КД ${s.ac} · ${s.hpCur}/${s.hpMax}`)
        .position({ x, y: y - 22 })
        .layer("ATTACHMENT")
        .disableHit(true)
        .metadata(metaBase)
        .build(),
      buildShape()
        .shapeType("RECTANGLE")
        .width(width)
        .height(barHeight)
        .position({ x, y })
        .fillColor("#1a1a18")
        .fillOpacity(0.88)
        .strokeColor("#ffffff")
        .strokeWidth(1)
        .layer("ATTACHMENT")
        .disableHit(true)
        .metadata(metaBase)
        .build(),
      buildShape()
        .shapeType("RECTANGLE")
        .width(Math.max(2, width * pct))
        .height(barHeight)
        .position({ x, y })
        .fillColor(color)
        .fillOpacity(1)
        .strokeWidth(0)
        .layer("ATTACHMENT")
        .disableHit(true)
        .metadata(metaBase)
        .build()
    );
  }
  if (overlays.length) await OBR.scene.local.addItems(overlays);
}

async function getBounds(item) {
  try {
    const bounds = await OBR.scene.items.getItemBounds([item.id]);
    const min = bounds.min || bounds.start || bounds.topLeft;
    const max = bounds.max || bounds.end || bounds.bottomRight;
    const width = bounds.width || (min && max ? Math.abs(max.x - min.x) : 0);
    const height = bounds.height || (min && max ? Math.abs(max.y - min.y) : 0);
    const center = bounds.center || {
      x: min && max ? (min.x + max.x) / 2 : item.position.x,
      y: min && max ? (min.y + max.y) / 2 : item.position.y
    };
    const top = min?.y ?? (center.y - height / 2);
    return { center, top, width, height };
  } catch (error) {
    console.warn("Unable to read item bounds", error);
    return { center: item.position || { x: 0, y: 0 }, top: (item.position?.y || 0) - 70, width: 110, height: 70 };
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function bindUi() {
  $("roomInput").value = localStorage.getItem("dnd_obr_room") || localStorage.getItem("dnd_fb_room") || "";
  $("connectBtn").addEventListener("click", connectRoom);
  $("refreshBtn").addEventListener("click", () => {
    if (room) connectRoom();
    refreshSelection();
    scheduleOverlayRedraw();
  });
  $("selectionBtn").addEventListener("click", refreshSelection);
  $("linkBtn").addEventListener("click", linkSelectedToken);
  $("unlinkBtn").addEventListener("click", unlinkSelectedToken);
  $("openSheetBtn").addEventListener("click", openSheet);
  $("overlayToggle").addEventListener("change", scheduleOverlayRedraw);
}

async function initObr() {
  if (!OBR.isAvailable) {
    setStatus("orange", "Откройте это окно как расширение Owlbear Rodeo.");
    return;
  }
  OBR.onReady(async () => {
    setStatus("", "Owlbear готов. Подключите комнату.");
    if (await OBR.scene.isReady()) {
      unsubItems = OBR.scene.items.onChange(scheduleOverlayRedraw);
      unsubPlayer = OBR.player.onChange(() => refreshSelection());
      refreshSelection();
    }
    OBR.scene.onReadyChange((ready) => {
      if (ready) {
        if (!unsubItems) unsubItems = OBR.scene.items.onChange(scheduleOverlayRedraw);
        if (!unsubPlayer) unsubPlayer = OBR.player.onChange(() => refreshSelection());
        refreshSelection();
        scheduleOverlayRedraw();
      }
    });
  });
}

bindUi();
initObr();
