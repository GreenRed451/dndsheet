export function enablePopoverDrag(OBR, options) {
  const root = document.getElementById(options.rootId);
  const handle = root?.querySelector(".spell-menu-head");
  if (!root || !handle) return;
  if (!OBR.isAvailable) return;

  handle.classList.add("draggable-window-head");
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

      const nextPosition = await clampPosition(OBR, {
        left: baseX + upEvent.clientX - startX,
        top: baseY + upEvent.clientY - startY
      });
      localStorage.setItem(options.storageKey, JSON.stringify(nextPosition));
      const itemId = params.get("itemId") || "";
      const itemQuery = itemId ? `&itemId=${encodeURIComponent(itemId)}` : "";
      await OBR.popover.open({
        id: options.popoverId,
        url: `${options.url}?v=0136&x=${nextPosition.left}&y=${nextPosition.top}${itemQuery}`,
        width: 720,
        height: 620,
        anchorReference: "POSITION",
        anchorPosition: nextPosition,
        anchorOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        transformOrigin: { horizontal: "CENTER", vertical: "CENTER" },
        disableClickAway: true
      });
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp, { once: true });
  });
}

async function clampPosition(OBR, position) {
  if (!OBR?.viewport) return position;
  try {
    const width = await window.OBR.viewport.getWidth();
    const height = await window.OBR.viewport.getHeight();
    return {
      left: Math.max(80, Math.min(width - 80, Math.round(position.left))),
      top: Math.max(80, Math.min(height - 80, Math.round(position.top)))
    };
  } catch {
    return {
      left: Math.round(position.left),
      top: Math.round(position.top)
    };
  }
}
