import * as THREE from 'three';
import { softDotTexture } from '../utils/textures';

interface Puff {
  sprite: THREE.Sprite;
  mat: THREE.SpriteMaterial;
  vel: THREE.Vector3;
  life: number;
  max: number;
  s0: number;
  s1: number;
  o: number;
}

export interface PuffOptions {
  spread?: number;
  up?: number;
  size?: number;
  life?: number;
  opacity?: number;
}

/** Ayak ve hareketlerden kalkan küçük toz bulutları (sprite havuzu). */
export class Dust {
  private readonly puffs: Puff[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 90) {
    const tex = softDotTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, color: 0xd6b07e, transparent: true, depthWrite: false, opacity: 0 });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({ sprite, mat, vel: new THREE.Vector3(), life: 0, max: 1, s0: 0, s1: 0, o: 0 });
    }
  }

  spawn(pos: THREE.Vector3, n: number, o: PuffOptions = {}) {
    const spread = o.spread ?? 0.6;
    for (let k = 0; k < n; k++) {
      const p = this.puffs[this.next];
      this.next = (this.next + 1) % this.puffs.length;
      p.sprite.position.copy(pos);
      p.sprite.position.y += 0.05;
      p.vel.set((Math.random() - 0.5) * spread, (o.up ?? 0.4) * (0.5 + Math.random()), (Math.random() - 0.5) * spread);
      p.max = (o.life ?? 0.9) * (0.7 + Math.random() * 0.6);
      p.life = p.max;
      p.s0 = (o.size ?? 0.35) * 0.5;
      p.s1 = (o.size ?? 0.35) * (1.4 + Math.random());
      p.o = o.opacity ?? 0.45;
      p.sprite.visible = true;
    }
  }

  update(dt: number, wind: THREE.Vector2, windSpeed: number) {
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      const t = 1 - p.life / p.max;
      p.vel.x += wind.x * windSpeed * 0.4 * dt;
      p.vel.z += wind.y * windSpeed * 0.4 * dt;
      p.vel.multiplyScalar(1 - 1.5 * dt);
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(t));
      p.mat.opacity = p.o * (1 - t) * Math.min(1, t * 8);
    }
  }
}
