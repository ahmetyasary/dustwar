import * as THREE from 'three';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { Desert } from '../world/Desert';
import { Player } from '../player/Player';
import { AudioManager } from '../audio/AudioManager';
import { Dust } from '../fx/Dust';
import { Footprints } from '../fx/Footprints';
import { Hud } from '../ui/Hud';
import { loadSettings, saveSettings, type Settings } from './Settings';

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly input = new Input();
  readonly audio = new AudioManager();
  readonly desert: Desert;
  readonly player: Player;
  readonly rig: CameraRig;
  readonly hud: Hud;
  private readonly dust: Dust;
  private readonly footprints: Footprints;

  private readonly settings: Settings = loadSettings();
  private readonly timer = new THREE.Timer();
  private readonly headTop = new THREE.Vector3();
  private readonly onResize = () => this.resize();
  private readonly unlockAudio = () => {
    this.audio.unlock();
    this.hud.hideAudioHint();
  };

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1200);

    this.desert = new Desert(this.scene);
    this.dust = new Dust(this.scene);
    this.footprints = new Footprints(this.scene);
    this.player = new Player(this.scene, this.desert.terrain, this.desert.colliders, this.audio, this.dust, this.footprints);
    this.rig = new CameraRig(this.camera, this.renderer.domElement, this.desert.terrain);
    this.hud = new Hud(container);
    this.player.onTicSlap = () => this.hud.showBubble('Uuufff!');

    // ayarlar: ses seviyesi, sessiz, tik
    const s = this.settings;
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted);
    this.player.ticEnabled = s.ticEnabled;
    this.hud.setAudioState(s.muted, s.volume);
    this.hud.setTicState(s.ticEnabled);
    this.hud.onToggleMute = () => this.toggleMute();
    this.hud.onToggleTic = () => this.toggleTic();
    this.hud.onVolume = (v) => {
      s.volume = v;
      s.muted = false;
      this.audio.setVolume(v);
      this.audio.setMuted(false);
      this.hud.setAudioState(false, v);
      saveSettings(s);
    };

    window.addEventListener('keydown', this.unlockAudio);
    window.addEventListener('pointerdown', this.unlockAudio);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  toggleMute() {
    const s = this.settings;
    s.muted = !s.muted;
    // ses sıfırdayken açmak anlamsız: makul bir seviyeye getir
    if (!s.muted && s.volume === 0) s.volume = 0.5;
    this.audio.setVolume(s.volume);
    this.audio.setMuted(s.muted);
    this.hud.setAudioState(s.muted, s.volume);
    saveSettings(s);
  }

  toggleTic() {
    const s = this.settings;
    s.ticEnabled = !s.ticEnabled;
    this.player.ticEnabled = s.ticEnabled;
    this.hud.setTicState(s.ticEnabled);
    saveSettings(s);
  }

  start() {
    this.renderer.setAnimationLoop((time) => this.tick(time));
  }

  private tick(time: number) {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05); // büyük sıçramaları sınırla
    const storm = this.desert.storm;

    if (this.input.justPressed('KeyB')) storm.toggle();
    if (this.input.justPressed('KeyM')) this.toggleMute();
    if (this.input.justPressed('KeyK')) this.toggleTic();

    this.player.update(dt, this.input, this.rig, storm.intensity);
    this.rig.update(dt, this.input, this.player.position);
    this.desert.update(dt, this.player.position, this.camera);
    this.dust.update(dt, storm.wind, storm.windSpeed);
    this.footprints.update(dt, storm.intensity);
    this.audio.setWind(storm.intensity);
    this.hud.update(dt, storm.intensity, this.camera, this.player.headTop(this.headTop), this.container.clientWidth, this.container.clientHeight);

    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this.renderer.setAnimationLoop(null);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.unlockAudio);
    window.removeEventListener('pointerdown', this.unlockAudio);
    this.input.dispose();
    this.rig.dispose();
    this.hud.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
