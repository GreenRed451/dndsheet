import OBR from "https://esm.sh/@owlbear-rodeo/sdk@3.1.0";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, get } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { enablePopoverDrag } from "./popover-window.js?v=0137";

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
const ABILITY_POPOVER_ID = "ru.dndsheet.link/abilities-popover";
const SOURCE_LABELS = {
  racePreset: "раса",
  wizardClass: "класс",
  levelUp: "уровень"
};

let app;
let db;
let currentAbilities = [];

const $ = (id) => document.getElementById(id);

function initFirebase() {
  if (app) return;
  app = initializeApp(FB_CONFIG);
  db = getDatabase(app);
}

async function init() {
  if (!OBR.isAvailable) {
    renderMessage("Откройте это окно внутри Owlbear Rodeo.");
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
      renderAbilityMenu(data);
    } catch (error) {
      console.error(error);
      renderMessage("Не удалось загрузить умения листка.");
    }
  });
}

async function getContextItem() {
  const queryItemId = new URLSearchParams(window.location.search).get("itemId") || "";
  const selection = await OBR.player.getSelection();
  const fallbackItemId = localStorage.getItem("dnd_obr_context_item") || "";
  const itemId = queryItemId || (selection && selection.length === 1 ? selection[0] : fallbackItemId);
  if (!itemId) return null;
  const [item] = await OBR.scene.items.getItems([itemId]);
  return item || null;
}

function renderAbilityMenu(data) {
  currentAbilities = cleanList(data.abilities).map((ability, index) => ({
    name: ability.name || `Умение ${index + 1}`,
    desc: ability.desc || "",
    source: ability.source || ""
  }));
  if (data.features && !currentAbilities.length) {
    currentAbilities.push({
      name: "Черты и способности",
      desc: data.features,
      source: ""
    });
  }

  const title = data.charName || data._name || "Умения";
  $("abilityMenu").innerHTML = `
    <div class="spell-menu-head">
      <div>
        <div class="spell-menu-title">${escapeHtml(title)}</div>
        <div class="spell-menu-sub">${currentAbilities.length ? `Умений: ${currentAbilities.length}` : "Умения не указаны."}</div>
      </div>
      <button type="button" id="closeAbilityPopover" class="spell-menu-close">Закрыть</button>
    </div>
    ${currentAbilities.length
      ? `<div class="spell-menu-layout">
          <div class="spell-menu-list">
            ${currentAbilities.map((entry, index) => abilityButton(entry, index)).join("")}
          </div>
          <article id="abilityDetail" class="spell-detail"></article>
        </div>`
      : '<div class="attack-menu-empty">У этого персонажа пока нет записанных умений.</div>'}
  `;
  $("closeAbilityPopover")?.addEventListener("click", closePopover);
  enablePopoverDrag(OBR, {
    rootId: "abilityMenu",
    popoverId: ABILITY_POPOVER_ID,
    url: "/dndsheet/obr-sheet-link/abilities.html",
    storageKey: "dnd_obr_abilities_position"
  });
  $("abilityMenu").querySelectorAll("[data-ability-index]").forEach((button) => {
    button.addEventListener("click", () => showAbility(parseInt(button.dataset.abilityIndex, 10) || 0));
  });
  if (currentAbilities.length) showAbility(0);
}

function abilityButton(entry, index) {
  const source = sourceLabel(entry.source);
  return `
    <button type="button" class="spell-menu-item" data-ability-index="${index}">
      <span>${escapeHtml(entry.name)}</span>
      <small>${escapeHtml(source || "умение")}</small>
    </button>`;
}

function showAbility(index) {
  const entry = currentAbilities[index];
  const detail = $("abilityDetail");
  if (!entry || !detail) return;
  $("abilityMenu").querySelectorAll("[data-ability-index]").forEach((button) => {
    button.classList.toggle("active", parseInt(button.dataset.abilityIndex, 10) === index);
  });
  const source = sourceLabel(entry.source);
  detail.innerHTML = `
    <h1>${escapeHtml(entry.name)}</h1>
    ${source ? `<div class="spell-detail-sub">${escapeHtml(source)}</div>` : ""}
    <p>${escapeHtml(entry.desc || "Описание не указано.")}</p>`;
}

function renderMessage(text) {
  $("abilityMenu").innerHTML = `
    <div class="spell-menu-head">
      <div class="spell-menu-title">Умения</div>
      <button type="button" id="closeAbilityPopover" class="spell-menu-close">Закрыть</button>
    </div>
    <div class="attack-menu-empty">${escapeHtml(text)}</div>`;
  $("closeAbilityPopover")?.addEventListener("click", closePopover);
  enablePopoverDrag(OBR, {
    rootId: "abilityMenu",
    popoverId: ABILITY_POPOVER_ID,
    url: "/dndsheet/obr-sheet-link/abilities.html",
    storageKey: "dnd_obr_abilities_position"
  });
}

function closePopover() {
  if (OBR.isAvailable) OBR.popover.close(ABILITY_POPOVER_ID);
  else window.close();
}

function sourceLabel(source) {
  return SOURCE_LABELS[source] || source || "";
}

function cleanList(value) {
  return Array.isArray(value) ? value.filter((item) => {
    if (typeof item === "string") return item.trim();
    return item && Object.values(item).some((part) => String(part || "").trim());
  }) : [];
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
