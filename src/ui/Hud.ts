import * as THREE from 'three';
import { smoothstep } from '../utils/math';

/** Ekran üstü: kontroller, ayar paneli, fırtına uyarısı, ses ipucu ve “Uuufff!” baloncuğu. */
export class Hud {
  onToggleMute?: () => void;
  onVolume?: (v: number) => void;
  onToggleTic?: () => void;

  private readonly root: HTMLDivElement;
  private readonly storm: HTMLDivElement;
  private readonly bubble: HTMLDivElement;
  private readonly audioHint: HTMLDivElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly volume: HTMLInputElement;
  private readonly ticBtn: HTMLButtonElement;
  private bubbleTime = 0;
  private readonly v = new THREE.Vector3();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-controls">
        <div><b>Ok tuşları</b> hareket · <b>Shift</b> koş</div>
        <div><b>Boşluk</b> yumruk</div>
        <div><b>A / D</b> kamerayı döndür · <b>W / S</b> kamera açısı · <b>Tekerlek</b> yakınlaş</div>
        <div><b>M</b> sesi kapat/aç · <b>K</b> tik aç/kapat</div>
        <div><b>B</b> kum fırtınası · <b>T</b> tik (test)</div>
      </div>
      <div class="hud-settings">
        <button class="hud-btn hud-mute" type="button" title="Sesi kapat/aç (M)"></button>
        <input class="hud-volume" type="range" min="0" max="100" step="1" aria-label="Ses seviyesi" />
        <button class="hud-btn hud-tic" type="button" title="Tiki aç/kapat (K)"></button>
      </div>
      <div class="hud-storm">KUM FIRTINASI</div>
      <div class="hud-audio">Sesi açmak için herhangi bir tuşa bas</div>
      <div class="hud-bubble">Uuufff!</div>`;
    container.appendChild(this.root);
    this.storm = this.root.querySelector('.hud-storm')!;
    this.bubble = this.root.querySelector('.hud-bubble')!;
    this.audioHint = this.root.querySelector('.hud-audio')!;
    this.muteBtn = this.root.querySelector('.hud-mute')!;
    this.volume = this.root.querySelector('.hud-volume')!;
    this.ticBtn = this.root.querySelector('.hud-tic')!;

    // Odak panelde kalırsa Boşluk/ok tuşları butona ve kaydırıcıya gider → hemen bırak.
    this.muteBtn.addEventListener('click', () => {
      this.onToggleMute?.();
      this.muteBtn.blur();
    });
    this.ticBtn.addEventListener('click', () => {
      this.onToggleTic?.();
      this.ticBtn.blur();
    });
    this.volume.addEventListener('input', () => this.onVolume?.(Number(this.volume.value) / 100));
    this.volume.addEventListener('change', () => this.volume.blur());
    this.volume.addEventListener('pointerup', () => this.volume.blur());
  }

  setAudioState(muted: boolean, volume: number) {
    const silent = muted || volume === 0;
    this.muteBtn.textContent = silent ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
    this.muteBtn.classList.toggle('off', silent);
    this.volume.value = String(Math.round(volume * 100));
    this.volume.classList.toggle('off', muted);
  }

  setTicState(enabled: boolean) {
    this.ticBtn.textContent = enabled ? 'Tik: Açık' : 'Tik: Kapalı';
    this.ticBtn.classList.toggle('off', !enabled);
  }

  hideAudioHint() {
    this.audioHint.style.opacity = '0';
  }

  showBubble(text: string) {
    this.bubble.textContent = text;
    this.bubbleTime = 1.3;
  }

  update(dt: number, storm: number, camera: THREE.Camera, headTop: THREE.Vector3, width: number, height: number) {
    this.storm.style.opacity = String(smoothstep(0.25, 0.6, storm));

    if (this.bubbleTime > 0) {
      this.bubbleTime -= dt;
      this.v.copy(headTop).project(camera);
      const x = (this.v.x * 0.5 + 0.5) * width;
      const y = (-this.v.y * 0.5 + 0.5) * height;
      const age = 1.3 - this.bubbleTime;
      const pop = age < 0.12 ? 0.6 + (age / 0.12) * 0.5 : 1.1 - Math.min(0.1, (age - 0.12) * 0.6);
      this.bubble.style.transform = `translate(${x}px, ${y - 12 - age * 18}px) translate(-50%, -100%) scale(${pop})`;
      this.bubble.style.opacity = String(Math.min(1, this.bubbleTime * 3));
    } else {
      this.bubble.style.opacity = '0';
    }
  }

  dispose() {
    this.root.remove();
  }
}
