import * as THREE from 'three';
import type { Input } from './Input';
import type { Terrain } from '../world/Terrain';
import { clamp, damp } from '../utils/math';

/**
 * Oyuncuyu üstten takip eden kamera.
 * A/D: karakterin etrafında döndür · W/S: tepeden bakış ↔ yatık açı · Tekerlek: yakınlaştır
 */
export class CameraRig {
  yaw = 0;
  pitch = 1.1; // radyan; PI/2 = tam tepeden
  distance = 17;

  private targetDistance = 17;
  private readonly focus = new THREE.Vector3();
  private started = false;
  private readonly onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.targetDistance = clamp(this.targetDistance * (1 + Math.sign(e.deltaY) * 0.1), 7, 40);
  };

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    private readonly terrain: Terrain,
  ) {
    dom.addEventListener('wheel', this.onWheel, { passive: false });
  }

  update(dt: number, input: Input, target: THREE.Vector3) {
    const turn = 1.8;
    const tilt = 1.1;
    if (input.isDown('KeyA')) this.yaw -= turn * dt;
    if (input.isDown('KeyD')) this.yaw += turn * dt;
    if (input.isDown('KeyW')) this.pitch += tilt * dt;
    if (input.isDown('KeyS')) this.pitch -= tilt * dt;
    this.pitch = clamp(this.pitch, 0.35, 1.5);
    this.distance = damp(this.distance, this.targetDistance, 8, dt);

    if (!this.started) {
      this.focus.copy(target);
      this.started = true;
    } else {
      this.focus.x = damp(this.focus.x, target.x, 7, dt);
      this.focus.y = damp(this.focus.y, target.y, 4, dt);
      this.focus.z = damp(this.focus.z, target.z, 7, dt);
    }

    const flat = Math.cos(this.pitch) * this.distance;
    const cam = this.camera.position;
    cam.set(this.focus.x + Math.sin(this.yaw) * flat, this.focus.y + Math.sin(this.pitch) * this.distance, this.focus.z + Math.cos(this.yaw) * flat);
    const ground = this.terrain.heightAt(cam.x, cam.z) + 1.2;
    if (cam.y < ground) cam.y = ground; // kum tepesinin içine girmesin
    this.camera.lookAt(this.focus.x, this.focus.y + 1, this.focus.z);
  }

  /** Ekranda “yukarı” yönünün yerdeki karşılığı. */
  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  /** Ekranda “sağ” yönünün yerdeki karşılığı. */
  right(out: THREE.Vector3) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  dispose() {
    this.dom.removeEventListener('wheel', this.onWheel);
  }
}
