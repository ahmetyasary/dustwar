import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { clamp, damp, lerp, smoothstep } from '../utils/math';

export type Side = 'L' | 'R';
type V3 = [number, number, number];
type JointName =
  | 'hips' | 'spine' | 'neck' | 'head'
  | 'shoulderL' | 'elbowL' | 'shoulderR' | 'elbowR'
  | 'hipL' | 'kneeL' | 'hipR' | 'kneeR';
type Pose = Partial<Record<JointName, V3>>;
interface Key { t: number; pose: Pose }
interface Action {
  kind: 'punch' | 'tic';
  t: number;
  duration: number;
  keys: Key[];
  events: { t: number; fn: () => void }[];
  fired: number;
}

const JOINTS: JointName[] = ['hips', 'spine', 'neck', 'head', 'shoulderL', 'elbowL', 'shoulderR', 'elbowR', 'hipL', 'kneeL', 'hipR', 'kneeR'];
/** Bu eklemlerde aksiyon pozu yürüyüş pozunun üstüne eklenir; kollar ise tamamen ezilir. */
const ADDITIVE = new Set<JointName>(['hips', 'spine', 'neck', 'head']);
const ZERO: V3 = [0, 0, 0];

// ---------------------------------------------------------------- pozlar
// Karakter +Z yönüne bakar. Kollar ve bacaklar eklemden aşağı (-Y) sarkar.
// rotation.x < 0 → uzuv öne kalkar.  Sağ kol -X tarafındadır.

const GUARD: Pose = {
  shoulderL: [-0.75, -0.3, 0.28],
  elbowL: [-2.05, 0, 0],
  shoulderR: [-0.75, 0.3, -0.28],
  elbowR: [-2.05, 0, 0],
};

function mirror(p: Pose): Pose {
  const out: Pose = {};
  for (const [k, v] of Object.entries(p) as [JointName, V3][]) {
    const name = (k.endsWith('L') ? k.slice(0, -1) + 'R' : k.endsWith('R') ? k.slice(0, -1) + 'L' : k) as JointName;
    out[name] = [v[0], -v[1], -v[2]];
  }
  return out;
}

const PUNCH_EXTEND: Pose = {
  ...GUARD,
  shoulderR: [-1.55, 0, 0.14],
  elbowR: [-0.08, 0, 0],
  shoulderL: [-0.6, -0.35, 0.3],
  spine: [0.08, 0.45, 0],
  hips: [0, 0.12, 0],
  head: [0, -0.35, 0],
};
const PUNCH_R: Key[] = [
  { t: 0, pose: GUARD },
  { t: 0.06, pose: { ...GUARD, shoulderR: [-0.55, 0.3, -0.4], elbowR: [-2.3, 0, 0], spine: [0, -0.12, 0] } },
  { t: 0.13, pose: PUNCH_EXTEND },
  { t: 0.19, pose: PUNCH_EXTEND },
  { t: 0.34, pose: GUARD },
];
const PUNCH_L: Key[] = PUNCH_R.map((k) => ({ t: k.t, pose: mirror(k.pose) }));

/** Tik: sağ el kalkar, kafaya “şap” diye iner, kafa öne düşer, sonra toparlanır. */
const TIC_HIT: Pose = { ...GUARD, shoulderR: [-0.15, 0, -2.85], elbowR: [0, 0, -1.5], head: [0.38, 0, -0.18], spine: [0.14, 0, 0.04] };
const TIC_KEYS: Key[] = [
  { t: 0, pose: GUARD },
  { t: 0.3, pose: { ...GUARD, shoulderR: [-0.25, 0, -2.9], elbowR: [0, 0, -0.5], head: [-0.15, 0, 0], spine: [-0.05, 0, 0] } },
  { t: 0.4, pose: TIC_HIT },
  { t: 0.55, pose: { ...TIC_HIT, head: [0.3, 0.14, -0.12] } },
  { t: 0.72, pose: { ...TIC_HIT, head: [0.3, -0.14, -0.12], elbowR: [0, 0, -1.4] } },
  { t: 1.2, pose: GUARD },
];
const TIC_SLAP_TIME = 0.4;

function samplePose(keys: Key[], t: number, out: Pose) {
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  let u = clamp((t - a.t) / (b.t - a.t), 0, 1);
  u = u * u * (3 - 2 * u);
  const names = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]) as Set<JointName>;
  for (const n of names) {
    const va = a.pose[n] ?? ZERO;
    const vb = b.pose[n] ?? ZERO;
    out[n] = [lerp(va[0], vb[0], u), lerp(va[1], vb[1], u), lerp(va[2], vb[2], u)];
  }
}

// ---------------------------------------------------------------- model

const mats = {
  skin: new THREE.MeshStandardMaterial({ color: 0xa5683f, roughness: 0.55 }),
  cloth: new THREE.MeshStandardMaterial({ color: 0xebe0c8, roughness: 0.9 }),
  sash: new THREE.MeshStandardMaterial({ color: 0x9a2a1c, roughness: 0.85 }),
  leather: new THREE.MeshStandardMaterial({ color: 0x5a3720, roughness: 0.7 }),
  pants: new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xa39a8a, roughness: 0.32, metalness: 0.85 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x24170e, roughness: 0.9 }),
  eye: new THREE.MeshStandardMaterial({ color: 0x0d0b09, roughness: 0.3 }),
};

function add(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, p: V3 = ZERO, s: V3 = [1, 1, 1], r: V3 = ZERO) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...p);
  m.scale.set(...s);
  m.rotation.set(...r);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function group(parent: THREE.Object3D, p: V3) {
  const g = new THREE.Group();
  g.position.set(...p);
  parent.add(g);
  return g;
}

/**
 * Yumruk dövüşçüsü çöl savaşçısı: sarık, kırmızı kuşak, deri kayış, bilek zırhı.
 * Prosedürel animasyon: yürüme/koşma, gard, sol-sağ yumruk kombosu ve tik.
 */
export class Warrior {
  readonly root = new THREE.Group();
  windStrength = 0;

  onPunchStart?: (side: Side) => void;
  onPunchImpact?: (side: Side) => void;
  onSlap?: () => void;
  onStep?: (side: Side) => void;

  private readonly j = {} as Record<JointName, THREE.Group>;
  private readonly feet = {} as Record<Side, THREE.Object3D>;
  private readonly fists = {} as Record<Side, THREE.Object3D>;
  private headTop!: THREE.Object3D;
  private flapF!: THREE.Group;
  private flapB!: THREE.Group;
  private tail!: THREE.Group;

  private action: Action | null = null;
  private queuedPunch = false;
  private nextSide: Side = 'R';
  private phase = 0;
  private moveBlend = 0;
  private time = 0;
  private lastCos = 1;

  constructor() {
    this.build();
  }

  get isPunching() {
    return this.action?.kind === 'punch';
  }
  get isTicking() {
    return this.action?.kind === 'tic';
  }
  /** Yumruğun uzandığı anda öne doğru küçük bir atılım. */
  get lunge() {
    const a = this.action;
    return a?.kind === 'punch' && a.t > 0.05 && a.t < 0.15 ? 1 : 0;
  }

  punch() {
    if (!this.action) this.startPunch();
    else if (this.action.kind === 'tic' || this.action.t > 0.1) this.queuedPunch = true;
  }

  /** Tik krizi. Başka bir hareket sürüyorsa false döner. */
  tic() {
    if (this.action) return false;
    this.action = {
      kind: 'tic',
      t: 0,
      duration: TIC_KEYS[TIC_KEYS.length - 1].t,
      keys: TIC_KEYS,
      events: [{ t: TIC_SLAP_TIME, fn: () => this.onSlap?.() }],
      fired: 0,
    };
    return true;
  }

  private startPunch() {
    const side = this.nextSide;
    this.nextSide = side === 'R' ? 'L' : 'R';
    this.action = {
      kind: 'punch',
      t: 0,
      duration: 0.34,
      keys: side === 'R' ? PUNCH_R : PUNCH_L,
      events: [
        { t: 0, fn: () => this.onPunchStart?.(side) },
        { t: 0.13, fn: () => this.onPunchImpact?.(side) },
      ],
      fired: 0,
    };
  }

  footWorld(side: Side, out: THREE.Vector3) {
    return this.feet[side].getWorldPosition(out);
  }
  fistWorld(side: Side, out: THREE.Vector3) {
    return this.fists[side].getWorldPosition(out);
  }
  headTopWorld(out: THREE.Vector3) {
    return this.headTop.getWorldPosition(out);
  }

  /** speed: yer hızı (birim/sn). */
  update(dt: number, speed: number) {
    this.time += dt;
    this.moveBlend = damp(this.moveBlend, speed / 4.2, 10, dt);
    const a = Math.min(this.moveBlend, 1.8);
    const aLeg = Math.min(a, 1);
    const run = clamp(a - 1, 0, 1);

    this.phase += dt * speed * 2.3;
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const amp = 0.5 + 0.22 * run;
    const breathe = Math.sin(this.time * 1.7) * 0.015 * (1 - aLeg);

    const P: Record<JointName, V3> = {
      hips: [0, 0.12 * s * aLeg, 0],
      spine: [0.05 * aLeg + 0.14 * run + breathe, -0.1 * s * aLeg, 0],
      neck: [0, 0, 0],
      head: [-0.05 * aLeg - 0.1 * run, 0.08 * s * aLeg, 0],
      shoulderL: [GUARD.shoulderL![0] - s * 0.2 * aLeg, GUARD.shoulderL![1], GUARD.shoulderL![2]],
      elbowL: [...GUARD.elbowL!],
      shoulderR: [GUARD.shoulderR![0] + s * 0.2 * aLeg, GUARD.shoulderR![1], GUARD.shoulderR![2]],
      elbowR: [...GUARD.elbowR!],
      hipL: [s * amp * aLeg, 0, 0.03],
      kneeL: [aLeg * (0.1 + (0.85 + 0.4 * run) * Math.max(0, -c)), 0, 0],
      hipR: [-s * amp * aLeg, 0, -0.03],
      kneeR: [aLeg * (0.1 + (0.85 + 0.4 * run) * Math.max(0, c)), 0, 0],
    };

    // adım sesi/izi: bacak en öndeyken (cos işaret değiştirince)
    if (aLeg > 0.3 && Math.sign(c) !== Math.sign(this.lastCos)) this.onStep?.(s < 0 ? 'L' : 'R');
    this.lastCos = c;

    const act = this.action;
    if (act) {
      act.t += dt;
      while (act.fired < act.events.length && act.t >= act.events[act.fired].t) act.events[act.fired++].fn();
      const pose: Pose = {};
      samplePose(act.keys, act.t, pose);
      const w = smoothstep(0, 0.05, act.t) * (1 - smoothstep(act.duration - 0.06, act.duration, act.t));
      for (const [n, v] of Object.entries(pose) as [JointName, V3][]) {
        const b = P[n];
        for (let i = 0; i < 3; i++) b[i] = ADDITIVE.has(n) ? b[i] + v[i] * w : lerp(b[i], v[i], w);
      }
      if (act.t >= act.duration) {
        this.action = null;
        if (this.queuedPunch) {
          this.queuedPunch = false;
          this.startPunch();
        }
      }
    }

    for (const n of JOINTS) this.j[n].rotation.set(...P[n]);
    this.j.hips.position.y = 1.0 - 0.03 * aLeg - 0.04 * run + 0.035 * aLeg * Math.abs(c);

    // bez parçaları: bacaklarla ve rüzgârla dalgalanır
    const flutter = Math.sin(this.time * 9) * 0.08 * (0.3 + this.windStrength);
    this.flapF.rotation.x = -Math.max(0, -P.hipL[0], -P.hipR[0]) * 0.75 + flutter;
    this.flapB.rotation.x = Math.max(0, P.hipL[0], P.hipR[0]) * 0.75 + 0.05 + flutter;
    this.tail.rotation.x = 0.25 + 0.35 * aLeg + 0.3 * run + this.windStrength * 0.7 + Math.sin(this.time * 7) * 0.1 * (0.4 + this.windStrength);
  }

  // ---------------------------------------------------------------- yapı

  private build() {
    const j = this.j;
    const capsule = (r: number, l: number) => new THREE.CapsuleGeometry(r, l, 6, 14);
    const sphere = (r: number) => new THREE.SphereGeometry(r, 20, 14);
    const rbox = (w: number, h: number, d: number, rad = 0.03) => new RoundedBoxGeometry(w, h, d, 3, rad);

    j.hips = group(this.root, [0, 1.0, 0]);
    add(j.hips, rbox(0.36, 0.2, 0.23, 0.07), mats.pants, [0, -0.03, 0]);
    add(j.hips, new THREE.CylinderGeometry(0.2, 0.21, 0.08, 20), mats.sash, [0, 0.06, 0], [1, 1, 0.68]);
    add(j.hips, new THREE.TorusGeometry(0.05, 0.02, 6, 12), mats.sash, [0.13, 0.04, 0.12], [1, 1, 1], [0, 0.6, 0]);
    this.flapF = group(j.hips, [0, 0.03, 0.13]);
    add(this.flapF, new THREE.BoxGeometry(0.2, 0.34, 0.015), mats.sash, [0, -0.17, 0]);
    this.flapB = group(j.hips, [0, 0.03, -0.13]);
    add(this.flapB, new THREE.BoxGeometry(0.22, 0.3, 0.015), mats.sash, [0, -0.15, 0]);

    // gövde
    j.spine = group(j.hips, [0, 0.08, 0]);
    add(j.spine, capsule(0.15, 0.12), mats.skin, [0, 0.12, 0], [1.15, 1, 0.8]);
    add(j.spine, capsule(0.19, 0.12), mats.skin, [0, 0.33, 0], [1.3, 1, 0.85]);
    for (const sx of [1, -1]) add(j.spine, sphere(0.1), mats.skin, [sx * 0.095, 0.37, 0.115], [1, 0.72, 0.5]);
    add(j.spine, new THREE.BoxGeometry(0.07, 0.66, 0.03), mats.leather, [0, 0.29, 0.155], [1, 1, 1], [0, 0, 0.72]);
    add(j.spine, new THREE.BoxGeometry(0.07, 0.66, 0.03), mats.leather, [0, 0.29, -0.155], [1, 1, 1], [0, 0, -0.72]);
    // omuzluklar: solda metal, sağda deri
    const pauldron = new THREE.SphereGeometry(0.13, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    add(j.spine, pauldron, mats.metal, [0.27, 0.45, 0], [1.05, 0.8, 1.05], [0, 0, -0.35]);
    add(j.spine, pauldron, mats.leather, [-0.27, 0.45, 0], [0.95, 0.7, 0.95], [0, 0, 0.35]);

    // boyun ve kafa
    j.neck = group(j.spine, [0, 0.5, 0]);
    add(j.neck, new THREE.CylinderGeometry(0.06, 0.075, 0.12, 12), mats.skin, [0, 0.03, 0]);
    j.head = group(j.neck, [0, 0.1, 0]);
    add(j.head, sphere(0.115), mats.skin, [0, 0.07, 0], [0.95, 1.1, 1]);
    add(j.head, new THREE.SphereGeometry(0.105, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mats.hair, [0, 0.045, 0.02], [0.95, 0.9, 0.95]);
    add(j.head, new THREE.BoxGeometry(0.03, 0.05, 0.04), mats.skin, [0, 0.065, 0.11]);
    for (const sx of [1, -1]) {
      add(j.head, sphere(0.014), mats.eye, [sx * 0.04, 0.09, 0.098]);
      add(j.head, new THREE.BoxGeometry(0.045, 0.012, 0.015), mats.hair, [sx * 0.04, 0.112, 0.1], [1, 1, 1], [0, 0, sx * -0.15]);
    }
    // sarık
    add(j.head, new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.cloth, [0, 0.1, -0.005], [1, 0.9, 1.05]);
    add(j.head, new THREE.TorusGeometry(0.12, 0.032, 8, 24), mats.cloth, [0, 0.115, 0], [1, 1.05, 1], [Math.PI / 2, 0, 0]);
    add(j.head, new THREE.TorusGeometry(0.115, 0.024, 8, 24), mats.sash, [0, 0.145, 0], [1, 1.05, 1], [Math.PI / 2 - 0.15, 0, 0]);
    this.headTop = group(j.head, [0, 0.26, 0]);
    this.tail = group(j.head, [0, 0.13, -0.12]);
    add(this.tail, new THREE.BoxGeometry(0.1, 0.34, 0.015), mats.cloth, [0, -0.17, 0]);

    // kollar
    for (const side of ['L', 'R'] as Side[]) {
      const sx = side === 'L' ? 1 : -1;
      const sh = (j[`shoulder${side}` as const] = group(j.spine, [sx * 0.27, 0.45, 0]));
      add(sh, capsule(0.068, 0.17), mats.skin, [0, -0.14, 0], [1.1, 1, 1.05]);
      const el = (j[`elbow${side}` as const] = group(sh, [0, -0.29, 0]));
      add(el, capsule(0.056, 0.15), mats.skin, [0, -0.11, 0]);
      add(el, new THREE.CylinderGeometry(0.068, 0.072, 0.14, 14), side === 'L' ? mats.metal : mats.leather, [0, -0.15, 0]);
      const fist = group(el, [0, -0.28, 0]);
      add(fist, rbox(0.1, 0.1, 0.11, 0.035), mats.cloth);
      this.fists[side] = fist;
    }

    // bacaklar
    for (const side of ['L', 'R'] as Side[]) {
      const sx = side === 'L' ? 1 : -1;
      const hip = (j[`hip${side}` as const] = group(j.hips, [sx * 0.11, -0.04, 0]));
      add(hip, capsule(0.088, 0.3), mats.pants, [0, -0.23, 0]);
      const knee = (j[`knee${side}` as const] = group(hip, [0, -0.46, 0]));
      add(knee, sphere(0.078), mats.pants);
      add(knee, capsule(0.072, 0.26), mats.pants, [0, -0.16, 0]);
      add(knee, new THREE.CylinderGeometry(0.083, 0.078, 0.22, 14), mats.leather, [0, -0.32, 0]);
      add(knee, rbox(0.12, 0.09, 0.25, 0.035), mats.leather, [0, -0.455, 0.05]);
      this.feet[side] = group(knee, [0, -0.5, 0.05]);
    }
  }
}
