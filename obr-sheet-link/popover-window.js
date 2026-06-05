const STEP = 120;

export function enablePopoverDrag(OBR, options) {
  const root = document.getElementById(options.rootId);
  const handle = root?.querySelector(".spell-menu-head");
  if (!root || !handle) return;

  handle.classList.add("draggable-window-head");
  handle.title = "Потяните, чтобы закрепить окно в новом месте";
  if (!OBR.isAvailable) return;

  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button")) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startY = event.clientY;
    const params = new URLSearchParams(window.location.search);
    const baseX = parseInt(params.get("x"), 10) || Math.round(window.innerWidth / 2);
    const baseY = parseInt(params.get("y"), 10) || Math.round(window.innerHeight / 2);

    const onMove = (moveEvent) => {
      root.style.transform = `translate(${moveEvent.clientX - startX}px, ${moveEvent.clientY - startY}px)`;
      root.classList.add("dragging-window");
    };

    const onUp = async (upEvent) => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      root.classList.remove("dragging-window");
      root.style.transform = "";
      await movePopover(OBR, options, {
        left: baseX + upEvent.clientX - startX,
        top: baseY + upEvent.clientY - startY
      });
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
  });
}

export function bindPopoverMoveButtons(OBR, options) {
  const root = document.getElementById(options.rootId);
  if (!root || !OBR.isAvailable) return;
  root.querySelectorAll("[data-popover-move]").forEach((button) => {
    button.addEventListener("click", async () => {
      const direction = button.dataset.popoverMove || "";
      const params = new URLSearchParams(window.location.search);
      const baseX = parseInt(params.get("x"), 10) || Math.round(window.innerWidth / 2);
      const baseY = parseInt(params.get("y"), 10) || Math.round(window.innerHeight / 2);
      await movePopover(OBR, options, {
        left: baseX + (direction.includes("right") ? STEP : direction.includes("left") ? -STEP : 0),
        top: baseY + (direction.includes("down") ? STEP : direction.includes("up") ? -STEP : 0)
      });
    });
  });
}

async function movePopover(OBR, options, position) {
  const width = await OBR.viewport.getWidth();
  const height = await OBR.viewport.getHeight();
  const next = clampPosition(position, width, height);
  localStorage.setItem(options.storageKey, JSON.stringify(next));
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get("itemId") || "";
  const itemQuery = itemId ? `&itemId=${encodeURIComponent(itemId)}` : "";
  await OBR.popover.open({
    id: options.popoverId,
    url: `${options.url}?v=0138&x=${next.left}&y=${next.top}${itemQuery}`,
    width: 720,
    height: 620,
    anchorReference: "POSITION",
    anchorPosition: next,
    anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
    disableClickAway: true
  });
}

function clampPosition(position, screenWidth, screenHeight) {
  const margin = 24;
  return {
    left: Math.max(360 + margin, Math.min(screenWidth - 360 - margin, Math.round(position.left))),
    top: Math.max(310 + margin, Math.min(screenHeight - 310 - margin, Math.round(position.top)))
  };
}
