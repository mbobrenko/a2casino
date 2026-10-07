"use client";
// Synthesized game sounds (Web Audio API, no audio files). Muted by default; the choice is kept
// in localStorage (shared by every A2 Labs game).
import { useEffect, useState } from "react";

const KEY = "a2c_sound";
let ctx: AudioContext | null = null;
let enabled = false;
const listeners = new Set<(on: boolean) => void>();

function readPref(): boolean {
  try { return localStorage.getItem(KEY) === "on"; } catch { return false; }
}

export function setSound(on: boolean) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* storage blocked */ }
  if (on) audio();
  listeners.forEach((l) => l(on));
}

export function useSound(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);
  useEffect(() => {
    enabled = readPref();
    setOn(enabled);
    listeners.add(setOn);
    return () => { listeners.delete(setOn); };
  }, []);
  return [on, setSound];
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; delay?: number; slide?: number } = {}) {
  const a = enabled ? audio() : null;
  if (!a) return;
  const t = a.currentTime + (opts.delay ?? 0);
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = opts.type ?? "sine";
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(opts.vol ?? 0.12, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.25, lowpass = 1200) {
  const a = enabled ? audio() : null;
  if (!a) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const s = a.createBufferSource();
  s.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = vol;
  s.connect(f).connect(g).connect(a.destination);
  s.start();
}

export const sfx = {
  click: () => tone(880, 0.05, { type: "square", vol: 0.04 }),
  tick: (pitch = 1) => tone(1200 * pitch, 0.035, { type: "triangle", vol: 0.05 }),
  bet: () => tone(520, 0.08, { type: "triangle", vol: 0.08, slide: 1.6 }),
  win: (big = false) => {
    const notes = big ? [523, 659, 784, 1047, 1319] : [659, 880, 1175];
    notes.forEach((f, i) => tone(f, 0.18, { type: "triangle", vol: 0.1, delay: i * 0.07 }));
  },
  lose: () => tone(220, 0.22, { type: "sine", vol: 0.1, slide: 0.5 }),
  gem: (step = 0) => { tone(1046 * Math.pow(1.06, step), 0.16, { type: "sine", vol: 0.1 }); tone(1568 * Math.pow(1.06, step), 0.22, { type: "sine", vol: 0.05, delay: 0.03 }); },
  boom: () => { noise(0.6, 0.35, 900); tone(90, 0.4, { type: "sine", vol: 0.25, slide: 0.4 }); },
  peg: (row = 0) => tone(700 + row * 40, 0.03, { type: "sine", vol: 0.03 }),
  rumble: () => tone(70, 0.3, { type: "sawtooth", vol: 0.02 }),
};
