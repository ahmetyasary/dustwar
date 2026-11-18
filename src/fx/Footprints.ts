import * as THREE from 'three';
import { smoothstep } from '../utils/math';
import { softDotTexture } from '../utils/textures';

/** Kumda kalan ayak izleri; zamanla (fırtınada çok daha hızlı) silinir. */
export class Footprints {
  private readonly mesh: THREE.InstancedMesh;
  private readonly alpha: THREE.InstancedBufferAttribute;
  private readonly ages: Float32Array;
  private next = 0;
  private readonly max = 160;
  private readonly life = 20;
  private readonly peak = 0.5;

  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly one = new THREE.Vector3(1, 1, 1);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.PlaneGeometry(0.14, 0.28);
    geo.rotateX(-Math.PI / 2);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1);
    geo.setAttribute('aAlpha', this.alpha);
    this.ages = new Float32Array(this.max).fill(this.life);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x8e6440,
      alphaMap: softDotTexture(),
      transparent: true,
      depthWrite: false,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <alphatest_fragment>', 'diffuseColor.a *= vAlpha;\n#include <alphatest_fragment>');
    };

    this.mesh = new THREE.InstancedMesh(geo, mat, this.max);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.m);
    scene.add(this.mesh);
  }

  add(pos: THREE.Vector3, yaw: number, normal: THREE.Vector3) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.q.setFromUnitVectors(this.up, normal).multiply(this.qYaw.setFromAxisAngle(this.up, yaw));
    this.m.compose(pos.clone().setY(pos.y + 0.02), this.q, this.one);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.ages[i] = 0;
    this.alpha.setX(i, this.peak);
    this.alpha.needsUpdate = true;
  }

  update(dt: number, storm: number) {
    const speed = 1 + storm * 8;
    for (let i = 0; i < this.max; i++) {
      if (this.ages[i] >= this.life) continue;
      this.ages[i] += dt * speed;
      this.alpha.setX(i, this.peak * (1 - smoothstep(this.life * 0.4, this.life, this.ages[i])));
    }
    this.alpha.needsUpdate = true;
  }
}
