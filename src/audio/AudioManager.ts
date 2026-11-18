/**
 * Tüm sesler Web Audio ile sentezlenir (dosya gerekmez).
 * `public/assets/sounds/uff.mp3` varsa “uuufff” için o kayıt kullanılır.
 * Tarayıcılar sesi ancak bir kullanıcı etkileşiminden sonra açar → unlock().
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windBand!: BiquadFilterNode;
  private howlGain!: GainNode;
  private uffSample: AudioBuffer | null = null;
  private _volume = 0.8;
  private _muted = false;

  get ready() {
    return this.ctx !== null;
  }

  get volume() {
    return this._volume;
  }
  get muted() {
    return this._muted;
  }

  /** 0..1 */
  setVolume(v: number) {
    this._volume = Math.min(1, Math.max(0, v));
    this.applyVolume();
  }

  setMuted(m: boolean) {
    this._muted = m;
    this.applyVolume();
  }

  private applyVolume() {
    if (!this.ctx) return;
    const target = this._muted ? 0 : this._volume;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.03);
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : this._volume;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startWind();
    void this.loadSample(`${import.meta.env.BASE_URL}assets/sounds/uff.mp3`).then((b) => (this.uffSample = b));
  }

  private async loadSample(url: string) {
    try {
      const r = await fetch(url);
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || !(type.startsWith('audio') || type.includes('octet-stream'))) return null;
      return await this.ctx!.decodeAudioData(await r.arrayBuffer());
    } catch {
      return null;
    }
  }

  private noiseSource(loop = false) {
    const s = this.ctx!.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    return s;
  }

  private filter(type: BiquadFilterType, freq: number, q = 1) {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private gain(v = 0) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    return g;
  }

  // ---------------------------------------------------------------- rüzgâr

  private startWind() {
    const ctx = this.ctx!;
    const src = this.noiseSource(true);
    this.windBand = this.filter('bandpass', 380, 0.8);
    const lp = this.filter('lowpass', 1400);
    this.windGain = this.gain(0.035);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.17;
    const lfoAmt = this.gain(160);
    lfo.connect(lfoAmt).connect(this.windBand.frequency);
    src.connect(this.windBand).connect(lp).connect(this.windGain).connect(this.master);

    // fırtınada uğuldayan ıslık
    const src2 = this.noiseSource(true);
    const howl = this.filter('bandpass', 750, 9);
    this.howlGain = this.gain(0);
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.31;
    const lfo2Amt = this.gain(220);
    lfo2.connect(lfo2Amt).connect(howl.frequency);
    src2.connect(howl).connect(this.howlGain).connect(this.master);

    src.start();
    src2.start(0, 0.7);
    lfo.start();
    lfo2.start();
  }

  /** 0 = sakin, 1 = tam fırtına */
  setWind(level: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.035 + level * 0.5, t, 0.4);
    this.windBand.frequency.setTargetAtTime(380 + level * 600, t, 0.4);
    this.howlGain.gain.setTargetAtTime(level * level * 0.5, t, 0.6);
  }

  // ---------------------------------------------------------------- efektler

  /** Tikteki “uuufff” iç çekişi: formant filtreli ses + “fff” nefesi. */
  uff() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + 0.04;
    if (this.uffSample) {
      const s = ctx.createBufferSource();
      s.buffer = this.uffSample;
      s.connect(this.master);
      s.start(t);
      return;
    }
    const out = this.gain(1);
    out.connect(this.master);

    // ses telleri: alçalan perdeli testere dalga + biraz nefes
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const pitch = 165 + Math.random() * 25;
    osc.frequency.setValueAtTime(pitch, t);
    osc.frequency.linearRampToValueAtTime(pitch * 0.92, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(pitch * 0.55, t + 0.62);
    const vib = ctx.createOscillator();
    vib.frequency.value = 6;
    const vibAmt = this.gain(3);
    vib.connect(vibAmt).connect(osc.frequency);
    const breath = this.noiseSource();
    const breathAmt = this.gain(0.22);
    const voice = this.gain(1);
    osc.connect(voice);
    breath.connect(breathAmt).connect(voice);

    // “u” ünlüsü formantları
    const vowel = this.gain(0);
    vowel.gain.setValueAtTime(0, t);
    vowel.gain.linearRampToValueAtTime(1, t + 0.05);
    vowel.gain.linearRampToValueAtTime(0.8, t + 0.42);
    vowel.gain.linearRampToValueAtTime(0, t + 0.62);
    for (const [f, q, g] of [
      [320, 6, 3],
      [780, 8, 1.3],
      [2400, 10, 0.25],
    ]) {
      voice.connect(this.filter('bandpass', f, q)).connect(this.gain(g)).connect(vowel);
    }
    vowel.connect(out);

    // “fff”
    const f = this.noiseSource();
    const fEnv = this.gain(0);
    fEnv.gain.setValueAtTime(0, t + 0.4);
    fEnv.gain.linearRampToValueAtTime(0.3, t + 0.55);
    fEnv.gain.linearRampToValueAtTime(0.22, t + 0.85);
    fEnv.gain.linearRampToValueAtTime(0, t + 1.08);
    f.connect(this.filter('highpass', 1600)).connect(this.filter('lowpass', 7500)).connect(fEnv).connect(out);

    osc.start(t);
    vib.start(t);
    breath.start(t, Math.random());
    f.start(t, Math.random());
    for (const n of [osc, vib, breath, f]) n.stop(t + 1.15);
  }

  /** Elin kafaya çarpması: kısa “şap” + boğuk tok ses. */
  slap() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSource();
    const env = this.gain(0);
    env.gain.setValueAtTime(0.9, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(this.filter('bandpass', 1300, 0.9)).connect(env).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.1);

    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    const oe = this.gain(0);
    oe.gain.setValueAtTime(0.6, t);
    oe.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(oe).connect(this.master);
    o.start(t);
    o.stop(t + 0.15);
  }

  /** Yumruğun havayı yarması. */
  whoosh() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSource();
    const bp = this.filter('bandpass', 350, 2.5);
    bp.frequency.setValueAtTime(350, t);
    bp.frequency.exponentialRampToValueAtTime(1600 + Math.random() * 400, t + 0.12);
    const env = this.gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.55, t + 0.06);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    n.connect(bp).connect(env).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.22);
  }

  /** Kumda ayak sesi. */
  step(run: boolean) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const n = this.noiseSource();
    n.playbackRate.value = 0.7 + Math.random() * 0.5;
    const env = this.gain(0);
    env.gain.setValueAtTime(run ? 0.16 : 0.1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    n.connect(this.filter('bandpass', 1800 + Math.random() * 800, 0.7)).connect(env).connect(this.master);
    n.start(t, Math.random());
    n.stop(t + 0.1);
  }
}
