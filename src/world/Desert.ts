import * as THREE from 'three';
import { Terrain } from './Terrain';
import { SkyDome } from './SkyDome';
import { Vegetation, type Collider } from './Vegetation';
import { Sandstorm } from './Sandstorm';
import { lerp, smoothstep } from '../utils/math';

/** Çöl ortamının tamamı: zemin, gök, ışıklar, sis, bitki örtüsü ve fırtına. */
export class Desert {
  readonly terrain: Terrain;
  readonly storm: Sandstorm;
  readonly colliders: Collider[];

  private readonly sky: SkyDome;
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  private readonly fog: THREE.Fog;
  private readonly sunDir = new THREE.Vector3(0.55, 0.62, 0.45).normalize();

  private readonly haze = new THREE.Color(0xe6d2b0);
  private readonly dust = new THREE.Color(0xb98c58);
  private readonly sunCalm = new THREE.Color(0xfff0d8);
  private readonly sunStorm = new THREE.Color(0xffb36b);
  private readonly hemiSky = new THREE.Color(0xbcd4f0);
  private readonly hemiStorm = new THREE.Color(0xd2a46c);

  constructor(scene: THREE.Scene) {
    this.terrain = new Terrain();
    scene.add(this.terrain.mesh);

    this.sky = new SkyDome(this.sunDir, this.haze);
    scene.add(this.sky.mesh);

    this.fog = new THREE.Fog(this.haze.clone(), 70, 320);
    scene.fog = this.fog;

    this.hemi = new THREE.HemisphereLight(this.hemiSky.clone(), 0xc89d6c, 1.1);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(this.sunCalm.clone(), 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -28;
    cam.right = cam.top = 28;
    cam.near = 1;
    cam.far = 220;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    this.colliders = new Vegetation(scene, this.terrain).colliders;
    this.storm = new Sandstorm(scene, this.terrain);
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera) {
    this.storm.update(dt, focus);
    const s = smoothstep(0, 1, this.storm.intensity);

    this.fog.color.lerpColors(this.haze, this.dust, s);
    this.fog.near = lerp(70, 0, s);
    this.fog.far = lerp(320, 48, s);

    this.sun.intensity = lerp(3, 0.7, s);
    this.sun.color.lerpColors(this.sunCalm, this.sunStorm, s);
    this.hemi.color.lerpColors(this.hemiSky, this.hemiStorm, s);
    this.hemi.intensity = lerp(1.1, 1.3, s);

    this.sky.update(camera.position, smoothstep(0, 0.75, this.storm.intensity));

    // gölge kamerası oyuncuyu takip etsin
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 100);
    this.sun.target.position.copy(focus);
  }
}
