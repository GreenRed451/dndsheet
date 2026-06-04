import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
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
let playersRef = null;
let selectedItemId = "";
let selectedItemLink = null;
let selectedCharacterKey = "";

const $ = (id) => document.getElementById(id);

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

function sanitizeFirebaseKey(value) {
  return String(value || "").trim().replace(/[\x00-\x1F\x7F.#$\[\]\/'"`<>\\]/g, "_");
}

function summary(key, data) {
  const hpMax = Math.max(1, parseInt(data.hpMax, 10) || 1);
  const hpCur = Math.max(0, parseInt(data.hpCur, 10) || 0);
  const hpTemp = Math.max(0, parseInt(data.hpTemp, 10) || 0);
  return {
    key,
    name: data.charName || data._name || key,
    cls: CLASS_LABELS[data.classSelect] || data.classSelect || "",
    level: parseInt(data.levelInput, 10) || 1,
    ac: parseInt(data.ac, 10) || 10,
    hpCur,
    hpMax,
    hpTemp
  };
}

async function connectRoom(nextRoom, writeScene = false) {
  initFirebase();
  if (playersRef) off(playersRef);
  room = sanitizeFirebaseKey(nextRoom);
  $("ctxRoomInput").value = room;
  localStorage.setItem("dnd_obr_room", room);
  if (!room) {
    players = {};
    render();
    return;
  }
  if (writeScene && OBR.isAvailable && await OBR.scene.isReady()) {
    await OBR.scene.setMetadata({ [ROOM_KEY]: room });
  }
  playersRef = ref(db, `rooms/${room}/players`);
  onValue(playersRef, (snap) => {
    players = snap.val() || {};
    if (selectedItemLink?.room === room && players[selectedItemLink.playerKey]) {
      selectedCharacterKey = selectedItemLink.playerKey;
    }
    render();
  });
}

async function refreshSelection() {
  if (!OBR.isAvailable || !(await OBR.scene.isReady())) {
    setStatus("Откройте сцену Owlbear Rodeo.");
    return;
  }
  const selection = await OBR.player.getSelection();
  const fallbackItemId = localStorage.getItem("dnd_obr_context_item") || "";
  const itemId = selection && selection.length === 1 ? selection[0] : fallbackItemId;
  if (!itemId) {
    selectedItemId = "";
    selectedItemLink = null;
    setStatus("Выберите ровно один токен.");
    render();
    return;
  }
  selectedItemId = itemId;
  const [item] = await OBR.scene.items.getItems([selectedItemId]);
  if (!item) {
    selectedItemId = "";
    selectedItemLink = null;
    setStatus("Токен не найден на сцене.");
    render();
    return;
  }
  selectedItemLink = item?.metadata?.[LINK_KEY] || null;
  if (selectedItemLink?.room && selectedItemLink.room !== room) {
    await connectRoom(selectedItemLink.room);
  }
  if (selectedItemLink?.room === room && players[selectedItemLink.playerKey]) {
    selectedCharacterKey = selectedItemLink.playerKey;
  }
  render();
}

function actualPlayers() {
  return Object.entries(players)
    .filter(([key]) => !String(key).startsWith("__"))
    .sort((a, b) => summary(a[0], a[1]).name.localeCompare(summary(b[0], b[1]).name, "ru"));
}

async function bindToken(key) {
  if (!selectedItemId || !room || !players[key]) return;
  const link = { room, playerKey: key };
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      item.metadata[LINK_KEY] = link;
    }
  });
  selectedItemLink = link;
  selectedCharacterKey = key;
  render();
}

async function unlinkToken() {
  if (!selectedItemId) return;
  await OBR.scene.items.updateItems([selectedItemId], (items) => {
    for (const item of items) {
      item.metadata = item.metadata || {};
      delete item.metadata[LINK_KEY];
    }
  });
  selectedItemLink = null;
  render();
}

function render() {
  renderStatus();
  renderCharacters();
  renderSheet();
}

function renderStatus() {
  if (!selectedItemId) {
    setStatus("Выберите один токен, чтобы привязать листок.");
    $("ctxUnlinkBtn").disabled = true;
    return;
  }
  $("ctxUnlinkBtn").disabled = !selectedItemLink;
  if (!selectedItemLink) {
    setStatus("Токен выбран, листок пока не привязан.");
    return;
  }
  setStatus(`Привязан: ${selectedItemLink.playerKey} · ${selectedItemLink.room}`);
}

function renderCharacters() {
  const list = $("ctxCharacterList");
  const entries = actualPlayers();
  if (!entries.length) {
    list.innerHTML = '<div class="muted-box">В комнате пока нет персонажей.</div>';
    return;
  }
  list.innerHTML = "";
  for (const [key, data] of entries) {
    const s = summary(key, data);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card" + (key === selectedCharacterKey ? " selected" : "");
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="name">${escapeHtml(s.name)}</div>
          <div class="meta">${escapeHtml(s.cls)} ${s.level} ур. · КД ${s.ac}</div>
        </div>
        <div class="hp">${s.hpCur}/${s.hpMax}${s.hpTemp ? " +" + s.hpTemp : ""}</div>
      </div>`;
    card.addEventListener("click", () => bindToken(key));
    list.appendChild(card);
  }
}

function renderSheet() {
  const box = $("ctxSheetBox");
  const key = selectedCharacterKey || selectedItemLink?.playerKey;
  const data = key ? players[key] : null;
  if (!data) {
    box.innerHTML = '<div class="muted-box">Привяжите или выберите персонажа.</div>';
    return;
  }
  const s = summary(key, data);
  const temp = s.hpTemp ? ` +${s.hpTemp} врем.` : "";
  const attacks = cleanList(data.attacks).slice(0, 3).map((attack) =>
    `<div class="overview-row"><strong>${escapeHtml(attack.name || "Атака")}</strong><span>${escapeHtml(attack.bonus || "")} ${escapeHtml(attack.dmg || "")}</span></div>`
  ).join("");
  const abilities = cleanList(data.abilities).slice(0, 3).map((ability) =>
    `<span class="overview-badge">${escapeHtml(ability.name || "Умение")}</span>`
  ).join("");
  box.innerHTML = `
    <div class="overview-head">
      <div>
        <div class="overview-name">${escapeHtml(s.name)}</div>
        <div class="overview-sub">${escapeHtml(s.cls)} ${s.level} ур. · ${escapeHtml(data.race || "Раса не указана")}</div>
      </div>
      <div class="overview-hp">${s.hpCur}/${s.hpMax}${escapeHtml(temp)}<br>КД ${s.ac}</div>
    </div>
    <div class="overview-grid">
      ${tile("Иниц.", data.initField || "—")}
      ${tile("Скорость", data.speed || "30 фт.")}
      ${tile("Пассивка", passivePerception(data))}
    </div>
    ${attacks ? `<h2>Атаки</h2><div class="overview-section">${attacks}</div>` : ""}
    ${abilities ? `<h2>Умения</h2><div class="overview-badges">${abilities}</div>` : ""}`;
}

function tile(label, value) {
  return `<div class="overview-tile"><div class="overview-label">${escapeHtml(label)}</div><div class="overview-value">${escapeHtml(value)}</div></div>`;
}

function passivePerception(data) {
  const wis = statMod(data, "wis");
  const prof = data.skillProf?.perception ? profBonus(data.levelInput) : 0;
  return 10 + wis + prof;
}

function statTotal(data, stat) {
  return (parseInt(data.statValues?.[stat], 10) || 10)
    + (parseInt(data.statBonus?.[stat], 10) || 0)
    + (parseInt(data.asiBonus?.[stat], 10) || 0);
}

function statMod(data, stat) {
  return Math.floor((statTotal(data, stat) - 10) / 2);
}

function profBonus(level) {
  return 2 + Math.floor(((parseInt(level, 10) || 1) - 1) / 4);
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((item) => {
    if (typeof item === "string") return item.trim();
    return item && Object.values(item).some((part) => String(part || "").trim());
  }) : [];
}

function openFullSheet() {
  const url = new URL("../index.html", window.location.href);
  window.open(url.toString(), "_blank", "noopener,noreferrer");
}

function setStatus(text) {
  $("ctxStatus").textContent = text;
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
  $("ctxConnectBtn").addEventListener("click", () => connectRoom($("ctxRoomInput").value, true));
  $("ctxRefreshBtn").addEventListener("click", refreshSelection);
  $("ctxUnlinkBtn").addEventListener("click", unlinkToken);
  $("ctxOpenFullBtn").addEventListener("click", openFullSheet);
}

async function init() {
  bindUi();
  if (!OBR.isAvailable) {
    setStatus("Откройте это меню внутри Owlbear Rodeo.");
    return;
  }
  await OBR.onReady(async () => {
    const metadata = await OBR.scene.getMetadata();
    const savedRoom = metadata[ROOM_KEY] || localStorage.getItem("dnd_obr_room") || localStorage.getItem("dnd_fb_room") || "";
    $("ctxRoomInput").value = savedRoom;
    if (savedRoom) await connectRoom(savedRoom);
    await refreshSelection();
  });
}

init();
