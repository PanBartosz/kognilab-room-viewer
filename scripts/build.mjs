import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

const appFiles = [
  "app.js",
  "favicon.ico",
  "favicon.svg",
  "index.html",
  "styles.css",
];

const vendorFiles = [
  ["node_modules/three/build/three.module.js", "vendor/three.module.js"],
  ["node_modules/three/build/three.core.js", "vendor/three.core.js"],
  [
    "node_modules/three/examples/jsm/controls/OrbitControls.js",
    "vendor/controls/OrbitControls.js",
  ],
  [
    "node_modules/three/examples/jsm/loaders/GLTFLoader.js",
    "vendor/loaders/GLTFLoader.js",
  ],
  [
    "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
    "vendor/utils/BufferGeometryUtils.js",
  ],
];

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const file of appFiles) {
  await cp(join(root, file), join(dist, file));
}
await cp(join(root, "assets"), join(dist, "assets"), { recursive: true });

for (const [source, target] of vendorFiles) {
  const targetPath = join(dist, target);
  await mkdir(dirname(targetPath), { recursive: true });
  await cp(join(root, source), targetPath);
}

console.log(`Zbudowano ${dist}`);
