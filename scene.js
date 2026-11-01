import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createInstallations } from "./installations.js";

// Rendering is requested only by a scene change or an unfinished camera gesture.
export function createViewer(canvas, { onPick, onClear, onReset, onContextLost, onContextRestored }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const installations = createInstallations(scene);
  scene.background = new THREE.Color(0xf5f6f2);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc9c9b5, 1.8));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(4.5, 7.5, 5.5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.65);
  fill.position.set(-5.5, 5, -4);
  scene.add(fill);

  const perspective = new THREE.PerspectiveCamera(43, 1, 0.01, 1000);
  const orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  orthographic.up.set(0, 0, -1);
  let camera = perspective;
  let controls;
  let model;
  let meshes = [];
  let state = { room: "all", projection: "3d", layers: { walls: true, ceilings: false, zones: true, cables: true } };
  let frame = 0;
  let width = 1;
  let height = 1;
  let orthoHeight = 10;
  let fittedBox;
  let manuallyMoved = false;
  let contextLost = false;
  const selection = new THREE.Box3Helper(new THREE.Box3(), 0x246b58);
  selection.material.depthTest = false;
  selection.material.transparent = true;
  selection.renderOrder = 10;
  selection.visible = false;
  scene.add(selection);
  const raycaster = new THREE.Raycaster();

  function requestRender() {
    if (!frame && !contextLost && !document.hidden) frame = requestAnimationFrame(render);
  }
  function render() {
    frame = 0;
    controls.update(); // 'change' schedules the next frame while damping settles.
    installations.updateLabels(camera, width, height);
    renderer.render(scene, camera);
  }
  function makeControls() {
    controls?.dispose();
    controls = new OrbitControls(camera, canvas);
    controls.enableDamping = !matchMedia("(prefers-reduced-motion: reduce)").matches;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.maxPolarAngle = state.projection === "3d" ? Math.PI / 2 - 0.02 : Math.PI;
    controls.minDistance = 0.4;
    controls.maxDistance = 60;
    controls.minZoom = 0.3;
    controls.maxZoom = 12;
    controls.enableRotate = state.projection === "3d";
    if (!controls.enableRotate) {
      controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
      controls.touches.ONE = THREE.TOUCH.PAN;
      controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
    }
    controls.listenToKeyEvents(canvas);
    controls.addEventListener("change", requestRender);
    controls.addEventListener("start", () => { manuallyMoved = true; });
  }
  makeControls();

  function boxFor(predicate) {
    const box = new THREE.Box3();
    for (const mesh of meshes) if (predicate(mesh)) box.union(mesh.userData.bounds);
    return box.isEmpty() ? null : box;
  }
  function currentBox() {
    return boxFor(mesh => mesh.visible && mesh.userData.kind !== "cables");
  }
  function fit(box = currentBox()) {
    if (!box || box.isEmpty()) return;
    fittedBox = box.clone();
    manuallyMoved = false;
    // Recreate controls to discard pending damping before moving to a new target.
    makeControls();
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const aspect = width / height;
    const usableWidth = Math.max(0.6, (width - 48) / width);
    const usableHeight = Math.max(0.4, (height - 220) / height);
    camera.zoom = 1;
    if (state.projection === "2d") {
      orthoHeight = Math.max(size.z / usableHeight, size.x / (aspect * usableWidth), 1) * 1.08;
      camera.position.copy(center).add(new THREE.Vector3(0, Math.max(size.length(), 10), 0));
      camera.left = -orthoHeight * aspect / 2;
      camera.right = orthoHeight * aspect / 2;
      camera.top = orthoHeight / 2;
      camera.bottom = -orthoHeight / 2;
    } else {
      const direction = new THREE.Vector3(state.room === "307" ? -0.75 : 0.85, 0.95, 1.1).normalize();
      camera.position.copy(center).add(direction);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const inverseRotation = camera.quaternion.clone().invert();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * usableHeight;
      const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * usableWidth;
      let distance = 1.5;
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
        const point = new THREE.Vector3(x, y, z).sub(center).applyQuaternion(inverseRotation);
        distance = Math.max(distance, Math.abs(point.x) / tanH + point.z, Math.abs(point.y) / tanV + point.z);
      }
      camera.position.copy(center).addScaledVector(direction, distance * 1.06);
    }
    camera.updateProjectionMatrix();
    controls.target.copy(center);
    controls.update();
    requestRender();
  }
  function resize() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    renderer.setSize(width, height, false);
    perspective.aspect = width / height;
    perspective.updateProjectionMatrix();
    orthographic.left = -orthoHeight * width / height / 2;
    orthographic.right = orthoHeight * width / height / 2;
    orthographic.updateProjectionMatrix();
    if (!manuallyMoved && model) fit(fittedBox || currentBox());
    requestRender();
  }

  function setModel(root, layout, installationPlan) {
    if (model) scene.remove(model);
    model = root;
    scene.add(model);
    installations.setPlan(installationPlan);
    model.updateMatrixWorld(true);
    meshes = [];
    const records = [...layout.equipment, ...layout.zones, ...layout.cable_paths].sort((a, b) => b.id.length - a.id.length);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      const name = mesh.name.toLowerCase();
      const record = records.find(item => mesh.name === item.id || mesh.name.startsWith(`${item.id}_`));
      const group = layout.schedule_groups.find(item => item.items.includes(record?.id));
      let kind = "equipment";
      if (name.startsWith("cable_")) kind = "cables";
      else if (name.startsWith("zone_")) kind = "zones";
      else if (name.startsWith("room_")) {
        if (name.includes("ceiling") || name.includes("roof_window")) kind = "ceilings";
        else if (name.includes("wall")) kind = "walls";
        else kind = "architecture";
      }
      mesh.userData = {
        kind, group: group?.code, label: record?.label,
        room: record?.room || name.match(/^room_(307|308)_/)?.[1],
        bounds: new THREE.Box3().setFromObject(mesh),
      };
      meshes.push(mesh);
      if (root.userData.prepared) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        material.side = THREE.DoubleSide;
        material.roughness = Math.max(material.roughness ?? 0.65, 0.62);
        const materialName = material.name.toLowerCase();
        let opacity = 1;
        if (materialName.includes("ceiling")) opacity = 0.18;
        else if (materialName.includes("zone")) opacity = 0.38;
        else if (materialName.includes("wall")) opacity = 0.26;
        else if (materialName.includes("window_glass")) opacity = 0.48;
        if (opacity < 1) {
          material.transparent = true;
          material.opacity = opacity;
          material.depthWrite = false;
        }
        material.userData.originalOpacity = opacity;
        material.userData.originalDepthWrite = material.depthWrite;
      }
    });
    // Cable names may mention both rooms. Assign each rendered segment by its
    // position so an isolated room does not retain the other room's wiring.
    const floors = meshes.filter(mesh => /room_\d+_floor/i.test(mesh.name));
    for (const mesh of meshes.filter(mesh => mesh.userData.kind === "cables")) {
      const center = mesh.userData.bounds.getCenter(new THREE.Vector3());
      let nearest;
      let distance = Infinity;
      for (const floor of floors) {
        const bounds = floor.userData.bounds;
        const dx = Math.max(bounds.min.x - center.x, 0, center.x - bounds.max.x);
        const dz = Math.max(bounds.min.z - center.z, 0, center.z - bounds.max.z);
        if (dx * dx + dz * dz < distance) {
          distance = dx * dx + dz * dz;
          nearest = floor.userData.room;
        }
      }
      mesh.userData.room = nearest;
    }
    root.userData.prepared = true;
    fittedBox = null;
    manuallyMoved = false;
    selection.visible = false;
  }
  function show(nextState, refit = false) {
    const changedProjection = state.projection !== nextState.projection;
    state = { ...nextState, layers: { ...nextState.layers } };
    if (changedProjection) {
      camera = state.projection === "2d" ? orthographic : perspective;
      makeControls();
    }
    for (const mesh of meshes) {
      const { kind, room } = mesh.userData;
      const roomVisible = state.room === "all" || !room || room === state.room;
      const layerVisible = kind === "ceilings" ? state.layers.ceilings && state.projection !== "2d" : state.layers[kind] !== false;
      mesh.visible = roomVisible && layerVisible && kind !== "cables";
      // The old AP block was a placeholder; the proposal places AP1 on the wall.
      if (state.mode === "installations" && mesh.name.startsWith("router_ap_")) mesh.visible = false;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const original = material.userData.originalOpacity ?? material.opacity;
        material.opacity = state.mode === "installations" && kind === "equipment" ? Math.min(original, 0.28) : original;
        material.transparent = material.opacity < 1;
        material.depthWrite = state.mode === "installations" && kind === "equipment" ? false : material.userData.originalDepthWrite ?? true;
      }
    }
    installations.show(state);
    if (refit || changedProjection) fit();
    requestRender();
  }
  function highlight(code) {
    installations.highlight(code);
    const box = code && boxFor(mesh => mesh.visible && mesh.userData.group === code);
    selection.visible = Boolean(box);
    if (box) selection.box.copy(box).expandByScalar(0.025);
    requestRender();
  }
  function focusGroup(code) {
    fit(code?.startsWith("@") ? installations.bounds(code) : boxFor(mesh => mesh.visible && mesh.userData.group === code));
  }
  function zoom(factor) {
    manuallyMoved = true;
    if (camera.isOrthographicCamera) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * factor, controls.minZoom, controls.maxZoom);
      camera.updateProjectionMatrix();
    } else {
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(offset.length() / factor, controls.minDistance, controls.maxDistance);
      camera.position.copy(controls.target).add(offset.setLength(length));
    }
    controls.update();
    requestRender();
  }

  let gesture;
  const pointers = new Set();
  canvas.addEventListener("pointerdown", event => {
    pointers.add(event.pointerId);
    if (pointers.size !== 1) { gesture = null; return; }
    gesture = event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false } : null;
  });
  canvas.addEventListener("pointermove", event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 6) gesture.moved = true;
  });
  canvas.addEventListener("pointercancel", event => { pointers.delete(event.pointerId); gesture = null; });
  canvas.addEventListener("pointerup", event => {
    pointers.delete(event.pointerId);
    const click = gesture;
    gesture = null;
    if (!model || !click || click.moved || click.id !== event.pointerId || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    // Invisible meshes still participate in Three.js raycasting unless filtered out.
    const installHits = raycaster.intersectObjects(installations.pickables(), false);
    const installation = installHits.find(hit => hit.object.userData.installation);
    if (installation) { onPick(installation.object.userData); return; }
    const hits = raycaster.intersectObjects(meshes.filter(mesh => mesh.visible), false);
    const hit = hits.find(entry => entry.object.userData.group) || hits.find(entry => entry.object.userData.label);
    if (hit && state.mode !== "installations") onPick(hit.object.userData);
    else if (installHits.length) onPick(installHits[0].object.userData);
  });
  canvas.addEventListener("keydown", event => {
    if (["+", "=", "-", "0", "Escape"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "0") onReset();
      else if (event.key === "Escape") onClear();
      else zoom(event.key === "-" ? 1 / 1.2 : 1.2);
    }
    if (event.key.startsWith("Arrow")) manuallyMoved = true;
  });
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    onContextLost();
  });
  canvas.addEventListener("webglcontextrestored", () => { contextLost = false; onContextRestored(); requestRender(); });
  document.addEventListener("visibilitychange", requestRender);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas.parentElement);
  resize();
  return {
    setModel, show, highlight, focusGroup, zoom, fit,
    exportImage() {
      installations.updateLabels(camera, width, height);
      renderer.render(scene, camera);
      return new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    },
  };
}
