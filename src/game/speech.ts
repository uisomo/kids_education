interface MinimalSpeechRecognitionResultItem {
  transcript: string;
}

interface MinimalSpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: MinimalSpeechRecognitionResultItem;
}

interface MinimalSpeechRecognitionResultList {
  readonly length: number;
  [index: number]: MinimalSpeechRecognitionResult;
}

interface MinimalSpeechRecognitionEvent {
  results: MinimalSpeechRecognitionResultList;
}

interface MinimalSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: MinimalSpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export interface SpeechEvents {
  onInterim(text: string): void;
  onFinal(text: string, voicedMs: number): void;
  onSilence(): void;
}

const SILENCE_MS = 10_000;

export class Recognizer {
  private rec: MinimalSpeechRecognition;
  private voiceStart = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  listening = false;

  constructor(private events: SpeechEvents, lang: "ja-JP" | "en-US" = "ja-JP") {
    const Ctor = (window as never as { webkitSpeechRecognition: new () => MinimalSpeechRecognition })
      .webkitSpeechRecognition;
    this.rec = new Ctor();
    this.rec.lang = lang;
    this.rec.interimResults = true;
    this.rec.continuous = false;
    this.rec.onresult = (e: MinimalSpeechRecognitionEvent) => {
      this.resetSilence();
      const res = e.results[e.results.length - 1];
      const text = res[0].transcript;
      if (res.isFinal) {
        const voicedMs = this.voiceStart ? Date.now() - this.voiceStart : text.length * 120;
        this.voiceStart = 0;
        this.events.onFinal(text, voicedMs);
      } else {
        if (!this.voiceStart) this.voiceStart = Date.now();
        this.events.onInterim(text);
      }
    };
    this.rec.onend = () => { if (this.listening) this.rec.start(); }; // keep alive
  }

  setLang(l: "ja-JP" | "en-US") { this.rec.lang = l; }

  start() { this.listening = true; this.voiceStart = 0; this.rec.start(); this.resetSilence(); }
  stop() { this.listening = false; this.clearSilence(); this.rec.stop(); }

  private resetSilence() {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => this.events.onSilence(), SILENCE_MS);
  }
  private clearSilence() { if (this.silenceTimer) clearTimeout(this.silenceTimer); }
}

export class DebugRecognizer {
  listening = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private events: SpeechEvents, _lang: "ja-JP" | "en-US" = "ja-JP") {
    (window as never as { tqSay(t: string): void }).tqSay = (t: string) => {
      if (!this.listening) return;
      this.resetSilence();
      this.events.onInterim(t);
      this.events.onFinal(t, t.length * 120);
    };
  }

  setLang(_l: "ja-JP" | "en-US") { /* debug: no-op */ }
  start() { this.listening = true; this.resetSilence(); }
  stop() {
    this.listening = false;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
  }
  private resetSilence() {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => this.events.onSilence(), SILENCE_MS);
  }
}

export function makeRecognizer(events: SpeechEvents): Recognizer | DebugRecognizer {
  const hasApi = "webkitSpeechRecognition" in window;
  const forced = new URLSearchParams(location.search).get("debug") === "1";
  return forced || !hasApi ? new DebugRecognizer(events) : new Recognizer(events);
}
