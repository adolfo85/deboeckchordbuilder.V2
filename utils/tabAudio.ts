import { TabScore, TabEvent } from '../types';
import { eventUnits } from './tabs';
import { getNoteAtPosition } from './theory';

export type PlaybackArticulation = 'legato' | 'ring' | 'staccato';

export interface TabPlaybackOptions {
  articulation?: PlaybackArticulation;
  volume?: number;
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

/**
 * Synthesizes a single guitar voice with warm acoustic timbre, rich body resonance,
 * and precise articulation duration (Legato = full note duration).
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
  dryGainNode: GainNode,
  wetGainNode: GainNode,
  guitarWave: PeriodicWave
) {
  // Determine sounding duration based on articulation:
  // - legato: 100% full nominal duration, holding tone continuously into next note or rest.
  // - ring: lets string ring out naturally (up to 3.2s) unless superseded.
  // - staccato: crisp 45% duration.
  let activeDuration = voiceDurationSec;
  if (articulation === 'staccato') {
    activeDuration = Math.max(0.08, voiceDurationSec * 0.45);
  } else if (articulation === 'ring') {
    activeDuration = Math.max(voiceDurationSec, Math.min(3.2, voiceDurationSec * 2.2));
  }

  const attackTime = isHammer ? 0.016 : 0.005;
  const peakVol = 0.22;
  const sustainVol = peakVol * 0.78; // 0.17: strong, warm sustain

  // Smooth release window at the end to prevent digital clicks while sounding legato
  const releaseTime = Math.min(0.026, activeDuration * 0.18);
  const sustainEndTime = Math.max(startTime + attackTime + 0.03, startTime + activeDuration - releaseTime);
  const stopTime = startTime + activeDuration;

  // 1. Primary harmonic oscillator
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(guitarWave);
  osc.frequency.setValueAtTime(freq, startTime);

  // 2. Secondary detuned oscillator for natural string chorus and acoustic depth (+2.5 cents)
  const oscChorus = ctx.createOscillator();
  oscChorus.type = 'triangle';
  oscChorus.frequency.setValueAtTime(freq, startTime);
  oscChorus.detune.setValueAtTime(2.5, startTime);
  const chorusGain = ctx.createGain();
  chorusGain.gain.setValueAtTime(0.18, startTime);
  oscChorus.connect(chorusGain);

  // 3. Slide pitch bend if active
  if (hasSlide && slideTargetFreq !== null) {
    const slideStart = startTime + nominalDurationSec * 0.45;
    const slideEnd = startTime + nominalDurationSec * 0.95;
    osc.frequency.setValueAtTime(freq, slideStart);
    osc.frequency.exponentialRampToValueAtTime(slideTargetFreq, slideEnd);
    oscChorus.frequency.setValueAtTime(freq, slideStart);
    oscChorus.frequency.exponentialRampToValueAtTime(slideTargetFreq, slideEnd);
  }

  // 4. Acoustic guitar body resonance filter (peaking around 210 Hz)
  const bodyFilter = ctx.createBiquadFilter();
  bodyFilter.type = 'peaking';
  bodyFilter.frequency.setValueAtTime(210, startTime);
  bodyFilter.Q.setValueAtTime(1.3, startTime);
  bodyFilter.gain.setValueAtTime(3.0, startTime); // +3dB wooden body warmth

  // 5. Dynamic lowpass filter (starts open for attack sparkle, settles into warm sustain)
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  const initialCutoff = Math.min(7000, Math.max(1800, freq * 7));
  const sustainCutoff = Math.min(3600, Math.max(1000, freq * 3));
  filter.frequency.setValueAtTime(initialCutoff, startTime);
  filter.frequency.exponentialRampToValueAtTime(
    sustainCutoff,
    startTime + Math.min(activeDuration, 0.7)
  );

  // 6. Pluck transient (finger/pick impact noise)
  if (!isHammer && ctx.sampleRate) {
    const bufferSize = Math.floor(ctx.sampleRate * 0.01); // 10ms
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
    noiseFilter.frequency.setValueAtTime(2400, startTime);
    noiseFilter.Q.setValueAtTime(1.6, startTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.04, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.01);

    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(filter);

    noiseSource.start(startTime);
    noiseSource.stop(startTime + 0.012);
  }

  // 7. Voice Volume Envelope (ADSR)
  const voiceGain = ctx.createGain();
  voiceGain.gain.setValueAtTime(0.0001, startTime);
  voiceGain.gain.linearRampToValueAtTime(peakVol, startTime + attackTime);
  voiceGain.gain.exponentialRampToValueAtTime(sustainVol, startTime + attackTime + 0.05);

  // Slow natural acoustic decay across sustain (note remains singing and audible for full duration)
  const endSustainVol = sustainVol * Math.max(0.55, Math.exp(-0.25 * (activeDuration / 1.0)));
  voiceGain.gain.setValueAtTime(sustainVol, startTime + attackTime + 0.05);
  voiceGain.gain.linearRampToValueAtTime(endSustainVol, sustainEndTime);

  // Anti-click smooth release to finish exactly on the beat
  voiceGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

  // Connect routing
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

  // 1. Build flat list of all playable events from startFrom
  const timeline: ScheduledEvent[] = [];
  let totalTime = 0;

  for (let mi = startFrom.m; mi < score.measures.length; mi++) {
    const m = score.measures[mi];
    const tempo = m.tempo || 120;
    const startSlot = mi === startFrom.m ? startFrom.slot : 0;

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
  }

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

  // 2. Schedule all audio events
  timeline.forEach((item, itemIdx) => {
    const eventAudioTime = startTime + item.timeSec;
    const { ev, durationSec, nextEv } = item;

    if (!ev.rest) {
      // Collect playable notes on this event
      const notesToPlay: { s: number; fret: number }[] = [];
      ev.frets.forEach((fret, s) => {
        if (fret === null) return;
        if (isTiedFromPrev(itemIdx, s, fret)) return; // Sustained voice from earlier tie
        notesToPlay.push({ s, fret });
      });

      notesToPlay.forEach(({ s, fret }, noteOrderIdx) => {
        const noteInfo = getNoteAtPosition(s, fret, 'standard');
        const freq = 440 * Math.pow(2, (noteInfo.absolute - 69) / 12);

        // Calculate total tied duration: accumulate consecutive tied events with matching fret on string s
        let voiceDuration = durationSec;
        let curIdx = itemIdx;
        while (timeline[curIdx]?.ev.ties?.[s]) {
          const nextItem = timeline[curIdx + 1];
          if (!nextItem || nextItem.ev.rest || nextItem.ev.frets[s] !== fret) break;
          voiceDuration += nextItem.durationSec;
          curIdx++;
        }

        // Slight strumming offset if multiple strings in a chord (6ms per string for human touch)
        const strumOffset = notesToPlay.length > 1 ? noteOrderIdx * 0.006 : 0;
        const noteStartTime = eventAudioTime + strumOffset;

        // Slide target frequency if slide active
        let slideTargetFreq: number | null = null;
        if (ev.slides?.[s] && nextEv && nextEv.frets[s] !== null) {
          const nextNote = getNoteAtPosition(s, nextEv.frets[s]!, 'standard');
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
