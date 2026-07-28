import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.querySelector("#scene");
const statusEl = document.querySelector("#status");
const equipmentListEl = document.querySelector("#equipment-list");
const variantTitleEl = document.querySelector("#variant-title");

const variants = {
  a: {
    layout: "./assets/equipment_layout_a.json",
    model: "./assets/kogni_lab_equipped_307_308.glb",
  },
  b: {
    layout: "./assets/equipment_layout_b.json",
    model: "./assets/kogni_lab_equipped_307_308_variant_b.glb",
  },
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf3f4f1);

const camera = new THREE.PerspectiveCamera(43, 1, 0.01, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0xd7d0c4, 2.3);
scene.add(hemi);

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(4.5, 7.5, 5.5);
key.castShadow = true;
scene.add(key);

const fill = new THREE.DirectionalLight(0xffffff, 0.9);
fill.position.set(-5.5, 5.0, -4.0);
scene.add(fill);

let model = null;
let layout = null;
let activeVariant = "a";
let loadSequence = 0;
let activeView = "overview";
const layerVisibility = { ceilings: true, zones: true, cables: true };
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function resize() {
  const { clientWidth, clientHeight } = canvas.parentElement;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(1, clientHeight);
  camera.updateProjectionMatrix();
}

function cleanName(name) {
  return name
    .replace(/_/g, " ")
    .replace(/\bObj\b/g, "")
    .replace(/\bsegment\s+\d+\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function objectBox(predicate) {
  const box = new THREE.Box3();
  let found = false;
  if (!model) return null;
  model.traverse((object) => {
    if (!object.isMesh || !predicate(object)) return;
    box.expandByObject(object);
    found = true;
  });
  return found ? box : null;
}

function fitBox(box, view = "iso") {
  if (!box || box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const radius = Math.max(size.length() * 0.5, 1);
  const fitScale = {
    iso: 1.15,
    room307: 0.9,
    room308: 0.9,
    top: 0.72,
  }[view] ?? 1.2;
  const distance = (radius / Math.sin(fov / 2)) * fitScale;
  let direction = new THREE.Vector3(0.9, 0.72, 1.0).normalize();

  camera.up.set(0, 1, 0);
  if (view === "room307") {
    direction = new THREE.Vector3(-0.75, 0.72, 1.05).normalize();
  } else if (view === "room308") {
    direction = new THREE.Vector3(0.82, 0.72, 1.08).normalize();
  } else if (view === "top") {
    direction = new THREE.Vector3(0.001, 1, 0.001).normalize();
    camera.up.set(0, 0, -1);
  }

  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.01, distance / 100);
  camera.far = distance * 100;
  camera.updateProjectionMatrix();
  controls.target.copy(center);
  controls.update();
}

function focusView(view) {
  activeView = view;
  if (view === "top") {
    layerVisibility.ceilings = false;
    document.querySelector("#toggle-ceilings").checked = false;
  }
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  updateModelVisibility();
  const belongsToRoom = (object, room) => {
    const name = object.name.toLowerCase();
    if (name.startsWith("cable_") || name.includes(" cable ")) return false;
    return name.includes(`_${room}`) || name.includes(`room_${room}`);
  };
  if (view === "room307") {
    fitBox(objectBox((object) => belongsToRoom(object, "307")), "room307");
  } else if (view === "room308") {
    fitBox(objectBox((object) => belongsToRoom(object, "308")), "room308");
  } else if (view === "top") {
    fitBox(objectBox(() => true), "top");
  } else {
    fitBox(objectBox(() => true), "iso");
  }
}

function setLayerVisibility(kind, visible) {
  layerVisibility[kind] = visible;
  updateModelVisibility();
}

function updateModelVisibility() {
  if (!model) return;
  model.traverse((object) => {
    if (!object.isMesh) return;
    const name = object.name.toLowerCase();
    const belongs307 = name.includes("307");
    const belongs308 = name.includes("308");
    const hiddenByRoom =
      (activeView === "room307" && belongs308 && !belongs307) ||
      (activeView === "room308" && belongs307 && !belongs308);
    const isCeiling = name.includes("ceiling") || name.includes("roof_window");
    const hiddenByLayer =
      (isCeiling && !layerVisibility.ceilings) ||
      (name.includes("zone") && !layerVisibility.zones) ||
      (name.includes("cable") && !layerVisibility.cables);
    object.visible = !hiddenByRoom && !hiddenByLayer;
  });
}

function groupBox(group) {
  const itemIds = new Set(group.items || []);
  return objectBox((object) => {
    for (const itemId of itemIds) {
      if (object.name.startsWith(itemId)) return true;
    }
    return false;
  });
}

function renderEquipmentList() {
  equipmentListEl.replaceChildren();
  for (const group of layout?.schedule_groups || []) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <span class="code">${group.code}</span>
      <span>
        <span class="label">${group.label}</span>
        <span class="room">Pokój ${group.room}</span>
      </span>
    `;
    button.addEventListener("click", () => {
      activeView = `room${group.room}`;
      document.querySelectorAll("[data-view]").forEach((viewButton) => {
        viewButton.classList.toggle("active", viewButton.dataset.view === activeView);
      });
      updateModelVisibility();
      fitBox(groupBox(group), group.room === "307" ? "room307" : "room308");
      statusEl.textContent = `${group.code}: ${group.label}`;
    });
    item.appendChild(button);
    equipmentListEl.appendChild(item);
  }
}

function applyModelMaterials(root) {
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.side = THREE.DoubleSide;
      material.roughness = Math.max(material.roughness ?? 0.65, 0.62);
      const lower = material.name.toLowerCase();
      if (lower.includes("ceiling")) {
        material.transparent = true;
        material.opacity = 0.28;
        material.depthWrite = false;
      }
      if (lower.includes("zone")) {
        material.transparent = true;
        material.opacity = 0.46;
        material.depthWrite = false;
      }
      if (lower.includes("wall")) {
        material.transparent = true;
        material.opacity = 0.55;
        material.depthWrite = false;
      }
      if (lower.includes("window_glass")) {
        material.transparent = true;
        material.opacity = 0.62;
        material.depthWrite = false;
      }
    }
  });
}

async function loadScene() {
  await loadVariant("a");
}

function disposeModel(root) {
  root?.traverse((object) => {
    if (!object.isMesh) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) material?.dispose();
  });
}

async function loadVariant(variantId) {
  const config = variants[variantId];
  if (!config) return;
  const sequence = ++loadSequence;
  activeVariant = variantId;
  document.querySelectorAll("[data-variant]").forEach((button) => {
    button.classList.toggle("active", button.dataset.variant === variantId);
    button.disabled = true;
  });
  statusEl.textContent = `Ładowanie wariantu ${variantId.toUpperCase()}`;

  try {
    const [layoutResponse, gltf] = await Promise.all([
      fetch(config.layout, { cache: "no-store" }),
      new GLTFLoader().loadAsync(config.model),
    ]);
    if (!layoutResponse.ok) throw new Error(`HTTP ${layoutResponse.status}: ${config.layout}`);
    const nextLayout = await layoutResponse.json();
    if (sequence !== loadSequence) return;

    if (model) {
      scene.remove(model);
      disposeModel(model);
    }
    layout = nextLayout;
    model = gltf.scene;
    applyModelMaterials(model);
    scene.add(model);
    variantTitleEl.textContent = layout.variant?.name ?? `Wariant ${variantId.toUpperCase()}`;
    renderEquipmentList();
    resize();
    focusView(activeView);
    statusEl.textContent = `${layout.variant?.label ?? `Wariant ${variantId.toUpperCase()}`}: model gotowy`;
  } catch (error) {
    if (sequence === loadSequence) statusEl.textContent = `Nie udało się załadować wariantu ${variantId.toUpperCase()}`;
    console.error(error);
  } finally {
    if (sequence === loadSequence) {
      document.querySelectorAll("[data-variant]").forEach((button) => {
        button.disabled = false;
      });
    }
  }
}

canvas.addEventListener("pointerdown", (event) => {
  if (!model) return;
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObject(model, true);
  const hit = hits.find((entry) => entry.object?.isMesh);
  if (hit) {
    statusEl.textContent = cleanName(hit.object.name);
  }
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => focusView(button.dataset.view));
});

document.querySelectorAll("[data-variant]").forEach((button) => {
  button.addEventListener("click", () => loadVariant(button.dataset.variant));
});

document.querySelector("#toggle-ceilings").addEventListener("change", (event) => {
  setLayerVisibility("ceilings", event.target.checked);
});

document.querySelector("#toggle-zones").addEventListener("change", (event) => {
  setLayerVisibility("zones", event.target.checked);
});

document.querySelector("#toggle-cables").addEventListener("change", (event) => {
  setLayerVisibility("cables", event.target.checked);
});

window.addEventListener("resize", resize);

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

resize();
loadScene();
animate();
