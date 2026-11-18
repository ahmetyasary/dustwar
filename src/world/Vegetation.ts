import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import type { Terrain } from './Terrain';
import { TAU, mulberry32, range, smoothstep, type Rng } from '../utils/math';

export interface Collider {
  x: number;
  z: number;
  r: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Geometriyi döndür (YXZ: önce eğim, sonra yön), ölçekle ve taşı. */
function xf(geo: THREE.BufferGeometry, pos: THREE.Vector3, rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ'));
  _m.compose(pos, _q, _s.set(...scale));
  return geo.applyMatrix4(_m);
}

/** Her köşeye konumuna göre renk verir. */
function paint(geo: THREE.BufferGeometry, fn: (p: THREE.Vector3, out: THREE.Color) => void) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i);
    fn(_p, c);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}
const solid = (hex: number) => {
  const k = new THREE.Color(hex);
  return (_: THREE.Vector3, out: THREE.Color) => void out.copy(k);
};

/** Kesiti yıldız biçiminde (kaburgalı) bir tüp — kaktüs gövdesi ve kolları. */
function ribbedTube(points: THREE.Vector3[], radius: number, ribs: number, depth = 0.14) {
  const curve = new THREE.CatmullRomCurve3(points);
  const tub = Math.max(6, Math.ceil(curve.getLength() / 0.12));
  const rad = ribs * 4;
  const geo = new THREE.TubeGeometry(curve, tub, radius, rad, false);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const c = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, c);
    for (let j = 0; j <= rad; j++) {
      const idx = i * (rad + 1) + j;
      _p.fromBufferAttribute(pos, idx).sub(c);
      const a = (j / rad) * TAU;
      const k = 1 - depth + depth * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 0.6);
      _p.multiplyScalar(k).add(c);
      pos.setXYZ(idx, _p.x, _p.y, _p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function ribbedDome(center: THREE.Vector3, radius: number, ribs: number, depth = 0.14, thetaLen = Math.PI / 2, segs = 8) {
  const geo = new THREE.SphereGeometry(radius, ribs * 4, segs, 0, TAU, 0, thetaLen);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 - depth + depth * Math.pow(Math.abs(Math.cos((a * ribs) / 2)), 0.6);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo.translate(center.x, center.y, center.z);
}

// ---------------------------------------------------------------- kaktüsler

const cactusGreen = new THREE.Color(0x4b7b3b);
const cactusBase = new THREE.Color(0x6e6b48);
const paintCactus = (p: THREE.Vector3, out: THREE.Color) =>
  void out.copy(cactusBase).lerp(cactusGreen, smoothstep(-0.2, 0.9, p.y));

function saguaro(rng: Rng, arms: number) {
  const h = range(rng, 3.4, 5.2);
  const r = range(rng, 0.27, 0.32);
  const lx = (rng() - 0.5) * 0.25;
  const lz = (rng() - 0.5) * 0.25;
  const top = V(lx, h, lz);
  const parts: THREE.BufferGeometry[] = [ribbedTube([V(0, -0.6, 0), V(lx * 0.3, h * 0.5, lz * 0.3), top], r, 12), ribbedDome(top, r, 12)];

  let ang = rng() * TAU;
  for (let a = 0; a < arms; a++) {
    ang += (TAU / Math.max(arms, 2)) * range(rng, 0.7, 1.2);
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const y0 = h * range(rng, 0.35, 0.6);
    const out = range(rng, 0.5, 0.68);
    const up = range(rng, 0.7, 1.6);
    const ar = r * 0.64;
    const pts = [
      V(dx * r * 0.2, y0, dz * r * 0.2),
      V(dx * out * 0.7, y0 + 0.05, dz * out * 0.7),
      V(dx * out, y0 + 0.35, dz * out),
      V(dx * out * 1.02, y0 + 0.35 + up, dz * out * 1.02),
    ];
    parts.push(ribbedTube(pts, ar, 10), ribbedDome(pts[3], ar, 10));
  }
  parts.forEach((g) => paint(g, paintCactus));

  // çiçekler (saguaro çiçekleri beyazdır)
  if (rng() < 0.6) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + rng();
      const f = new THREE.SphereGeometry(0.055, 8, 6);
      xf(f, V(top.x + Math.cos(a) * r * 0.55, top.y + r * 0.75, top.z + Math.sin(a) * r * 0.55));
      parts.push(paint(f, solid(0xf3eedc)));
    }
  }
  return mergeGeometries(parts)!;
}

function barrelCactus(rng: Rng) {
  const body = ribbedDome(V(0, 0, 0), 0.42, 18, 0.12, Math.PI * 0.62, 16);
  body.scale(1, 1.15, 1).translate(0, 0.08, 0);
  const green = new THREE.Color(0x5d7e36);
  const top = new THREE.Color(0x87a04a);
  paint(body, (p, out) => void out.copy(green).lerp(top, smoothstep(0.1, 0.55, p.y)));
  const parts: THREE.BufferGeometry[] = [body];
  const flowers = 6 + Math.floor(rng() * 4);
  for (let k = 0; k < flowers; k++) {
    const a = (k / flowers) * TAU;
    const f = new THREE.ConeGeometry(0.045, 0.1, 6);
    xf(f, V(Math.cos(a) * 0.12, 0.56, Math.sin(a) * 0.12), [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3]);
    parts.push(paint(f, solid(rng() < 0.5 ? 0xe9b52f : 0xd8562c)));
  }
  return mergeGeometries(parts)!;
}

function pricklyPear(rng: Rng) {
  const pads: [number, number, number, number][] = [
    [0, 0.3, 0, 0],
    [0.22, 0.64, 0.02, -0.45],
    [-0.2, 0.62, -0.02, 0.42],
    [0.06, 0.98, 0.04, -0.12],
    [0.42, 0.95, 0.0, -0.7],
  ];
  const n = 2 + Math.floor(rng() * 4);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const [x, y, z, rz] = pads[i];
    const g = new THREE.SphereGeometry(0.26, 18, 12);
    g.scale(1, 1.25, 0.26);
    g.rotateZ(rz);
    g.rotateY((rng() - 0.5) * 0.8);
    g.translate(x, y, z);
    parts.push(paint(g, solid(0x6a8d3f)));
    if (i > 0 && rng() < 0.7) {
      const fr = new THREE.SphereGeometry(0.05, 8, 6);
      fr.scale(1, 1.3, 1);
      fr.translate(x - Math.sin(rz) * 0.3, y + Math.cos(rz) * 0.32, z);
      parts.push(paint(fr, solid(0x9a2556)));
    }
  }
  return mergeGeometries(parts)!;
}

// ---------------------------------------------------------------- kayalar

/** Kum taşı: gürültüyle bozulmuş, katmanlı renkli, köşeli kaya. */
function rockGeometry(rng: Rng, flatTop = false) {
  const noise = new SimplexNoise({ random: rng });
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    _p.fromBufferAttribute(pos, i).normalize();
    const d = 1 + 0.28 * noise.noise3d(_p.x * 1.4, _p.y * 1.4, _p.z * 1.4) + 0.08 * noise.noise3d(_p.x * 4, _p.y * 4, _p.z * 4);
    _p.multiplyScalar(d);
    if (flatTop && _p.y > 0.5) _p.y = 0.5 + (_p.y - 0.5) * 0.12;
    if (_p.y < -0.3) _p.y = -0.3 + (_p.y + 0.3) * 0.3;
    pos.setXYZ(i, _p.x, _p.y, _p.z);
  }
  geo.computeVertexNormals();
  const base = new THREE.Color(0xb3744a);
  const light = new THREE.Color(0xd8a06c);
  const dark = new THREE.Color(0x7d4a30);
  paint(geo, (p, out) => {
    const band = Math.sin(p.y * 13 + noise.noise(p.x * 2, p.z * 2) * 1.5) * 0.5 + 0.5;
    out.copy(base).lerp(light, band * 0.6).lerp(dark, smoothstep(0.2, -0.3, p.y) * 0.5);
  });
  return geo;
}

// ---------------------------------------------------------------- çalılar

function deadBush(rng: Rng) {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.Color(0x5e4c3a);
  const tip = new THREE.Color(0x9b8466);
  const tipPoint = new THREE.Vector3();
  const q = new THREE.Quaternion();
  for (let i = 0; i < 14; i++) {
    const len = range(rng, 0.35, 0.8);
    const tilt = range(rng, 0.25, 1.1);
    const yaw = rng() * TAU;
    const b = new THREE.CylinderGeometry(0.008, 0.022, len, 4).translate(0, len / 2, 0);
    xf(b, V(0, 0, 0), [tilt, yaw, 0]);
    parts.push(b);
    q.setFromEuler(_e.set(tilt, yaw, 0, 'YXZ'));
    tipPoint.set(0, len * range(rng, 0.5, 0.95), 0).applyQuaternion(q);
    for (let k = 0; k < 2; k++) {
      const l2 = range(rng, 0.12, 0.28);
      const t = new THREE.CylinderGeometry(0.005, 0.01, l2, 3).translate(0, l2 / 2, 0);
      xf(t, tipPoint, [tilt + range(rng, -0.6, 0.6), yaw + range(rng, -0.8, 0.8), 0]);
      parts.push(t);
    }
  }
  const g = mergeGeometries(parts)!;
  return paint(g, (p, out) => void out.copy(stem).lerp(tip, smoothstep(0, 0.6, p.y)));
}

function grassTuft(rng: Rng) {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const len = range(rng, 0.25, 0.6);
    const b = new THREE.ConeGeometry(0.02, len, 3).translate(0, len / 2, 0);
    xf(b, V((rng() - 0.5) * 0.12, 0, (rng() - 0.5) * 0.12), [range(rng, 0.1, 0.7), rng() * TAU, 0]);
    parts.push(b);
  }
  const base = new THREE.Color(0x7a773a);
  const tip = new THREE.Color(0xdccb8c);
  return paint(mergeGeometries(parts)!, (p, out) => void out.copy(base).lerp(tip, smoothstep(0, 0.5, p.y)));
}

// ---------------------------------------------------------------- yerleştirme

interface Item {
  x: number;
  z: number;
  sink: number;
  yaw: number;
  tilt: number;
  scale: [number, number, number];
  tint: number;
}

export class Vegetation {
  readonly colliders: Collider[] = [];

  constructor(scene: THREE.Scene, terrain: Terrain, seed = 11) {
    const rng = mulberry32(seed);
    const occupied: Collider[] = [];
    const R = terrain.playRadius;

    const isFree = (x: number, z: number, r: number) => {
      if (Math.hypot(x, z) < 7 + r) return false; // başlangıç alanı boş kalsın
      for (const o of occupied) {
        const dx = o.x - x;
        const dz = o.z - z;
        if (dx * dx + dz * dz < (o.r + r) ** 2) return false;
      }
      return true;
    };
    const randomPoint = (rMin: number, rMax: number): [number, number] => {
      const a = rng() * TAU;
      const d = Math.sqrt(rMin * rMin + rng() * (rMax * rMax - rMin * rMin));
      return [Math.cos(a) * d, Math.sin(a) * d];
    };

    const place = (
      count: number,
      rMin: number,
      rMax: number,
      spacing: number,
      make: () => Omit<Item, 'x' | 'z'>,
      collide?: (it: Item) => number,
      check = true,
    ) => {
      const items: Item[] = [];
      for (let n = 0; n < count; n++) {
        for (let tries = 0; tries < 25; tries++) {
          const [x, z] = randomPoint(rMin, rMax);
          if (check && !isFree(x, z, spacing)) continue;
          const it = { x, z, ...make() };
          if (check) occupied.push({ x, z, r: spacing });
          const cr = collide?.(it) ?? 0;
          if (cr > 0) this.colliders.push({ x, z, r: cr });
          items.push(it);
          break;
        }
      }
      return items;
    };

    const tint = () => range(rng, 0.85, 1.12);
    const addInstanced = (geo: THREE.BufferGeometry, mat: THREE.Material, items: Item[], cast = true) => {
      if (!items.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, items.length);
      const col = new THREE.Color();
      items.forEach((it, i) => {
        const y = terrain.heightAt(it.x, it.z) - it.sink;
        _q.setFromEuler(_e.set(it.tilt, it.yaw, it.tilt * 0.5, 'YXZ'));
        _m.compose(_p.set(it.x, y, it.z), _q, _s.set(...it.scale));
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, col.setRGB(it.tint, it.tint * range(rng, 0.97, 1.03), it.tint * range(rng, 0.92, 1.0)));
      });
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      scene.add(mesh);
    };

    const cactusMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });

    // Uzak kayalık tepeler (mesa / butte) — haritanın çevresinde siluet
    const buttes = place(16, 135, 195, 14, () => {
      const w = range(rng, 14, 30);
      return { sink: 4, yaw: rng() * TAU, tilt: 0, scale: [w, range(rng, 10, 24), w * range(rng, 0.6, 1.1)], tint: tint() };
    });
    addInstanced(rockGeometry(rng, true), rockMat, buttes);

    // Saguaro kaktüsleri (0–3 kollu dört varyant)
    for (let arms = 0; arms < 4; arms++) {
      const items = place(
        32,
        9,
        R,
        2.6,
        () => {
          const s = range(rng, 0.8, 1.15);
          return { sink: 0.05, yaw: rng() * TAU, tilt: range(rng, 0, 0.06), scale: [s, s, s], tint: tint() };
        },
        (it) => 0.36 * it.scale[0],
      );
      addInstanced(saguaro(rng, arms), cactusMat, items);
    }

    // Fıçı kaktüsleri ve dikenli incir
    for (let v = 0; v < 2; v++) {
      addInstanced(
        barrelCactus(rng),
        cactusMat,
        place(
          45,
          8,
          R,
          1.1,
          () => {
            const s = range(rng, 0.6, 1.3);
            return { sink: 0.04, yaw: rng() * TAU, tilt: range(rng, 0, 0.12), scale: [s, s * range(rng, 0.85, 1.2), s], tint: tint() };
          },
          (it) => 0.4 * it.scale[0],
        ),
      );
      addInstanced(
        pricklyPear(rng),
        cactusMat,
        place(
          40,
          8,
          R,
          1.4,
          () => {
            const s = range(rng, 0.8, 1.4);
            return { sink: 0.05, yaw: rng() * TAU, tilt: 0, scale: [s, s, s], tint: tint() };
          },
          (it) => 0.45 * it.scale[0],
        ),
      );
    }

    // Kayalar: büyük kayalar, orta taşlar, çakıl
    for (let v = 0; v < 3; v++) {
      const big = place(
        22,
        12,
        R,
        2.5,
        () => {
          const s = range(rng, 1.2, 2.6);
          return { sink: 0.35 * s, yaw: rng() * TAU, tilt: range(rng, 0, 0.3), scale: [s * range(rng, 0.9, 1.4), s * range(rng, 0.55, 0.9), s], tint: tint() };
        },
        (it) => it.scale[0] * 0.85,
      );
      const small = place(
        70,
        6,
        R,
        0.5,
        () => {
          const s = range(rng, 0.12, 0.55);
          return { sink: 0.2 * s, yaw: rng() * TAU, tilt: range(rng, 0, 0.5), scale: [s, s * range(rng, 0.5, 0.9), s * range(rng, 0.8, 1.2)], tint: tint() };
        },
      );
      addInstanced(rockGeometry(rng), rockMat, [...big, ...small]);
    }

    // Kuru çalılar ve çöl otları
    for (let v = 0; v < 2; v++) {
      addInstanced(
        deadBush(rng),
        plantMat,
        place(110, 6, R, 0.7, () => {
          const s = range(rng, 0.7, 1.5);
          return { sink: 0.03, yaw: rng() * TAU, tilt: 0, scale: [s, s * range(rng, 0.7, 1.1), s], tint: tint() };
        }),
      );
      addInstanced(
        grassTuft(rng),
        plantMat,
        place(
          220,
          3,
          R,
          0.3,
          () => {
            const s = range(rng, 0.7, 1.4);
            return { sink: 0.02, yaw: rng() * TAU, tilt: 0, scale: [s, s, s], tint: tint() };
          },
          undefined,
          false,
        ),
        false,
      );
    }
  }
}
