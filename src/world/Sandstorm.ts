import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Terrain } from './Terrain';
import { damp, range, wrap } from '../utils/math';
import { softDotTexture } from '../utils/textures';

/** Oyuncunun etrafındaki bir kutuda rüzgârla sürüklenen, kutu kenarında sarılan parçacıklar. */
class DriftParticles {
  readonly points: THREE.Points;
  readonly material: THREE.PointsMaterial;
  private readonly pos: Float32Array;
  private readonly seed: Float32Array;

  constructor(
    count: number,
    private readonly half: THREE.Vector3,
    private readonly yMin: number,
    private readonly speedMul: number,
    material: THREE.PointsMaterial,
  ) {
    this.pos = new Float32Array(count * 3);
    this.seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = (Math.random() * 2 - 1) * half.x;
      // zemine yakın daha yoğun
      this.pos[i * 3 + 1] = yMin + Math.pow(Math.random(), 2) * (half.y - yMin);
      this.pos[i * 3 + 2] = (Math.random() * 2 - 1) * half.z;
      this.seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.material = material;
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
  }

  update(dt: number, center: THREE.Vector3, wind: THREE.Vector2, speed: number, time: number) {
    const { pos, seed, half } = this;
    const px = -wind.y;
    const pz = wind.x;
    const span = half.y - this.yMin;
    for (let i = 0; i < seed.length; i++) {
      const s = seed[i];
      const v = speed * this.speedMul * (0.6 + s * 0.8);
      const wob = Math.sin(time * (1.5 + s * 2) + s * 40) * (0.6 + speed * 0.08);
      const ix = i * 3;
      let x = pos[ix] + (wind.x * v + px * wob) * dt;
      let y = pos[ix + 1] + Math.sin(time * 2.1 + s * 17) * 0.9 * dt;
      let z = pos[ix + 2] + (wind.y * v + pz * wob) * dt;
      x = center.x + wrap(x - center.x, half.x);
      z = center.z + wrap(z - center.z, half.z);
      const ry = y - center.y - this.yMin;
      y = center.y + this.yMin + (((ry % span) + span) % span);
      pos[ix] = x;
      pos[ix + 1] = y;
      pos[ix + 2] = z;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}

/** Kuru, top gibi yuvarlanan çalı (tumbleweed). */
class Tumbleweed {
  readonly mesh: THREE.Mesh;
  readonly pos = new THREE.Vector3();
  private readonly vel = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly mul: number;

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, readonly radius: number) {
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.scale.setScalar(radius);
    this.mesh.castShadow = true;
    this.mul = range(Math.random, 0.55, 1.0);
  }

  respawn(center: THREE.Vector3, wind: THREE.Vector2, terrain: Terrain, anywhere = false) {
    const side = (Math.random() - 0.5) * 60;
    const back = anywhere ? range(Math.random, -35, 35) : 40;
    this.pos.set(center.x - wind.x * back - wind.y * side, 0, center.z - wind.y * back + wind.x * side);
    this.pos.y = terrain.heightAt(this.pos.x, this.pos.z) + this.radius;
    this.vel.set(0, 0, 0);
  }

  update(dt: number, wind: THREE.Vector2, speed: number, terrain: Terrain, center: THREE.Vector3) {
    // hafif rüzgârda neredeyse durur, fırtınada hızla yuvarlanır
    const target = Math.max(0, speed - 1.2) * this.mul * 0.85;
    this.vel.x = damp(this.vel.x, wind.x * target, 1.5, dt);
    this.vel.z = damp(this.vel.z, wind.y * target, 1.5, dt);
    this.vel.y -= 9.8 * dt;
    this.pos.addScaledVector(this.vel, dt);
    const ground = terrain.heightAt(this.pos.x, this.pos.z) + this.radius * 0.9;
    if (this.pos.y < ground) {
      this.pos.y = ground;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      this.vel.y = Math.abs(this.vel.y) * 0.35 + (hs > 3 && Math.random() < 0.08 ? Math.random() * hs * 0.5 : 0);
    }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.01) {
      this.axis.set(this.vel.z, 0, -this.vel.x).normalize();
      this.q.setFromAxisAngle(this.axis, (hs * dt) / this.radius);
      this.mesh.quaternion.premultiply(this.q);
    }
    this.mesh.position.copy(this.pos);
    const dx = this.pos.x - center.x;
    const dz = this.pos.z - center.z;
    if (dx * dx + dz * dz > 48 * 48) this.respawn(center, wind, terrain);
  }
}

function tumbleweedGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const axis = new THREE.Vector3();
  for (let i = 0; i < 26; i++) {
    const start = new THREE.Vector3().randomDirection();
    axis.randomDirection();
    const sweep = range(Math.random, 1.4, 3.2);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k < 7; k++) {
      pts.push(start.clone().applyAxisAngle(axis, (k / 6) * sweep).multiplyScalar(range(Math.random, 0.7, 1.05)));
    }
    parts.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.025, 3, false));
  }
  return mergeGeometries(parts)!;
}

/**
 * Arada bir gelen kum fırtınası. `intensity` 0 (sakin) ile 1 (tam fırtına) arasında
 * yumuşakça değişir; sis, ışık, gök ve ses bu değere göre ayarlanır.
 */
export class Sandstorm {
  intensity = 0;
  windSpeed = 2;
  readonly wind = new THREE.Vector2(1, 0.3).normalize();

  private target = 0;
  private timer = 35; // ilk fırtınaya kalan süre (sn)
  private time = 0;
  private windAngle = Math.atan2(0.3, 1);
  private readonly grains: DriftParticles;
  private readonly clouds: DriftParticles;
  private readonly tumbleweeds: Tumbleweed[] = [];
  private initialized = false;

  constructor(scene: THREE.Scene, private readonly terrain: Terrain) {
    const dot = softDotTexture();
    this.grains = new DriftParticles(
      14000,
      new THREE.Vector3(36, 14, 36),
      -1.5,
      1,
      new THREE.PointsMaterial({ size: 0.11, map: dot, color: 0xd9b07a, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.clouds = new DriftParticles(
      260,
      new THREE.Vector3(48, 10, 48),
      -2,
      0.7,
      new THREE.PointsMaterial({ size: 11, map: dot, color: 0xc49a64, transparent: true, opacity: 0, depthWrite: false }),
    );
    scene.add(this.grains.points, this.clouds.points);

    const geo = tumbleweedGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: 0x8c6b44, roughness: 1 });
    for (let i = 0; i < 4; i++) {
      const t = new Tumbleweed(geo, mat, range(Math.random, 0.35, 0.6));
      this.tumbleweeds.push(t);
      scene.add(t.mesh);
    }
  }

  get active() {
    return this.target > 0;
  }

  /** Test için: fırtınayı hemen başlat / bitir. */
  toggle() {
    if (this.target > 0) this.endStorm();
    else this.startStorm();
  }

  private startStorm() {
    this.target = 1;
    this.timer = range(Math.random, 22, 38);
    this.windAngle += range(Math.random, -1.2, 1.2);
  }

  private endStorm() {
    this.target = 0;
    this.timer = range(Math.random, 50, 100);
  }

  update(dt: number, center: THREE.Vector3) {
    this.time += dt;
    this.timer -= dt;
    if (this.timer <= 0) {
      if (this.target > 0) this.endStorm();
      else this.startStorm();
    }

    const rate = this.target > this.intensity ? 0.11 : 0.08;
    this.intensity += Math.sign(this.target - this.intensity) * Math.min(Math.abs(this.target - this.intensity), rate * dt);
    const s = this.intensity;

    const gust = Math.sin(this.time * 0.7) * 0.6 + Math.sin(this.time * 1.9 + 1) * 0.4;
    this.windSpeed = 1.8 + s * 15 + gust * (0.6 + s * 4);
    const a = this.windAngle + Math.sin(this.time * 0.13) * 0.25;
    this.wind.set(Math.cos(a), Math.sin(a));

    if (!this.initialized) {
      this.initialized = true;
      this.tumbleweeds.forEach((t) => t.respawn(center, this.wind, this.terrain, true));
    }

    const visible = s > 0.01;
    this.grains.points.visible = this.clouds.points.visible = visible;
    if (visible) {
      this.grains.material.opacity = Math.min(1, s * 1.2) * 0.7;
      this.clouds.material.opacity = s * 0.32;
      this.grains.update(dt, center, this.wind, this.windSpeed, this.time);
      this.clouds.update(dt, center, this.wind, this.windSpeed, this.time);
    }
    for (const t of this.tumbleweeds) t.update(dt, this.wind, this.windSpeed, this.terrain, center);
  }
}

