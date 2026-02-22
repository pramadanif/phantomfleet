/**
 * Sound Engine — Procedural Audio for Phantom Fleet
 * 
 * Uses Web Audio API to generate all game sounds procedurally.
 * No external audio files needed. Works in any modern browser.
 */

type SoundName =
    | 'shot_fire'
    | 'hit_explosion'
    | 'miss_splash'
    | 'proof_generating'
    | 'proof_complete'
    | 'ship_place'
    | 'game_start'
    | 'victory'
    | 'defeat'
    | 'bot_fire'
    | 'sonar_ping'
    | 'ui_click'
    | 'ui_hover';

class SoundEngine {
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private musicGain: GainNode | null = null;
    private sfxGain: GainNode | null = null;
    private musicOsc: OscillatorNode | null = null;
    private musicLfo: OscillatorNode | null = null;
    private isMusicPlaying = false;
    private enabled = true;

    private ensureContext() {
        if (!this.ctx) {
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.6;
            this.masterGain.connect(this.ctx.destination);

            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = 0.12;
            this.musicGain.connect(this.masterGain);

            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = 0.5;
            this.sfxGain.connect(this.masterGain);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    toggle() {
        this.enabled = !this.enabled;
        if (!this.enabled && this.masterGain) {
            this.masterGain.gain.value = 0;
        } else if (this.enabled && this.masterGain) {
            this.masterGain.gain.value = 0.6;
        }
        return this.enabled;
    }

    isEnabled() { return this.enabled; }

    play(sound: SoundName) {
        if (!this.enabled) return;
        const ctx = this.ensureContext();
        const now = ctx.currentTime;

        switch (sound) {
            case 'shot_fire': this.playShotFire(ctx, now); break;
            case 'hit_explosion': this.playHitExplosion(ctx, now); break;
            case 'miss_splash': this.playMissSplash(ctx, now); break;
            case 'proof_generating': this.playProofGenerating(ctx, now); break;
            case 'proof_complete': this.playProofComplete(ctx, now); break;
            case 'ship_place': this.playShipPlace(ctx, now); break;
            case 'game_start': this.playGameStart(ctx, now); break;
            case 'victory': this.playVictory(ctx, now); break;
            case 'defeat': this.playDefeat(ctx, now); break;
            case 'bot_fire': this.playBotFire(ctx, now); break;
            case 'sonar_ping': this.playSonarPing(ctx, now); break;
            case 'ui_click': this.playUIClick(ctx, now); break;
            case 'ui_hover': this.playUIHover(ctx, now); break;
        }
    }

    // ── Ambient Music ──────────────────────────────────────

    startMusic() {
        if (this.isMusicPlaying || !this.enabled) return;
        const ctx = this.ensureContext();
        this.isMusicPlaying = true;

        // Dark ambient drone
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 55; // A1 — deep bass drone

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 82.5; // E2 — fifth above

        const osc3 = ctx.createOscillator();
        osc3.type = 'triangle';
        osc3.frequency.value = 110; // A2 — octave

        // LFO for underwater pulsating effect
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = 0.08; // Very slow pulse

        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.04;
        lfo.connect(lfoGain);
        lfoGain.connect(osc1.frequency);

        // Noise floor (ocean ambience)
        const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * 0.015;
        }
        const noiseSource = ctx.createBufferSource();
        noiseSource.buffer = noiseBuffer;
        noiseSource.loop = true;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.value = 200;
        noiseFilter.Q.value = 1;

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(this.musicGain!);

        // Mix oscillators
        const oscGain1 = ctx.createGain();
        oscGain1.gain.value = 0.15;
        osc1.connect(oscGain1);
        oscGain1.connect(this.musicGain!);

        const oscGain2 = ctx.createGain();
        oscGain2.gain.value = 0.08;
        osc2.connect(oscGain2);
        oscGain2.connect(this.musicGain!);

        const oscGain3 = ctx.createGain();
        oscGain3.gain.value = 0.05;
        osc3.connect(oscGain3);
        oscGain3.connect(this.musicGain!);

        osc1.start();
        osc2.start();
        osc3.start();
        lfo.start();
        noiseSource.start();

        this.musicOsc = osc1;
        this.musicLfo = lfo;

        // Periodic sonar pings
        const pingInterval = setInterval(() => {
            if (!this.isMusicPlaying) {
                clearInterval(pingInterval);
                return;
            }
            if (Math.random() > 0.4) {
                this.playSonarPing(ctx, ctx.currentTime);
            }
        }, 6000);
    }

    stopMusic() {
        this.isMusicPlaying = false;
        if (this.musicOsc) { try { this.musicOsc.stop(); } catch { } }
        if (this.musicLfo) { try { this.musicLfo.stop(); } catch { } }
    }

    // ── Sound Effects ──────────────────────────────────────

    private playShotFire(ctx: AudioContext, t: number) {
        // Cannon blast — white noise burst + low boom
        const noiseLen = 0.15;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.03));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 800;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.6, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        noise.start(t);

        // Low boom
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(120, t);
        osc.frequency.exponentialRampToValueAtTime(40, t + 0.2);

        const boomGain = ctx.createGain();
        boomGain.gain.setValueAtTime(0.8, t);
        boomGain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

        osc.connect(boomGain);
        boomGain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.35);
    }

    private playHitExplosion(ctx: AudioContext, t: number) {
        // Large explosion — layered noise + sub bass + crackle
        const noiseLen = 0.8;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * noiseLen, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.15));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2000, t);
        filter.frequency.exponentialRampToValueAtTime(200, t + 0.5);
        filter.Q.value = 2;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        noise.start(t);

        // Sub-bass thud
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(80, t);
        osc.frequency.exponentialRampToValueAtTime(20, t + 0.5);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(1.0, t);
        subGain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);

        osc.connect(subGain);
        subGain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.7);
    }

    private playMissSplash(ctx: AudioContext, t: number) {
        // Water splash — filtered noise
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.08));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(3000, t);
        filter.frequency.exponentialRampToValueAtTime(500, t + 0.3);
        filter.Q.value = 3;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        noise.start(t);
    }

    private playProofGenerating(ctx: AudioContext, t: number) {
        // Electronic hum with rising pitch
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.linearRampToValueAtTime(800, t + 2);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 600;
        filter.Q.value = 8;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.08, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 1.5);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 2.5);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 2.5);
    }

    private playProofComplete(ctx: AudioContext, t: number) {
        // Ascending chime — success sound
        const notes = [523, 659, 784]; // C5, E5, G5
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.3, t + i * 0.1);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.1 + 0.4);

            osc.connect(gain);
            gain.connect(this.sfxGain!);
            osc.start(t + i * 0.1);
            osc.stop(t + i * 0.1 + 0.5);
        });
    }

    private playShipPlace(ctx: AudioContext, t: number) {
        // Metallic clank
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(300, t);
        osc.frequency.exponentialRampToValueAtTime(100, t + 0.1);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    private playGameStart(ctx: AudioContext, t: number) {
        // Battle stations alarm — two-tone rising
        [0, 0.3, 0.6].forEach((delay) => {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(440, t + delay);
            osc.frequency.setValueAtTime(554, t + delay + 0.15);

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.2, t + delay);
            gain.gain.exponentialRampToValueAtTime(0.01, t + delay + 0.28);

            osc.connect(gain);
            gain.connect(this.sfxGain!);
            osc.start(t + delay);
            osc.stop(t + delay + 0.3);
        });
    }

    private playVictory(ctx: AudioContext, t: number) {
        // Triumphant fanfare — major chord arpeggio
        const notes = [262, 330, 392, 523, 659, 784]; // C major ascending
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0, t + i * 0.12);
            gain.gain.linearRampToValueAtTime(0.3, t + i * 0.12 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.12 + 0.8);

            osc.connect(gain);
            gain.connect(this.sfxGain!);
            osc.start(t + i * 0.12);
            osc.stop(t + i * 0.12 + 1.0);
        });
    }

    private playDefeat(ctx: AudioContext, t: number) {
        // Descending minor — somber
        const notes = [440, 415, 349, 330, 262, 220]; // Descending A minor
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.2, t + i * 0.2);
            gain.gain.exponentialRampToValueAtTime(0.01, t + i * 0.2 + 0.6);

            osc.connect(gain);
            gain.connect(this.sfxGain!);
            osc.start(t + i * 0.2);
            osc.stop(t + i * 0.2 + 0.8);
        });
    }

    private playBotFire(ctx: AudioContext, t: number) {
        // Distant cannon — muffled version of shot_fire
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(90, t);
        osc.frequency.exponentialRampToValueAtTime(30, t + 0.3);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.4, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 0.4);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.45);
    }

    private playSonarPing(ctx: AudioContext, t: number) {
        // Classic sonar ping
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(800, t + 0.3);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

        const reverb = ctx.createConvolver();
        const reverbLen = 2;
        const reverbBuf = ctx.createBuffer(2, ctx.sampleRate * reverbLen, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = reverbBuf.getChannelData(ch);
            for (let i = 0; i < d.length; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.8));
            }
        }
        reverb.buffer = reverbBuf;

        const reverbGain = ctx.createGain();
        reverbGain.gain.value = 0.3;

        osc.connect(gain);
        gain.connect(this.sfxGain!);
        gain.connect(reverb);
        reverb.connect(reverbGain);
        reverbGain.connect(this.sfxGain!);

        osc.start(t);
        osc.stop(t + 0.3);
    }

    private playUIClick(ctx: AudioContext, t: number) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 800;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.08);
    }

    private playUIHover(ctx: AudioContext, t: number) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = 600;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.05, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(t);
        osc.stop(t + 0.06);
    }
}

// Singleton
export const soundEngine = new SoundEngine();
