import * as THREE from 'three';

/** Çöl göğü: ufukta sıcak pus, güneş parlaması; fırtınada toz rengine karışır. */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(sunDir: THREE.Vector3, horizon: THREE.Color) {
    this.material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color(0x3f7fc8) },
        uHorizon: { value: horizon.clone() },
        uGround: { value: new THREE.Color(0xc9a274) },
        uSunColor: { value: new THREE.Color(0xfff1d6) },
        uSunDir: { value: sunDir.clone().normalize() },
        uStorm: { value: 0 },
        uStormColor: { value: new THREE.Color(0xb3864f) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop, uHorizon, uGround, uSunColor, uStormColor, uSunDir;
        uniform float uStorm;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.5));
          col = mix(col, uGround, smoothstep(0.0, -0.12, h));
          float s = max(dot(d, uSunDir), 0.0);
          col += uSunColor * (pow(s, 900.0) * 10.0 + pow(s, 14.0) * 0.3) * (1.0 - uStorm);
          vec3 storm = uStormColor * (0.75 + 0.35 * clamp(h + 0.3, 0.0, 1.0));
          col = mix(col, storm, uStorm);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.material);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  update(cameraPos: THREE.Vector3, storm: number) {
    this.mesh.position.copy(cameraPos);
    this.material.uniforms.uStorm.value = storm;
  }
}
