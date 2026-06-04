import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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
const SPELL_STATS = {
  bard: "cha",
  cleric: "wis",
  druid: "wis",
  paladin: "cha",
  ranger: "wis",
  sorcerer: "cha",
  warlock: "cha",
  wizard: "int"
};

let app;
let db;

const $ = (id) => document.getElementById(id);

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

async function init() {
  if (!OBR.isAvailable) {
    renderMessage("Откройте это меню внутри Owlbear Rodeo.");
    return;
  }
  await OBR.onReady(async () => {
    try {
      initFirebase();
      const item = await getContextItem();
      const link = item?.metadata?.[LINK_KEY];
      if (!link?.room || !link?.playerKey) {
        renderMessage("Листок не привязан к этому токену.");
        return;
      }
      const snap = await get(ref(db, `rooms/${link.room}/players/${link.playerKey}`));
      const data = snap.val();
      if (!data) {
        renderMessage("Не удалось найти данные листка.");
        return;
      }
      renderAttackMenu(data);
    } catch (error) {
      console.error(error);
      renderMessage("Не удалось загрузить атаки листка.");
    }
  });
}

async function getContextItem() {
  const selection = await OBR.player.getSelection();
  const fallbackItemId = localStorage.getItem("dnd_obr_context_item") || "";
  const itemId = selection && selection.length === 1 ? selection[0] : fallbackItemId;
  if (!itemId) return null;
  const [item] = await OBR.scene.items.getItems([itemId]);
  return item || null;
}

function renderAttackMenu(data) {
  const rows = attackRows(data);
  const title = data.charName || data._name || "Листок";
  $("ctxAttackMenu").innerHTML = `
    <div class="attack-menu-title">${escapeHtml(title)}</div>
    <div class="attack-menu-list">
      ${rows.length ? rows.join("") : '<div class="attack-menu-empty">Атаки не указаны.</div>'}
    </div>`;
}

function attackRows(data) {
  const attacks = cleanList(data.attacks).map((attack) =>
    attackRow(attack.name || "Атака", attack.bonus || "", attack.dmg || "")
  );
  const spellStat = SPELL_STATS[data.classSelect];
  if (spellStat) {
    const spellMod = statMod(data, spellStat);
    const prof = profBonus(data.levelInput);
    attacks.push(attackRow("Атака заклинанием", fmtMod(prof + spellMod), ""));
    attacks.push(attackRow("Сложность спасброска", fmtMod(8 + prof + spellMod), ""));
  }
  return attacks;
}

function attackRow(name, bonus, details) {
  return `
    <div class="attack-menu-row">
      <span class="attack-menu-name">${escapeHtml(name)}</span>
      <span class="attack-menu-bonus">${escapeHtml(bonus)}</span>
      ${details ? `<span class="attack-menu-details">${escapeHtml(details)}</span>` : ""}
    </div>`;
}

function renderMessage(text) {
  $("ctxAttackMenu").innerHTML = `<div class="attack-menu-empty">${escapeHtml(text)}</div>`;
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((item) => {
    if (typeof item === "string") return item.trim();
    return item && Object.values(item).some((part) => String(part || "").trim());
  }) : [];
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

function fmtMod(value) {
  const num = parseInt(value, 10) || 0;
  return num >= 0 ? "+" + num : String(num);
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

init();
