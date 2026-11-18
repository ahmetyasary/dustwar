import * as THREE from 'three';
import { TAU } from './math';

function makeCanvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

/** Parçacıklar ve izler için yumuşak, kenarları saydam bir daire. */
export function softDotTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Rüzgârın kumda bıraktığı asimetrik dalgacıklar (bump map).
 * Tüm frekanslar tam sayı periyotlu olduğu için doku kesintisiz tekrar eder.
 */
export function sandRippleTexture(size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const warp =
        0.35 * Math.sin(TAU * (v * 2 + 0.25 * Math.sin(TAU * u))) + 0.15 * Math.sin(TAU * (v * 5 + u * 2));
      const p = u * 16 + warp;
      const f = p - Math.floor(p);
      let r = f < 0.72 ? f / 0.72 : (1 - f) / 0.28; // yavaş yükselen, sert düşen sırt
      r = r * r * (3 - 2 * r);
      const val = Math.max(0, Math.min(255, (0.25 + r * 0.6) * 255 + (Math.random() - 0.5) * 40));
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Kum tanelerinin ince renk dokusu (vertex renkleriyle çarpılır). */
export function sandGrainTexture(size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    let v = 0.9 + Math.random() * 0.1;
    const r = Math.random();
    if (r < 0.04) v = 0.72 + Math.random() * 0.1; // koyu tane
    else if (r > 0.985) v = 1; // parlak kuvars
    const warm = Math.random() * 0.04;
    img.data[i * 4] = Math.min(255, (v + warm) * 255);
    img.data[i * 4 + 1] = v * 255;
    img.data[i * 4 + 2] = (v - warm) * 255;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
