import { TabScore, TabEvent, BendType, HarmonicType } from '../types';
import { eventUnits, measureCapacity } from './tabs';
import { getNoteAtPosition } from './theory';

export type PlaybackArticulation = 'legato' | 'ring' | 'staccato';

export interface TabPlaybackOptions {
  articulation?: PlaybackArticulation;
  volume?: number;
  speed?: number;
  metronome?: boolean;
  loopMeasure?: number | null;
}

export interface TabPlaybackController {
  stop: () => void;
  pause: () => void;
  resume: () => void;
  isPlaying: boolean;
  isPaused: boolean;
}

interface ScheduledEvent {
  m: number;
  slot: number;
  timeSec: number;
  durationSec: number;
  ev: TabEvent;
  nextEv?: TabEvent;
}

/**
 * Creates a custom PeriodicWave for AudioContext representing acoustic guitar string overtones.
 * Derived from physical harmonics: strong fundamental, warm 2nd/3rd, decaying higher partials.
 */
function createGuitarPeriodicWave(ctx: AudioContext): PeriodicWave {
  const n = 32;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);

  const harmonicWeights = [
    0,     // DC
    1.0,   // 1: Fundamental
    0.62,  // 2: Octave
    0.40,  // 3: 12th
    0.26,  // 4: 2 Octaves
    0.17,  // 5: Major 17th
    0.11,  // 6: Octave + 5th
    0.075, // 7
    0.05,  // 8
    0.035, // 9
    0.025, // 10
    0.018, // 11
    0.012  // 12
  ];

  for (let i = 1; i < n; i++) {
    const sign = i % 2 === 0 ? -1 : 1;
    if (i < harmonicWeights.length) {
      imag[i] = harmonicWeights[i] * sign;
    } else {
      imag[i] = (0.12 / i) * sign;
    }
  }

  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/**
 * Generates an acoustic studio room convolution impulse response in memory.
 */
function createRoomReverb(ctx: AudioContext, duration = 1.2, decay = 2.8): ConvolverNode {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulse = ctx.createBuffer(2, length, sampleRate);
  const left = impulse.getChannelData(0);
  const right = impulse.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / length;
    const env = Math.pow(1 - t, decay);
    left[i] = (Math.random() * 2 - 1) * env;
    right[i] = (Math.random() * 2 - 1) * env;
  }

  const convolver = ctx.createConvolver();
  convolver.buffer = impulse;
  return convolver;
}

function playMetronomeClick(ctx: AudioContext, time: number, accented: boolean, masterGain: GainNode) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(accented ? 1200 : 880, time);
  osc.frequency.exponentialRampToValueAtTime(accented ? 600 : 440, time + 0.035);
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(accented ? 0.24 : 0.14, time + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(time);
  osc.stop(time + 0.05);
}

const BEND_SEMITONES: Record<BendType, number> = {
  half: 1,
  full: 2,
  '1.5': 3,
  '2': 4,
};

/**
 * Synthesizes a single guitar voice with warm acoustic timbre, rich body resonance,
 * and expressive guitar techniques (bends, vibrato, palm mute, harmonics, ghost notes).
 */
function playGuitarVoice(
  ctx: AudioContext,
  freq: number,
  startTime: number,
  nominalDurationSec: number,
  voiceDurationSec: number,
  articulation: PlaybackArticulation,
  isHammer: boolean,
  hasSlide: boolean,
  slideTargetFreq: number | null,
  bend: BendType | null,
  hasVibrato: boolean,
  harmonic: HarmonicType | null,
  isGhost: boolean,
  isPalmMute: boolean,
  isAccent: boolean,
  isStaccato: boolean,
  isLetRing: boolean,
  dryGainNode: GainNode,
  wetGainNode: GainNode,
  guitarWave: PeriodicWave
) {
  let effectiveArt = articulation;
  if (isStaccato) effectiveArt = 'staccato';
  else if (isLetRing) effectiveArt = 'ring';

  let activeDuration = voiceDurationSec;
  if (isPalmMute) {
    activeDuration = Math.max(0.06, Math.min(0.28, voiceDurationSec * 0.42));
  } else if (effectiveArt === 'staccato') {
    activeDuration = Math.max(0.08, voiceDurationSec * 0.45);
  } else if (effectiveArt === 'ring') {
    activeDuration = Math.max(voiceDurationSec, Math.min(3.2, voiceDurationSec * 2.2));
  }

  const effectiveFreq = harmonic === 'natural' ? freq * 2 : harmonic === 'pinch' ? freq * 3 : freq;
  const attackTime = isHammer ? 0.016 : harmonic ? 0.012 : 0.005;
  const velScale = (isGhost ? 0.38 : 1.0) * (isAccent ? 1.35 : 1.0) * (isPalmMute ? 0.85 : 1.0);
  const peakVol = 0.22 * velScale;
  const sustainVol = peakVol * 0.78;

  const releaseTime = Math.min(0.026, activeDuration * 0.18);
  const sustainEndTime = Math.max(startTime + attackTime + 0.03, startTime + activeDuration - releaseTime);
  const stopTime = startTime + activeDuration;

  const osc = ctx.createOscillator();
  if (harmonic) {
    osc.type = 'sine';
  } else {
    osc.setPeriodicWave(guitarWave);
  }
  osc.frequency.setValueAtTime(effectiveFreq, startTime);

  const oscChorus = ctx.createOscillator();
  oscChorus.type = 'triangle';
  oscChorus.frequency.setValueAtTime(effectiveFreq, startTime);
  oscChorus.detune.setValueAtTime(2.5, startTime);
  const chorusGain = ctx.createGain();
  chorusGain.gain.setValueAtTime(harmonic ? 0.08 : 0.18, startTime);
  oscChorus.connect(chorusGain);

  // Slide pitch bend
  if (hasSlide && slideTargetFreq !== null) {
    const slideStart = startTime + nominalDurationSec * 0.45;
    const slideEnd = startTime + nominalDurationSec * 0.95;
    osc.frequency.setValueAtTime(effectiveFreq, slideStart);
    osc.frequency.exponentialRampToValueAtTime(slideTargetFreq, slideEnd);
    oscChorus.frequency.setValueAtTime(effectiveFreq, slideStart);
    oscChorus.frequency.exponentialRampToValueAtTime(slideTargetFreq, slideEnd);
  }

  // String Bend
  if (bend && BEND_SEMITONES[bend]) {
    const semitones = BEND_SEMITONES[bend];
    const targetFreq = effectiveFreq * Math.pow(2, semitones / 12);
    const bendStart = startTime + Math.min(0.06, nominalDurationSec * 0.2);
    const bendPeak = startTime + Math.min(nominalDurationSec * 0.65, 0.35);
    osc.frequency.setValueAtTime(effectiveFreq, bendStart);
    osc.frequency.exponentialRampToValueAtTime(targetFreq, bendPeak);
    oscChorus.frequency.setValueAtTime(effectiveFreq, bendStart);
    oscChorus.frequency.exponentialRampToValueAtTime(targetFreq, bendPeak);
  }

  // Vibrato LFO
  let lfo: OscillatorNode | null = null;
  if (hasVibrato && activeDuration > 0.12) {
    lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5.6, startTime);
    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, startTime);
    lfoGain.gain.linearRampToValueAtTime(20, startTime + Math.min(0.12, activeDuration * 0.3));
    lfo.connect(lfoGain);
    lfoGain.connect(osc.detune);
    lfoGain.connect(oscChorus.detune);
    lfo.start(startTime);
    lfo.stop(stopTime + 0.05);
  }

  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'peaking';
  bodyFilter.frequency.setValueAtTime(210, startTime);
  bodyFilter.Q.setValueAtTime(1.3, startTime);
  bodyFilter.gain.setValueAtTime(isPalmMute ? 1.0 : 3.0, startTime);

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const initialCutoff = isPalmMute
    ? Math.min(1400, Math.max(600, effectiveFreq * 2.5))
    : Math.min(7000, Math.max(1800, effectiveFreq * 7));
  const sustainCutoff = isPalmMute
    ? 650
    : Math.min(3600, Math.max(1000, effectiveFreq * 3));
  filter.frequency.setValueAtTime(initialCutoff, startTime);
  filter.frequency.exponentialRampToValueAtTime(
    sustainCutoff,
    startTime + Math.min(activeDuration, isPalmMute ? 0.14 : 0.7)
  );

  if (!isHammer && !harmonic && ctx.sampleRate) {
    const bufferSize = Math.floor(ctx.sampleRate * 0.01);
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const decay = 1 - (i / bufferSize);
      channel[i] = (Math.random() * 2 - 1) * decay * decay;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(isPalmMute ? 1100 : 2400, startTime);
    noiseFilter.Q.setValueAtTime(1.6, startTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.04 * velScale, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.01);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);

    noiseSource.start(startTime);
    noiseSource.stop(startTime + 0.012);
  }

  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, startTime);
  voiceGain.gain.linearRampToValueAtTime(peakVol, startTime + attackTime);
  voiceGain.gain.exponentialRampToValueAtTime(sustainVol, startTime + attackTime + 0.05);

  const endSustainVol = sustainVol * Math.max(isPalmMute ? 0.2 : 0.55, Math.exp(-0.25 * (activeDuration / 1.0)));
  voiceGain.gain.setValueAtTime(sustainVol, startTime + attackTime + 0.05);
  voiceGain.gain.linearRampToValueAtTime(endSustainVol, sustainEndTime);
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  osc.connect(filter);
  chorusGain.connect(filter);
  filter.connect(bodyFilter);
  bodyFilter.connect(voiceGain);

  voiceGain.connect(dryGainNode);
  voiceGain.connect(wetGainNode);

  osc.start(startTime);
  oscChorus.start(startTime);
  osc.stop(stopTime + 0.05);
  oscChorus.stop(stopTime + 0.05);
}

export const startTabPlayback = (
  score: TabScore,
  startFrom: { m: number; slot: number } = { m: 0, slot: 0 },
  onCursor: (c: { m: number; slot: number } | null) => void,
  onFinished: () => void,
  options?: TabPlaybackOptions
): TabPlaybackController => {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    onFinished();
    return { stop: () => {}, pause: () => {}, resume: () => {}, isPlaying: false, isPaused: false };
  }

  const ctx = new AudioCtx();
  let stopped = false;
  let paused = false;
  let animFrameId: number | null = null;

  const articulation: PlaybackArticulation = options?.articulation || score.playbackArticulation || 'legato';
  const masterVolume = Math.max(0, Math.min(1.5, options?.volume ?? 1.0));
  const speed = Math.max(0.25, Math.min(2.0, options?.speed ?? 1.0));
  const tuningId = score.tuningId || 'standard';
  const metronome = !!options?.metronome;
  const loopMeasure = options?.loopMeasure ?? null;

  // Build measure playback order (handles loopMeasure or repeatStart/repeatEnd/endings)
  const measureOrder: number[] = [];
  if (loopMeasure !== null && score.measures[loopMeasure]) {
    // Schedule 16 loops of the single measure for practice
    for (let r = 0; r < 16; r++) measureOrder.push(loopMeasure);
  } else {
    let mi = startFrom.m;
    let lastRepeatStart = 0;
    const repeatDone: Record<number, number> = {};
    let guard = 0;
    while (mi < score.measures.length && guard < 256) {
      guard++;
      const m = score.measures[mi];
      if (m.repeatStart) lastRepeatStart = mi;
      const pass = repeatDone[mi] ?? 0;
      if (m.ending === '1.' && pass > 0) {
        mi++;
        continue;
      }
      measureOrder.push(mi);
      if (m.repeatEnd) {
        const targetRepeats = (m.repeatCount ?? 2) - 1;
        const count = repeatDone[mi] ?? 0;
        if (count < targetRepeats) {
          repeatDone[mi] = count + 1;
          mi = lastRepeatStart;
          continue;
        }
      }
      mi++;
    }
  }

  // 1. Build flat list of all playable events & metronome clicks
  const timeline: ScheduledEvent[] = [];
  const metronomeClicks: { timeSec: number; accented: boolean }[] = [];
  let totalTime = 0;

  measureOrder.forEach((mi, orderIdx) => {
    const m = score.measures[mi];
    const tempo = (m.tempo || 120) * speed;
    const startSlot = orderIdx === 0 && loopMeasure === null ? startFrom.slot : 0;

    // Schedule metronome clicks for this measure
    if (metronome && m.events.length > 0) {
      const beatUnits = 64 / m.timeSig.den;
      const mUnits = m.events.slice(startSlot).reduce((a, e) => a + eventUnits(e), 0);
      const beats = Math.max(1, Math.round(mUnits / beatUnits));
      for (let b = 0; b < beats; b++) {
        const clickTime = totalTime + ((b * beatUnits) / 16) * (60 / tempo);
        metronomeClicks.push({ timeSec: clickTime, accented: b === 0 });
      }
    }

    for (let ei = startSlot; ei < m.events.length; ei++) {
      const ev = m.events[ei];
      const durSec = (eventUnits(ev) / 16) * (60 / tempo);

      let nextEv: TabEvent | undefined = undefined;
      if (ei + 1 < m.events.length) nextEv = m.events[ei + 1];
      else if (mi + 1 < score.measures.length && score.measures[mi + 1].events.length > 0) {
        nextEv = score.measures[mi + 1].events[0];
      }

      timeline.push({
        m: mi,
        slot: ei,
        timeSec: totalTime,
        durationSec: durSec,
        ev,
        nextEv,
      });

      totalTime += durSec;
    }
  });

  if (timeline.length === 0) {
    onFinished();
    return { stop: () => {}, pause: () => {}, resume: () => {}, isPlaying: false, isPaused: false };
  }

  // Master audio bus setup with studio room reverb
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
  masterGain.connect(ctx.destination);

  const dryGain = ctx.createGain();
  dryGain.gain.setValueAtTime(0.84, ctx.currentTime);
  dryGain.connect(masterGain);

  const wetGain = ctx.createGain();
  wetGain.gain.setValueAtTime(0.16, ctx.currentTime);

  try {
    const reverbNode = createRoomReverb(ctx, 1.2, 2.7);
    wetGain.connect(reverbNode);
    reverbNode.connect(masterGain);
  } catch {
    // Fallback if convolution buffer is not supported in environment
    wetGain.connect(masterGain);
  }

  const guitarWave = createGuitarPeriodicWave(ctx);

  // Check if a note is tied from a previous event in timeline
  const isTiedFromPrev = (itemIdx: number, s: number, fret: number) => {
    // If starting playback from this position, sound the note from here
    if (itemIdx === 0) return false;
    const prevItem = timeline[itemIdx - 1];
    return !!(!prevItem.ev.rest && prevItem.ev.ties?.[s] && prevItem.ev.frets[s] === fret);
  };

  const startTime = ctx.currentTime + 0.08;

  // 2. Schedule metronome clicks & audio events
  metronomeClicks.forEach(mc => {
    playMetronomeClick(ctx, startTime + mc.timeSec, mc.accented, masterGain);
  });

  timeline.forEach((item, itemIdx) => {
    const eventAudioTime = startTime + item.timeSec;
    const { ev, durationSec, nextEv } = item;

    if (!ev.rest) {
      const notesToPlay: { s: number; fret: number }[] = [];
      ev.frets.forEach((fret, s) => {
        if (fret === null) return;
        if (isTiedFromPrev(itemIdx, s, fret)) return;
        notesToPlay.push({ s, fret });
      });

      notesToPlay.forEach(({ s, fret }, noteOrderIdx) => {
        const noteInfo = getNoteAtPosition(s, fret, tuningId);
        const freq = 440 * Math.pow(2, (noteInfo.absolute - 69) / 12);

        let voiceDuration = durationSec;
        let curIdx = itemIdx;
        while (timeline[curIdx]?.ev.ties?.[s]) {
          const nextItem = timeline[curIdx + 1];
          if (!nextItem || nextItem.ev.rest || nextItem.ev.frets[s] !== fret) break;
          voiceDuration += nextItem.durationSec;
          curIdx++;
        }

        const strumOffset = notesToPlay.length > 1 ? noteOrderIdx * 0.006 : 0;
        const noteStartTime = eventAudioTime + strumOffset;

        let slideTargetFreq: number | null = null;
        if (ev.slides?.[s] && nextEv && nextEv.frets[s] !== null) {
          const nextNote = getNoteAtPosition(s, nextEv.frets[s]!, tuningId);
          slideTargetFreq = 440 * Math.pow(2, (nextNote.absolute - 69) / 12);
        }

        playGuitarVoice(
          ctx,
          freq,
          noteStartTime,
          durationSec,
          voiceDuration,
          articulation,
          !!ev.hammerPull?.[s],
          !!ev.slides?.[s],
          slideTargetFreq,
          ev.bends?.[s] ?? null,
          !!ev.vibrato?.[s],
          ev.harmonics?.[s] ?? null,
          !!ev.ghost?.[s],
          !!ev.palmMute,
          !!ev.accent,
          !!ev.staccato,
          !!ev.letRing,
          dryGain,
          wetGain,
          guitarWave
        );
      });
    }
  });

  // 3. Frame-perfect visual cursor synchronization loop via Web Audio clock
  const finishTime = totalTime + (articulation === 'ring' ? 1.0 : 0.35);

  const checkCursor = () => {
    if (stopped) return;

    if (!paused && ctx.state === 'running') {
      const curAudioTime = ctx.currentTime - startTime;

      if (curAudioTime >= 0) {
        // Find currently playing event
        let activeItem: ScheduledEvent | null = null;
        for (let i = 0; i < timeline.length; i++) {
          const item = timeline[i];
          if (curAudioTime >= item.timeSec && curAudioTime < item.timeSec + item.durationSec) {
            activeItem = item;
            break;
          }
        }

        if (activeItem) {
          onCursor({ m: activeItem.m, slot: activeItem.slot });
        }
      }

      // Check if score playback has completed
      if (curAudioTime >= finishTime) {
        stopped = true;
        onCursor(null);
        onFinished();
        try { ctx.close(); } catch {}
        return;
      }
    }

    animFrameId = requestAnimationFrame(checkCursor);
  };

  animFrameId = requestAnimationFrame(checkCursor);

  const stop = () => {
    stopped = true;
    if (animFrameId !== null) cancelAnimationFrame(animFrameId);
    onCursor(null);
    try { ctx.close(); } catch {}
  };

  const pause = () => {
    paused = true;
    try { ctx.suspend(); } catch {}
  };

  const resume = () => {
    paused = false;
    try { ctx.resume(); } catch {}
  };

  return {
    stop,
    pause,
    resume,
    isPlaying: true,
    isPaused: false,
  };
};
