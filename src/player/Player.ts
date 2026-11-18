import * as THREE from 'three';
import { Warrior, type Side } from './Warrior';
import type { Terrain } from '../world/Terrain';
import type { Collider } from '../world/Vegetation';
import type { AudioManager } from '../audio/AudioManager';
import type { Dust } from '../fx/Dust';
import type { Footprints } from '../fx/Footprints';
import type { Input } from '../core/Input';
import type { CameraRig } from '../core/CameraRig';
import { angleDelta, clamp, damp, range } from '../utils/math';

const WALK = 4.2;
const RUN = 7.5;
const BODY_RADIUS = 0.35;

/** Ok tuşlarıyla (kameraya göre) hareket, Boşluk ile yumruk, kendiliğinden gelen tik. */
export class Player {
  readonly warrior = new Warrior();
  readonly position = new THREE.Vector3();
  facing = 0;
  /** Kapalıyken kendiliğinden tik gelmez (T ile test hâlâ çalışır). */
  ticEnabled = true;

  /** Düşmanlar eklendiğinde: yumruk en uzak noktaya ulaştığında çağrılır. */
  onPunch?: (hitPoint: THREE.Vector3, side: Side) => void;
  onTicSlap?: () => void;

  private speed = 0;
  private running = false;
  private ticTimer = range(Math.random, 4, 8);
  private readonly moveDir = new THREE.Vector3(0, 0, 1);
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly nrm = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly terrain: Terrain,
    private readonly colliders: Collider[],
    audio: AudioManager,
    dust: Dust,
    footprints: Footprints,
  ) {
    scene.add(this.warrior.root);
    this.warrior.root.traverse((o) => (o.castShadow = true));
    this.position.set(0, terrain.heightAt(0, 0), 0);

    const w = this.warrior;
    w.onPunchStart = () => audio.whoosh();
    w.onPunchImpact = (side) => {
      const p = this.tmp2.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(0.85).add(this.position);
      p.y += 1.45;
      this.onPunch?.(p, side);
    };
    w.onSlap = () => {
      audio.slap();
      audio.uff();
      this.onTicSlap?.();
    };
    w.onStep = (side) => {
      const foot = w.footWorld(side, this.tmp);
      foot.y = terrain.heightAt(foot.x, foot.z);
      footprints.add(foot, this.facing, terrain.normalAt(foot.x, foot.z, this.nrm));
      dust.spawn(foot, this.running ? 2 : 1, { size: this.running ? 0.45 : 0.3, opacity: 0.35, up: 0.3 });
      audio.step(this.running);
    };
  }

  headTop(out: THREE.Vector3) {
    return this.warrior.headTopWorld(out);
  }

  update(dt: number, input: Input, rig: CameraRig, windStrength: number) {
    const w = this.warrior;

    // --- hareket (kameraya göre)
    const ix = Number(input.isDown('ArrowRight')) - Number(input.isDown('ArrowLeft'));
    const iz = Number(input.isDown('ArrowUp')) - Number(input.isDown('ArrowDown'));
    const move = this.tmp.set(0, 0, 0);
    if (ix || iz) {
      move.addScaledVector(rig.forward(this.tmp2), iz).addScaledVector(rig.right(this.tmp2), ix).normalize();
      this.moveDir.copy(move);
    }
    const hasInput = ix !== 0 || iz !== 0;
    this.running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    let max = this.running ? RUN : WALK;
    if (w.isPunching) max *= 0.35;
    else if (w.isTicking) max *= 0.55;
    this.speed = damp(this.speed, hasInput ? max : 0, 10, dt);

    if (hasInput) {
      const target = Math.atan2(this.moveDir.x, this.moveDir.z);
      this.facing += angleDelta(this.facing, target) * (1 - Math.exp(-14 * dt));
    }
    this.position.addScaledVector(this.moveDir, this.speed * dt);
    if (w.lunge) this.position.add(this.tmp2.set(Math.sin(this.facing), 0, Math.cos(this.facing)).multiplyScalar(2.2 * dt));

    // --- çarpışma: kaktüs ve kayalar
    for (const c of this.colliders) {
      const dx = this.position.x - c.x;
      const dz = this.position.z - c.z;
      const min = c.r + BODY_RADIUS;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-8) {
        const d = Math.sqrt(d2);
        this.position.x = c.x + (dx / d) * min;
        this.position.z = c.z + (dz / d) * min;
      }
    }
    const r = Math.hypot(this.position.x, this.position.z);
    const limit = this.terrain.playRadius;
    if (r > limit) this.position.multiplyScalar(limit / r);
    this.position.y = this.terrain.heightAt(this.position.x, this.position.z);

    // --- dövüş
    if (input.justPressed('Space')) w.punch();

    // --- tik: belirsiz aralıklarla kendiliğinden
    if (this.ticEnabled) this.ticTimer -= dt;
    if (this.ticTimer <= 0 || input.justPressed('KeyT')) {
      this.ticTimer = w.tic() ? range(Math.random, 6, 14) : 0.8;
    }

    w.windStrength = clamp(windStrength, 0, 1);
    w.root.position.copy(this.position);
    w.root.rotation.y = this.facing;
    w.update(dt, this.speed);
  }
}
