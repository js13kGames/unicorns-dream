const { min, max, floor, random, exp, abs } = Math;

let audioCtx = null;

export function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!audioCtx && AudioContextClass) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function withAudio(callback) {
  const ctx = getAudioContext();
  if (ctx) callback(ctx, ctx.currentTime);
}

function setEnvelope(gain, volume, t, duration) {
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
}

function filterSource(ctx, currentSource, filter, t, duration) {
  if (filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type || 'lowpass';
    bq.frequency.setValueAtTime(filter.freq || 1000, t);
    if (filter.endFreq) {
      bq.frequency.exponentialRampToValueAtTime(max(1, filter.endFreq), t + (filter.duration || duration));
    } else if (filter.linearEndFreq) {
      bq.frequency.linearRampToValueAtTime(max(1, filter.linearEndFreq), t + (filter.duration || duration));
    }
    if (filter.Q) bq.Q.setValueAtTime(filter.Q, t);
    currentSource.connect(bq);
    currentSource = bq;
  }

  return currentSource;
}

export function tone(ctx, {
  type = 'sine',
  freq = 440,
  endFreq = null,
  sweepTimes = null,
  volume = 0.2,
  duration = 0.2,
  delay = 0,
  filter = null,
  pan = null
}) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(max(1, freq), t);

  if (sweepTimes && sweepTimes.length > 0) {
    sweepTimes.forEach(pt => {
      osc.frequency.exponentialRampToValueAtTime(max(1, pt.freq), t + pt.time);
    });
  } else if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(max(1, endFreq), t + duration);
  }

  setEnvelope(gain, volume, t, duration);

  let currentSource = osc;

  currentSource = filterSource(ctx, currentSource, filter, t, duration);

  if (pan !== null && ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime(max(-1, min(1, pan)), t);
    currentSource.connect(panner);
    panner.connect(gain);
  } else {
    currentSource.connect(gain);
  }

  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export function noise(ctx, {
  duration = 0.3,
  volume = 0.2,
  delay = 0,
  decayCoeff = 0.25,
  withImpulses = false,
  filter = null
}) {
  const t = ctx.currentTime + delay;
  const bufferSize = max(1, floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    const noiseVal = random() * 2 - 1;
    const impulse = withImpulses && random() < 0.04 ? (random() * 4 - 2) : 0;
    const decay = decayCoeff ? exp(-i / (bufferSize * decayCoeff)) : 1;
    data[i] = (noiseVal + impulse) * decay;
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  const gain = ctx.createGain();
  setEnvelope(gain, volume, t, duration);

  let currentSource = src;

  currentSource = filterSource(ctx, currentSource, filter, t, duration);

  currentSource.connect(gain);
  gain.connect(ctx.destination);
  src.start(t);
  src.stop(t + duration + 0.05);
}

function toneEffect(options) {
  return () => withAudio(ctx => tone(ctx, options));
}

const starFrequencies = [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50];

export function playStarChime(lane = 3) {
  withAudio((ctx) => {
    const freq = starFrequencies[lane % starFrequencies.length] || 659.25;
    tone(ctx, { type: 'sine', freq, endFreq: freq * 1.5, volume: 0.2, duration: 0.25 });
  });
}

export function playBonusPickupSound() {
  withAudio((ctx) => {
    const notes = [659.25, 830.61, 987.77, 1318.51];
    notes.forEach((freq, idx) => {
      const delay = idx * 0.038;
      // Primary crystal tone
      tone(ctx, { type: 'sine', freq, volume: 0.18, duration: 0.22, delay });
      // Glassy bell overtone
      tone(ctx, { type: 'triangle', freq: freq * 2.75, volume: 0.08, duration: 0.12, delay });
    });
    tone(ctx, { type: 'sine', freq: 1400, endFreq: 3600, volume: 0.12, duration: 0.18 });
  });
}

export function playTaaDaaSound() {
  withAudio((ctx) => {
    [523.25, 659.25, 783.99].forEach(freq => {
      tone(ctx, { type: 'sawtooth', freq, volume: 0.18, duration: 0.2 });
    });
    [523.25, 659.25, 783.99, 1046.50].forEach(freq => {
      tone(ctx, { type: 'sawtooth', freq, volume: 0.25, duration: 0.7, delay: 0.25 });
    });
  });
}

export const playJumpSwoosh = toneEffect({ type: 'triangle', freq: 220, endFreq: 440, volume: 0.15, duration: 0.18 });

export const playBoostSound = toneEffect({ type: 'sawtooth', freq: 150, endFreq: 600, volume: 0.2, duration: 0.35 });

export function playCrashSound() {
  withAudio((ctx) => {
    noise(ctx, {
      duration: 0.3,
      volume: 0.35,
      decayCoeff: 0.25,
      filter: { type: 'lowpass', freq: 400, linearEndFreq: 80, duration: 0.3 }
    });
  });
}

export function playGlassShatterSound() {
  withAudio((ctx) => {
    noise(ctx, {
      duration: 0.4,
      volume: 0.4,
      decayCoeff: 0.25,
      withImpulses: true,
      filter: { type: 'bandpass', freq: 4000, linearEndFreq: 1800, duration: 0.4, Q: 5.0 }
    });
    [2400, 3500, 4800, 6200].forEach((freq, idx) => {
      tone(ctx, {
        type: 'triangle',
        freq: freq + (random() - 0.5) * 300,
        volume: 0.12,
        duration: 0.2,
        delay: idx * 0.025
      });
    });
  });
}

export function playSlowMotionSound() {
  withAudio((ctx) => {
    tone(ctx, { type: 'sine', freq: 150, endFreq: 36, volume: 0.35, duration: 0.7 });
    noise(ctx, {
      duration: 0.6,
      volume: 0.28,
      decayCoeff: 0.45,
      filter: { type: 'lowpass', freq: 1400, endFreq: 160, duration: 0.55 }
    });
  });
}

export function playAllLivesLostSound() {
  withAudio((ctx) => {
    tone(ctx, {
      type: 'sawtooth',
      freq: 175,
      endFreq: 28,
      volume: 0.38,
      duration: 1.25,
      filter: { type: 'lowpass', freq: 420, endFreq: 45, duration: 1.2 }
    });
    // Descending Game Over motif
    const lamentNotes = [
      { freq: 392.00, delay: 0.14, dur: 0.28 },
      { freq: 349.23, delay: 0.44, dur: 0.28 },
      { freq: 311.13, delay: 0.74, dur: 0.32 },
      { freq: 246.94, delay: 1.08, dur: 0.75 }
    ];
    lamentNotes.forEach(({ freq, delay, dur }) => {
      tone(ctx, {
        type: 'triangle',
        freq,
        endFreq: freq * 0.94,
        volume: 0.24,
        duration: dur,
        delay,
        filter: { type: 'lowpass', freq: 1200, endFreq: 350, duration: dur }
      });
    });
    noise(ctx, {
      duration: 1.4,
      volume: 0.22,
      decayCoeff: 0.4,
      filter: { type: 'bandpass', freq: 600, endFreq: 90, duration: 1.4, Q: 2.0 }
    });
  });
}

export const playShieldSound = toneEffect({ type: 'sine', freq: 300, endFreq: 600, volume: 0.25, duration: 0.35 });

export function playDashSound() {
  withAudio((ctx) => {
    tone(ctx, {
      type: 'sawtooth',
      freq: 220,
      sweepTimes: [
        { freq: 950, time: 0.12 },
        { freq: 280, time: 0.32 }
      ],
      volume: 0.3,
      duration: 0.32,
      filter: { type: 'lowpass', freq: 3200, endFreq: 800, duration: 0.32 }
    });
  });
}

let isPlayingMusic = false;
let musicInterval = null;
let currentLevel = 0;
let currentPlayerLane = 3;
export const MUSIC_BPM = 114;
let songStartTime = 0;

export function getMusicBeatPhase(fallbackTimeSec) {
  const beatSec = 60 / MUSIC_BPM;
  const ctx = getAudioContext();
  if (isPlayingMusic && ctx) {
    const elapsed = max(0, ctx.currentTime - songStartTime);
    return (elapsed % beatSec) / beatSec;
  }
  const t = typeof fallbackTimeSec === 'number' ? fallbackTimeSec : performance.now() * 0.001;
  return (t % beatSec) / beatSec;
}

export function updateMusicLevel(levelIndex) {
  currentLevel = levelIndex;
}

export function updatePlayerLane(laneIndex) {
  currentPlayerLane = max(0, min(6, laneIndex));
}

export function startSynthwaveMusic() {
  if (isPlayingMusic) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  isPlayingMusic = true;
  songStartTime = ctx.currentTime;

  let step = 0;
  const laneSemitoneShifts = [-2, 0, 2, 4, 5, 7, 9];
  const baseBassNotes = [110, 110, 123.47, 130.81, 110, 98.00, 110, 146.83];
  const complexBassNotes = [110, 164.81, 123.47, 196.00, 130.81, 98.00, 220.00, 146.83];
  const baseArpNotes = [440, 523.25, 659.25, 783.99, 880, 783.99, 659.25, 523.25];
  const highArpNotes = [659.25, 783.99, 880, 1046.50, 1174.66, 1046.50, 880, 783.99];
  const getStepDuration = () => 60 / MUSIC_BPM / 4;

  const onTick = () => {
    if (!isPlayingMusic) return;
    const currentCtx = getAudioContext();
    if (!currentCtx) return;

    const levelComplexity = currentLevel;
    const laneShift = laneSemitoneShifts[currentPlayerLane] || 0;
    const pitchMultiplier = 2 ** (laneShift / 12);
    const panValue = (currentPlayerLane - 3) / 3.0;

    const bassStepInterval = levelComplexity >= 3 ? 1 : 2;
    if (step % bassStepInterval === 0) {
      const bassSeq = levelComplexity >= 3 ? complexBassNotes : baseBassNotes;
      const freq = bassSeq[floor(step / bassStepInterval) % bassSeq.length] * pitchMultiplier * 0.5;
      const laneFilterBoost = (6 - abs(currentPlayerLane - 3)) * 25;
      tone(currentCtx, {
        type: 'sawtooth',
        freq,
        volume: 0.28,
        duration: 0.3,
        filter: {
          type: 'lowpass',
          freq: 350 + levelComplexity * 50 + laneFilterBoost,
          endFreq: 100,
          duration: 0.25
        },
        pan: panValue * 0.3
      });
    }

    if (levelComplexity >= 1) {
      const arpSeq = (levelComplexity >= 5 && step % 2 === 0) ? highArpNotes : baseArpNotes;
      const arpFreq = arpSeq[step % arpSeq.length] * pitchMultiplier;
      tone(currentCtx, {
        type: levelComplexity >= 5 ? 'triangle' : 'sine',
        freq: arpFreq,
        volume: 0.04 + min(0.04, levelComplexity * 0.008),
        duration: 0.15
      });
    }

    if (step % 4 === 0) {
      tone(currentCtx, {
        type: 'sine',
        freq: 140,
        endFreq: 35,
        volume: 0.35,
        duration: 0.2
      });
    }

    if (levelComplexity >= 4 && step % 8 === 4) {
      noise(currentCtx, {
        duration: 0.12,
        volume: 0.18,
        decayCoeff: 0.3,
        filter: { type: 'highpass', freq: 1500 }
      });
    }

    if (levelComplexity === 2 && step % 8 === 0) {
      [220, 329.63, 440].forEach((baseFreq, idx) => {
        tone(currentCtx, {
          type: 'sine',
          freq: baseFreq * pitchMultiplier,
          volume: 0.02,
          duration: 0.5,
          delay: idx * 0.02
        });
      });
    }

    step = (step + 1) % 32;

    if (isPlayingMusic) {
      musicInterval = setTimeout(onTick, getStepDuration() * 1000);
    }
  };

  onTick();
}

export function stopSynthwaveMusic() {
  if (musicInterval) {
    clearTimeout(musicInterval);
    musicInterval = null;
  }
  isPlayingMusic = false;
}
