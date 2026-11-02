import * as THREE from "three";

const position = ([x, y, z]) => new THREE.Vector3(x, z, -y);
const up = new THREE.Vector3(0, 1, 0);

// Uses the same metre-based route graph as the printed installation drawings.
export function createInstallations(scene) {
  const root = new THREE.Group();
  root.name = "installation-proposal";
  scene.add(root);
  let plan, state, active;
  const edges = [], points = [], picks = [], labels = [];
  const sphere = new THREE.SphereGeometry(0.065, 16, 10);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 8);
  const box = new THREE.BoxGeometry(1, 1, 1);

  function segment(a, b, color, radius, opacity, order) {
    const delta = b.clone().sub(a);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity,
      depthTest: false, depthWrite: false });
    const mesh = new THREE.Mesh(cylinder, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(up, delta.clone().normalize());
    mesh.scale.set(radius, delta.length(), radius);
    mesh.renderOrder = order;
    root.add(mesh);
    return mesh;
  }
  function badge(text, color) {
    const canvas = document.createElement("canvas");
    canvas.width = 144; canvas.height = 72;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.roundRect(3, 3, 138, 66, 15); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = "#18333d"; ctx.font = "bold 35px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, 72, 38);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture,
      depthTest: false, depthWrite: false, transparent: true }));
    sprite.renderOrder = 40;
    root.add(sprite);
    return sprite;
  }
  function setPlan(data) {
    if (plan === data) return;
    // Variants share one cached plan; dispose if a new plan is ever supplied.
    for (const child of [...root.children]) {
      child.material?.map?.dispose(); child.material?.dispose();
      if (child.isLine) child.geometry.dispose();
      root.remove(child);
    }
    edges.length = points.length = picks.length = labels.length = 0;
    plan = data;
    for (const edge of plan.edges) {
      const [a, b] = edge.points.map(position);
      const direction = b.clone().sub(a).normalize();
      const duct = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: "#859398",
        transparent: true, opacity: 0.22, depthWrite: false }));
      duct.position.copy(a).add(b).multiplyScalar(0.5);
      // Keep the shallow face against the ceiling, also across the room and
      // along its slope. Rotating only the length axis rolls transverse ducts.
      let normal = position(edge.surface_normal || [0, 0, 1]).normalize();
      normal.addScaledVector(direction, -normal.dot(direction));
      if (normal.lengthSq() < 0.01) normal.set(0, 0, 1);
      normal.normalize();
      const across = new THREE.Vector3().crossVectors(direction, normal).normalize();
      const lateral = across;
      duct.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, direction, normal));
      duct.scale.set(0.105, a.distanceTo(b), 0.05);
      root.add(duct);
      const wires = edge.systems.map(system => {
        const order = ["power", "lan", "av", "light"].indexOf(system);
        const offset = lateral.clone().multiplyScalar((order - 1.5) * 0.026);
        const mesh = segment(a.clone().add(offset), b.clone().add(offset), plan.systems[system].color, 0.013, 1, 22 + order);
        const kind = { high: "pod płaskim sufitem", slope: "wzdłuż skosu", eave: "przy tylnej ścianie", drop: "odgałęzienie do punktu" }[edge.kind] || "do punktu";
        mesh.userData = { system, edge: edge.id, label: edge.label || `${plan.systems[system].label} · ${kind}` };
        picks.push(mesh);
        return { mesh, system };
      });
      edges.push({ data: edge, duct, wires });
    }
    for (const point of plan.points) {
      const system = point.kind === "rack" || point.kind === "ap" ? "lan" : point.kind === "av" ? "av" : ["light", "control"].includes(point.kind) ? "light" : "power";
      const color = plan.systems[system].color;
      const anchor = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color, depthTest: false }));
      anchor.position.copy(position(point.position)); anchor.renderOrder = 30;
      anchor.userData = { group: `@${point.id}`, label: point.label, installation: true };
      root.add(anchor); picks.push(anchor);
      const sprite = badge(point.id, color);
      sprite.userData = anchor.userData;
      picks.push(sprite);
      const leader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([anchor.position, anchor.position]),
        new THREE.LineBasicMaterial({ color: "#73848a", transparent: true, opacity: 0.65, depthTest: false, depthWrite: false }));
      leader.renderOrder = 29; root.add(leader);
      let fixture;
      if (point.kind === "light") {
        fixture = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: "#bcb3d7", transparent: true, opacity: 0.65 }));
        fixture.position.copy(anchor.position); fixture.scale.set(0.6, 0.03, 0.3); root.add(fixture);
      }
      const record = { data: point, anchor, sprite, leader, fixture };
      points.push(record); labels.push(record);
    }
  }
  function visibleRoom(room) { return state.room === "all" || !room || state.room === room; }
  function show(next) {
    state = next;
    root.visible = Boolean(state.layers.cables);
    const selected = active?.replace(/^@/, "");
    const passage = ["X1", "X2"].includes(selected);
    const related = new Set(plan.connections.filter(c => c.source === selected || c.target === selected || (passage && c.edges.some(id => {
      const e = plan.edges.find(item => item.id === id); return e.a === selected || e.b === selected;
    }))).flatMap(c => c.edges));
    for (const { data, duct, wires } of edges) {
      duct.visible = visibleRoom(data.room) && data.systems.some(s => state.systems[s]);
      for (const { mesh, system } of wires) {
        mesh.visible = visibleRoom(data.room) && state.systems[system];
        mesh.material.opacity = !selected || related.has(data.id) ? 1 : 0.16;
      }
    }
    for (const point of points) {
      const show = visibleRoom(point.data.room) && point.data.systems.some(s => state.systems[s]);
      point.anchor.visible = point.sprite.visible = point.leader.visible = show;
      if (point.fixture) point.fixture.visible = show;
      point.anchor.scale.setScalar(point.data.id === selected ? 1.6 : 1);
    }
  }
  function highlight(code) { active = code?.startsWith("@") ? code : null; if (state) show(state); }
  function bounds(code) {
    const item = points.find(p => `@${p.data.id}` === code);
    return item?.anchor.visible && root.visible ? new THREE.Box3().setFromCenterAndSize(item.anchor.position, new THREE.Vector3(1.2, 0.8, 1.2)) : null;
  }
  function updateLabels(camera, width, height) {
    if (!root.visible) return;
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const used = [];
    const candidates = [[0,0],[0,-25],[0,25],[36,0],[-36,0],[0,-50],[0,50],[65,-20],[-65,-20]];
    const priority=["R0","X1","S5","S6","AP1","E0","X2","S1","S4"];
    const rank=p=>`@${p.data.id}`===active ? -1 : priority.includes(p.data.id) ? priority.indexOf(p.data.id) : 30;
    const visible=labels.filter(p=>p.anchor.visible).sort((a,b)=>rank(a)-rank(b));
    const limit=height<420 ? 3 : width<600 ? 9 : 30;
    let shown=0;
    for (const item of visible) {
      item.sprite.visible=item.leader.visible=false;
      if(shown>=limit)continue;
      const base = item.anchor.position.clone();
      if (state.projection === "2d") {
        base.x += item.data.label_offset[0]; base.z -= item.data.label_offset[1];
      } else base.y += item.data.kind === "light" ? 0.10 : 0.20;
      const depth = -base.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const units = camera.isOrthographicCamera ? (camera.top-camera.bottom)/camera.zoom/height : 2*depth*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height;
      const projected = base.clone().project(camera);
      if(depth<=0 || Math.abs(projected.x)>1.15 || Math.abs(projected.y)>1.15)continue;
      const x=(projected.x+1)*width/2, y=(1-projected.y)*height/2;
      let shift = null;
      for (const [dx,dy] of candidates) {
        const rect={x:x+dx-23,y:y+dy-12,w:46,h:24};
        if (rect.x<5 || rect.x+46>width-5 || rect.y<115 || rect.y+24>height-90) continue;
        if (!used.some(r=>rect.x<r.x+r.w && rect.x+rect.w>r.x && rect.y<r.y+r.h && rect.y+rect.h>r.y)) { shift=[dx,dy]; break; }
      }
      if(!shift)continue;
      shown++;
      item.sprite.visible=item.leader.visible=true;
      used.push({x:x+shift[0]-23,y:y+shift[1]-12,w:46,h:24});
      item.sprite.position.copy(base).addScaledVector(right, shift[0]*units).addScaledVector(cameraUp,-shift[1]*units);
      item.sprite.scale.set(44*units,22*units,1);
      const array=item.leader.geometry.attributes.position;
      array.setXYZ(0,item.anchor.position.x,item.anchor.position.y,item.anchor.position.z);
      array.setXYZ(1,item.sprite.position.x,item.sprite.position.y,item.sprite.position.z);
      array.needsUpdate=true;
      item.leader.geometry.computeBoundingSphere();
    }
  }
  return { setPlan, show, highlight, bounds, updateLabels,
    pickables: () => root.visible ? picks.filter(m=>m.visible) : [],
  };
}
