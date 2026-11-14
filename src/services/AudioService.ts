import type { EntryAudio } from "../types/Entry";

/** Längste erlaubte Aufnahme in Sekunden */
export const MAX_AUDIO_SECONDS = 120;

// Niedrige Bitrate: Sprache bleibt gut verständlich, die Datei klein
// (ca. 180 KB pro Minute).
const AUDIO_BITS_PER_SECOND = 24_000;

// MP4/AAC zuerst – das spielt auf iPhone und Mac gleichermaßen.
const PREFERRED_TYPES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
];

class AudioService {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;

  isSupported(): boolean {
    return (
      typeof MediaRecorder !== "undefined" &&
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function"
    );
  }

  isRecording(): boolean {
    return this.recorder !== null;
  }

  async start(): Promise<void> {
    if (this.recorder) {
      return;
    }

    if (!this.isSupported()) {
      throw new Error(
        "Dieser Browser unterstützt keine Sprachaufnahmen."
      );
    }

    let stream: MediaStream;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      console.error("Mikrofon-Zugriff fehlgeschlagen:", error);

      throw new Error(
        "Kein Zugriff auf das Mikrofon – bitte in den Einstellungen erlauben."
      );
    }

    const mimeType = PREFERRED_TYPES.find((type) =>
      MediaRecorder.isTypeSupported(type)
    );

    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      audioBitsPerSecond: AUDIO_BITS_PER_SECOND,
    });

    this.chunks = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    recorder.start();

    this.recorder = recorder;
    this.stream = stream;
    this.startedAt = Date.now();
  }

  /** Beendet die Aufnahme und liefert sie als Anhang zurück. */
  async stop(): Promise<EntryAudio> {
    const recorder = this.recorder;

    if (!recorder) {
      throw new Error("Es läuft keine Aufnahme.");
    }

    const seconds = Math.max(
      1,
      Math.round((Date.now() - this.startedAt) / 1000)
    );

    const blob = await new Promise<Blob>((resolve, reject) => {
      recorder.onstop = () =>
        resolve(
          new Blob(this.chunks, {
            type: recorder.mimeType || this.chunks[0]?.type || "audio/mp4",
          })
        );

      recorder.onerror = () =>
        reject(new Error("Die Aufnahme ist fehlgeschlagen."));

      recorder.stop();
    }).finally(() => this.release());

    if (blob.size === 0) {
      throw new Error("Die Aufnahme ist leer.");
    }

    const dataUrl = await this.toDataUrl(blob);

    if (!dataUrl.startsWith("data:audio/")) {
      throw new Error("Die Aufnahme hat ein unbekanntes Format.");
    }

    const stamp = new Date()
      .toLocaleString("de-AT")
      .replace(/[^\d]+/g, "-")
      .replace(/-$/, "");

    return {
      name: `Aufnahme-${stamp}`,
      mimeType: blob.type,
      dataUrl,
      seconds,
    };
  }

  /** Bricht eine laufende Aufnahme ab und verwirft sie. */
  cancel(): void {
    const recorder = this.recorder;

    if (!recorder) {
      return;
    }

    recorder.ondataavailable = null;
    recorder.onstop = null;

    try {
      recorder.stop();
    } catch {
      // war schon beendet
    }

    this.release();
  }

  private release(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }

  private toDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("Die Aufnahme konnte nicht gelesen werden."));

      reader.readAsDataURL(blob);
    });
  }
}

export default new AudioService();
