import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mulberry32, smoothstep } from '../utils/math';
import { sandGrainTexture, sandRippleTexture } from '../utils/textures';

/**
 * Prosedürel çöl zemini: geniş tepeler + rüzgâr yönünde uzanan keskin sırtlı kum
 * tepeleri + haritanın kenarında yükselen kayalık tepeler. Oyun alanının ortası
 * daha yumuşak tutulur.
 */
export class Terrain {
  readonly size = 420;
  readonly playRadius = 150;
  readonly mesh: THREE.Mesh;
  private readonly noise: SimplexNoise;

  constructor(seed = 7) {
    this.noise = new SimplexNoise({ random: mulberry32(seed) });

    const seg = 320;
    const geo = new THREE.PlaneGeometry(this.size, this.size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();

    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const light = new THREE.Color(0xe8c99c);
    const mid = new THREE.Color(0xd5a86e);
    const red = new THREE.Color(0xc0784a);
    const rocky = new THREE.Color(0xa86f45);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const patch = this.noise.noise(x * 0.03 + 100, z * 0.03) * 0.5 + 0.5;
      c.copy(mid).lerp(light, patch * 0.85);
      const slope = 1 - nrm.getY(i);
      c.lerp(red, smoothstep(0.04, 0.3, slope) * 0.45);
      c.lerp(rocky, smoothstep(115, 175, Math.hypot(x, z)) * 0.55);
      c.offsetHSL(0, 0, this.noise.noise(x * 0.25, z * 0.25) * 0.035);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const ripple = sandRippleTexture();
    ripple.repeat.set(this.size / 5, this.size / 5);
    const grain = sandGrainTexture();
    grain.repeat.set(this.size / 1.5, this.size / 1.5);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: grain,
      bumpMap: ripple,
      bumpScale: 0.9,
      roughness: 0.95,
      metalness: 0,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
  }

  heightAt(x: number, z: number): number {
    const n = this.noise;
    const r = Math.hypot(x, z);

    // geniş, yumuşak tepeler
    let h = n.noise(x * 0.004, z * 0.004) * 14 + n.noise(x * 0.012 + 31, z * 0.012 - 17) * 4;

    // keskin sırtlı kum tepeleri (ridged noise, bir eksende uzatılmış)
    const warp = n.noise(x * 0.01, z * 0.01) * 0.6;
    const ridge = 1 - Math.abs(n.noise(x * 0.018 + warp, z * 0.007));
    const dunes = Math.pow(ridge, 2.5) * 9;

    // başlangıç alanı daha düz olsun
    const f = smoothstep(14, 60, r);
    h = h * (0.25 + 0.75 * f) + dunes * (0.15 + 0.85 * f);

    // küçük dalgalanmalar
    h += n.noise(x * 0.06, z * 0.06) * 0.35;

    // haritanın kenarındaki kayalık tepeler
    const edge = smoothstep(110, 190, r);
    h += edge * (22 + n.noise(x * 0.012, z * 0.012) * 14);
    return h;
  }

  normalAt(x: number, z: number, out = new THREE.Vector3()) {
    const e = 0.4;
    return out
      .set(this.heightAt(x - e, z) - this.heightAt(x + e, z), 2 * e, this.heightAt(x, z - e) - this.heightAt(x, z + e))
      .normalize();
  }
}
