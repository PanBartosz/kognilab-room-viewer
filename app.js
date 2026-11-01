import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createViewer } from "./scene.js";

const $ = selector => document.querySelector(selector);
const all = selector => [...document.querySelectorAll(selector)];
const variants = {
  a: { layout: "./assets/equipment_layout_a.json", model: "./assets/kogni_lab_equipped_307_308.glb" },
  b: { layout: "./assets/equipment_layout_b.json", model: "./assets/kogni_lab_equipped_307_308_variant_b.glb" },
};
const layerNames = ["walls", "ceilings", "zones", "cables"];
const number = (value, digits = 1) => value.toLocaleString("pl-PL", { maximumFractionDigits: digits });
const normalize = text => text.toLocaleLowerCase("pl").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ł/g, "l");
let state = readLocation();
let layout;
let viewer;
let busy = false;
let sequence = 0;
let retryVariant = state.variant;
let statusTimer;
const cache = new Map(); // Two variants, fetched and decoded at most once per session.

function readLocation() {
  const params = new URLSearchParams(location.hash.slice(1));
  const visible = params.has("layers") ? params.get("layers").split(",") : ["walls", "zones", "cables"];
  return {
    variant: params.get("variant") === "b" ? "b" : "a",
    room: ["307", "308"].includes(params.get("room")) ? params.get("room") : "all",
    projection: params.get("view") === "2d" ? "2d" : "3d",
    layers: Object.fromEntries(layerNames.map(key => [key, visible.includes(key)])),
    selected: params.get("item") || null,
  };
}
function syncLocation() {
  const params = new URLSearchParams({ variant: state.variant, room: state.room, view: state.projection, layers: layerNames.filter(key => state.layers[key]).join(",") });
  if (state.selected) params.set("item", state.selected);
  const url = new URL(location.href);
  url.hash = params.toString();
  history.replaceState(null, "", url);
}
function message(text) {
  clearTimeout(statusTimer);
  $("#status").textContent = text;
  $("#status").hidden = false;
  statusTimer = setTimeout(() => { $("#status").hidden = true; }, 4500);
}
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function panelOpen(open) {
  $(".panel").classList.toggle("open", open);
  $("#panel-toggle").setAttribute("aria-expanded", String(open));
  $("#panel-toggle-icon").textContent = open ? "−" : "＋";
}
function selectedGroup() {
  return layout?.schedule_groups.find(group => group.code === state.selected);
}
function revealSelection() {
  const scroller = $(matchMedia("(max-width: 760px)").matches ? "#panel-content" : ".panel");
  const offset = $("#selection").getBoundingClientRect().top - scroller.getBoundingClientRect().top;
  scroller.scrollTop += offset - 16;
}
function syncControls() {
  for (const [key, value] of [["variant", state.variant], ["room", state.room], ["projection", state.projection]]) {
    for (const button of all(`[data-${key}]`)) {
      button.setAttribute("aria-pressed", String(button.dataset[key] === value));
      button.disabled = busy || !viewer || (key !== "variant" && !layout);
    }
  }
  for (const key of layerNames) {
    const input = $(`#toggle-${key}`);
    input.checked = key === "ceilings" && state.projection === "2d" ? false : state.layers[key];
    input.disabled = busy || !layout || (key === "ceilings" && state.projection === "2d");
  }
  $("#ceilings-label").title = state.projection === "2d" ? "Skosy są ukryte w rzucie 2D; ustawienie wróci w widoku 3D." : "Pokaż skosy i okno połaciowe";
  for (const selector of ["#share", "#export", "#zoom-in", "#zoom-out", "#reset-view", "#selection-focus"]) $(selector).disabled = busy || !layout;
  $(".stage").setAttribute("aria-busy", String(busy));
  $("#view-label").textContent = `Wariant ${state.variant.toUpperCase()} · ${state.room === "all" ? "oba pomieszczenia" : `pokój ${state.room}`} · ${state.projection === "2d" ? "rzut 2D" : "3D"}`;
  $(".interaction-hint").textContent = state.projection === "2d" ? "Przeciągnij, aby przesunąć · scroll przybliża" : "Przeciągnij, aby obrócić · scroll przybliża";
  $("#equipment-search").disabled = busy || !layout;
}
function renderSummary() {
  $("#variant-summary").textContent = layout.variant?.summary || "";
  const zone = layout.zones.find(item => item.kind === "primary_vr");
  $("#vr-area").textContent = zone ? number(zone.w * zone.d, 2) : "—";
  const inventory = layout.furniture_inventory || [];
  const total = inventory.reduce((sum, item) => sum + item.quantity, 0);
  const used = inventory.filter(item => item.status === "placed").reduce((sum, item) => sum + item.quantity, 0);
  $("#inventory-count").textContent = `${used} / ${total}`;
  $("#design-notes").replaceChildren(...(layout.design_principles || []).map(text => element("li", "", text)));
}
function renderEquipment() {
  const query = normalize($("#equipment-search").value.trim());
  let count = 0;
  const nodes = [];
  for (const group of layout?.schedule_groups || []) {
    if (state.room !== "all" && group.room !== state.room) continue;
    const items = layout.equipment.filter(item => group.items.includes(item.id));
    const haystack = normalize([group.code, group.room, group.label, group.role, ...items.map(item => item.label)].join(" "));
    if (query && !query.split(/\s+/).every(word => haystack.includes(word))) continue;
    count++;
    const row = element("li");
    const button = element("button");
    button.type = "button";
    button.dataset.group = group.code;
    button.setAttribute("aria-pressed", String(group.code === state.selected));
    button.disabled = busy;
    const label = element("span");
    label.append(element("span", "label", group.label), element("span", "room", `Pokój ${group.room}`));
    const arrow = element("span", "equipment-arrow", "↗");
    arrow.setAttribute("aria-hidden", "true");
    button.append(element("span", "code", group.code), label, arrow);
    button.addEventListener("click", () => selectGroup(group.code));
    row.append(button);
    nodes.push(row);
  }
  $("#equipment-list").replaceChildren(...nodes);
  $("#equipment-count").textContent = String(count);
  $("#empty-results").hidden = count !== 0 || !layout;
  $("#list-scope").textContent = `${state.room === "all" ? "Oba pomieszczenia" : `Pokój ${state.room}`} · wybierz element na liście lub w modelu`;
}
function renderSelection() {
  const group = selectedGroup();
  $("#selection").hidden = !group;
  viewer?.highlight(group?.code);
  if (!group) return;
  $("#selection-meta").textContent = `Zespół ${group.code} · pokój ${group.room}`;
  $("#selection-title").textContent = group.label;
  $("#selection-role").textContent = group.role;
  const items = layout.equipment.filter(item => group.items.includes(item.id));
  $("#selection-items").replaceChildren(...items.map(item => {
    const node = element("li", "", item.label);
    // Only show source dimensions, never infer dimensions from decorative geometry.
    if (Number.isFinite(item.w) && Number.isFinite(item.d)) {
      const dimensions = [item.w, item.d, item.h].filter(Number.isFinite).map(value => number(value * 100));
      node.append(element("span", "item-dimensions", `Gabaryt w modelu: ${dimensions.join(" × ")} cm`));
    }
    if (item.height_note) node.append(element("span", "item-dimensions", item.height_note));
    return node;
  }));
}
function updateView({ refit = false } = {}) {
  syncControls();
  viewer?.show(state, refit);
  renderEquipment();
  renderSelection();
  syncLocation();
}
function selectGroup(code) {
  const group = layout?.schedule_groups.find(item => item.code === code);
  if (!group || busy) return;
  const fromList = document.activeElement?.hasAttribute("data-group");
  state.selected = code;
  // Keep the whole-plan context when selecting; a room filter stays consistent.
  if (state.room !== "all" && state.room !== group.room) state.room = group.room;
  updateView();
  panelOpen(true);
  $("#selection details").open = false;
  if (fromList) $("#selection-title").focus({ preventScroll: true });
  revealSelection();
  message(`${group.label} · opis w panelu`);
}
function clearSelection() {
  const code = state.selected;
  const hadFocus = $("#selection").contains(document.activeElement);
  state.selected = null;
  updateView();
  if (hadFocus) (all("[data-group]").find(button => button.dataset.group === code) || $("#equipment-search")).focus();
}
function changeRoom(room) {
  state.room = room;
  if (room !== "all" && selectedGroup()?.room !== room) state.selected = null;
  updateView({ refit: true });
}

async function fetchVariant(id) {
  if (cache.has(id)) return cache.get(id);
  const pending = (async () => {
    const config = variants[id];
    const signal = AbortSignal.timeout(30000);
    const [nextLayout, buffer] = await Promise.all([
      fetch(config.layout, { signal, cache: "no-cache" }).then(response => {
        if (!response.ok) throw new Error(`Layout: HTTP ${response.status}`);
        return response.json();
      }),
      fetch(config.model, { signal, cache: "no-cache" }).then(response => {
        if (!response.ok) throw new Error(`Model: HTTP ${response.status}`);
        return response.arrayBuffer();
      }),
    ]);
    for (const key of ["equipment", "schedule_groups", "zones", "cable_paths"]) {
      if (!Array.isArray(nextLayout[key])) throw new Error(`Brak danych: ${key}`);
    }
    const gltf = await new GLTFLoader().parseAsync(buffer, new URL("./assets/", location.href).href);
    return { layout: nextLayout, model: gltf.scene };
  })();
  cache.set(id, pending);
  try { return await pending; }
  catch (error) { cache.delete(id); throw error; }
}
async function loadVariant(id, restoredState = null) {
  if (!viewer) return;
  const currentSequence = ++sequence;
  retryVariant = id;
  busy = true;
  $("#load-error").hidden = true;
  $("#loading").hidden = false;
  $("#loading-message").textContent = `Wczytywanie wariantu ${id.toUpperCase()}…`;
  syncControls();
  all("[data-group]").forEach(button => { button.disabled = true; });
  try {
    const entry = await fetchVariant(id);
    if (currentSequence !== sequence) return;
    const nextState = restoredState || { ...state, variant: id, selected: null };
    const group = entry.layout.schedule_groups.find(item => item.code === nextState.selected);
    if (!group || (nextState.room !== "all" && group.room !== nextState.room)) nextState.selected = null;
    // Commit variant, labels and model together only after both files succeeded.
    viewer.setModel(entry.model, entry.layout);
    layout = entry.layout;
    state = nextState;
    busy = false;
    $("#equipment-search").value = "";
    renderSummary();
    updateView({ refit: true });
    if (state.selected) { panelOpen(true); revealSelection(); }
  } catch (error) {
    if (currentSequence !== sequence) return;
    console.error("Nie udało się wczytać wariantu", id, error);
    $("#error-message").textContent = `Wariant ${id.toUpperCase()} jest niedostępny. Sprawdź połączenie i spróbuj ponownie.${layout ? ` Nadal wyświetlany jest wariant ${state.variant.toUpperCase()}.` : ""}`;
    $("#load-error").hidden = false;
    if (layout) syncLocation();
  } finally {
    if (currentSequence === sequence) {
      busy = false;
      $("#loading").hidden = true;
      syncControls();
      renderEquipment();
    }
  }
}

for (const button of all("[data-variant]")) button.addEventListener("click", () => {
  if (button.dataset.variant === state.variant && layout) {
    $("#load-error").hidden = true;
    return;
  }
  loadVariant(button.dataset.variant);
});
for (const button of all("[data-room]")) button.addEventListener("click", () => changeRoom(button.dataset.room));
for (const button of all("[data-projection]")) button.addEventListener("click", () => {
  state.projection = button.dataset.projection;
  updateView({ refit: true });
});
for (const key of layerNames) $(`#toggle-${key}`).addEventListener("change", event => {
  state.layers[key] = event.target.checked;
  updateView();
});
$("#equipment-search").addEventListener("input", renderEquipment);
$("#clear-search").addEventListener("click", () => {
  $("#equipment-search").value = "";
  renderEquipment();
  $("#equipment-search").focus();
});
$("#selection-close").addEventListener("click", clearSelection);
$("#selection-focus").addEventListener("click", () => {
  if (matchMedia("(max-width: 760px)").matches) { panelOpen(false); $("#scene").focus(); }
  viewer.focusGroup(state.selected);
});
$("#panel-toggle").addEventListener("click", () => panelOpen(!$(".panel").classList.contains("open")));
$(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  $("#scene").focus();
});
$("#zoom-in").addEventListener("click", () => viewer.zoom(1.25));
$("#zoom-out").addEventListener("click", () => viewer.zoom(0.8));
$("#reset-view").addEventListener("click", () => viewer.fit());
$("#retry").addEventListener("click", () => viewer ? loadVariant(retryVariant) : location.reload());
$("#help-open").addEventListener("click", () => $("#help-dialog").showModal());
$("#help-close").addEventListener("click", () => $("#help-dialog").close());
$("#share").addEventListener("click", async () => {
  syncLocation();
  try { await navigator.clipboard.writeText(location.href); message("Skopiowano link do tego widoku."); }
  catch { message("Link jest w pasku adresu — skopiuj go stamtąd."); }
});
$("#export").addEventListener("click", async () => {
  const button = $("#export");
  button.disabled = true;
  const filename = `kognilab-${state.variant}-${state.room}-${state.projection}.png`;
  try {
    const blob = await viewer.exportImage();
    if (!blob) throw new Error("Pusty obraz");
    const url = URL.createObjectURL(blob);
    const link = element("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    message("Zapisano bieżący kadr modelu jako PNG.");
  } catch { message("Nie udało się zapisać obrazu. Spróbuj ponownie."); }
  finally { syncControls(); }
});
window.addEventListener("hashchange", () => loadVariant(readLocation().variant, readLocation()));

try {
  viewer = createViewer($("#scene"), {
    onPick: data => { if (busy) return; if (data.group) selectGroup(data.group); else if (data.label) message(data.label); },
    onClear: clearSelection,
    onReset: () => viewer.fit(),
    onContextLost: () => message("Przerwano wyświetlanie grafiki. Oczekiwanie na przywrócenie…"),
    onContextRestored: () => message("Przywrócono wyświetlanie modelu."),
  });
  loadVariant(state.variant, state);
} catch (error) {
  console.error(error);
  $("#loading").hidden = true;
  $("#load-error").hidden = false;
  $("#error-message").textContent = "Przeglądarka nie uruchomiła grafiki 3D. Włącz akcelerację sprzętową lub otwórz plan w innej przeglądarce.";
  syncControls();
}
