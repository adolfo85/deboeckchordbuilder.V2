import { TabScore, TabEvent } from '../types';
import { eventUnits } from './tabs';
import { getNoteAtPosition } from './theory';

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

export const startTabPlayback = (
  score: TabScore,
  startFrom: { m: number; slot: number } = { m: 0, slot: 0 },
  onCursor: (c: { m: number; slot: number } | null) => void,
  onFinished: () => void
): TabPlaybackController => {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) {
    onFinished();
    return { stop: () => {}, pause: () => {}, resume: () => {}, isPlaying: false, isPaused: false };
  }

  const ctx = new AudioCtx();
  let stopped = false;
  let paused = false;
  let activeTimers: number[] = [];

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

  // Prev check for tied notes
  const isTiedFromPrev = (itemIdx: number, s: number, fret: number) => {
    if (itemIdx === 0) {
      if (startFrom.m > 0 || startFrom.slot > 0) {
        // check prior event in score
        const pm = startFrom.slot > 0 ? score.measures[startFrom.m] : score.measures[startFrom.m - 1];
        const pe = startFrom.slot > 0 ? pm.events[startFrom.slot - 1] : pm?.events[pm?.events.length - 1];
        return !!(pe && !pe.rest && pe.ties?.[s] && pe.frets[s] === fret);
      }
      return false;
    }
    const prevItem = timeline[itemIdx - 1];
    return !!(!prevItem.ev.rest && prevItem.ev.ties?.[s] && prevItem.ev.frets[s] === fret);
  };

  const startTime = ctx.currentTime + 0.08;

  // 2. Schedule Web Audio synthesis & cursor callbacks
  timeline.forEach((item, itemIdx) => {
    const eventAudioTime = startTime + item.timeSec;
    const { ev, durationSec, nextEv } = item;

    // Visual cursor scheduling
    const delayMs = Math.max(0, (eventAudioTime - ctx.currentTime) * 1000);
    const timerId = window.setTimeout(() => {
      if (!stopped && !paused) {
        onCursor({ m: item.m, slot: item.slot });
      }
    }, delayMs);
    activeTimers.push(timerId);

    // Audio plucking
    if (!ev.rest) {
      ev.frets.forEach((fret, s) => {
        if (fret === null) return;
        if (isTiedFromPrev(itemIdx, s, fret)) return; // sustained tie

        const noteInfo = getNoteAtPosition(s, fret, 'standard');
        const freq = 440 * Math.pow(2, (noteInfo.absolute - 69) / 12);

        const osc = ctx.createOscillator();
        const oscHarmonic = ctx.createOscillator();
        const harmonicGain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        // Fundamental triangle wave
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, eventAudioTime);

        // 2nd harmonic for guitar string richness
        oscHarmonic.type = 'sawtooth';
        oscHarmonic.frequency.setValueAtTime(freq * 2, eventAudioTime);
        harmonicGain.gain.setValueAtTime(0.12, eventAudioTime);
        oscHarmonic.connect(harmonicGain);
        harmonicGain.connect(filter);

        // Slide pitch bend if slide is active
        if (ev.slides?.[s] && nextEv && nextEv.frets[s] !== null) {
          const nextNote = getNoteAtPosition(s, nextEv.frets[s]!, 'standard');
          const targetFreq = 440 * Math.pow(2, (nextNote.absolute - 69) / 12);
          const slideStart = eventAudioTime + durationSec * 0.45;
          const slideEnd = eventAudioTime + durationSec * 0.95;
          osc.frequency.setValueAtTime(freq, slideStart);
          osc.frequency.exponentialRampToValueAtTime(targetFreq, slideEnd);
        }

        // Lowpass filter simulating acoustic guitar body
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(Math.min(3000, freq * 5), eventAudioTime);
        filter.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.4), eventAudioTime + Math.min(durationSec, 1.2));

        // Volume envelope
        const isHammer = ev.hammerPull?.[s];
        const attack = isHammer ? 0.015 : 0.005;
        const peakVol = 0.22;
        const noteTail = Math.min(durationSec * 1.5, 3.0);

        gain.gain.setValueAtTime(0.0001, eventAudioTime);
        gain.gain.linearRampToValueAtTime(peakVol, eventAudioTime + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, eventAudioTime + noteTail);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(eventAudioTime);
        oscHarmonic.start(eventAudioTime);
        osc.stop(eventAudioTime + noteTail);
        oscHarmonic.stop(eventAudioTime + noteTail);
      });
    }
  });

  // Finish timer
  const finishDelayMs = Math.max(0, (startTime + totalTime - ctx.currentTime) * 1000 + 100);
  const endTimerId = window.setTimeout(() => {
    if (!stopped) {
      onCursor(null);
      onFinished();
      try { ctx.close(); } catch {}
    }
  }, finishDelayMs);
  activeTimers.push(endTimerId);

  const clearTimers = () => {
    activeTimers.forEach(id => window.clearTimeout(id));
    activeTimers = [];
  };

  const stop = () => {
    stopped = true;
    clearTimers();
    onCursor(null);
    try { ctx.close(); } catch {}
  };

  const pause = () => {
    paused = true;
    clearTimers();
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
