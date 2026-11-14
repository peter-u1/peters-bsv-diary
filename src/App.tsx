import { useEffect, useRef, useState } from "react";
import type React from "react";

import Sidebar from "./components/Sidebar";
import Stepper from "./components/Stepper";

import {
  DEFAULT_DIARY,
  MAX_AUDIOS,
  MAX_PHOTOS,
  photosOf,
} from "./types/Entry";
import type { Diary, Entry, EntryAudio, EntryPhoto } from "./types/Entry";

import DiaryService from "./services/DiaryService";
import PhotoService from "./services/PhotoService";
import AudioService, { MAX_AUDIO_SECONDS } from "./services/AudioService";

import WalletService from "./blockchain/WalletService";
import BlockchainService from "./blockchain/BlockchainService";

import "./App.css";

/* ---------- Anzeige-Einstellungen (pro Gerät gespeichert) ---------- */

const FONT_SIZE = { key: "diary_font_size", min: 13, max: 28, step: 1, initial: 17 };
const LIST_WIDTH = { key: "diary_list_width", min: 25, max: 70, step: 5, initial: 44 };
const EDITOR_LINES = { key: "diary_editor_lines", min: 3, max: 30, step: 1, initial: 10 };

type Setting = typeof FONT_SIZE;

const loadSetting = (setting: Setting) => {
  try {
    const stored = Number(localStorage.getItem(setting.key));

    if (stored >= setting.min && stored <= setting.max) {
      return stored;
    }
  } catch {
    // Speicher nicht verfügbar – Standard nehmen
  }

  return setting.initial;
};

const useSetting = (setting: Setting) => {
  const [value, setValue] = useState(() => loadSetting(setting));

  const change = (direction: 1 | -1) => {
    setValue((current) => {
      const next = Math.min(
        setting.max,
        Math.max(setting.min, current + direction * setting.step)
      );

      try {
        localStorage.setItem(setting.key, String(next));
      } catch {
        // ignorieren
      }

      return next;
    });
  };

  return [value, change] as const;
};

/* ---------- Passwort merken (nur auf Wunsch, pro Gerät) ---------- */

const PASSWORD_KEY = "diary_password";

const loadRememberedPassword = () => {
  try {
    return localStorage.getItem(PASSWORD_KEY) ?? "";
  } catch {
    return "";
  }
};

const storeRememberedPassword = (password: string | null) => {
  try {
    if (password) {
      localStorage.setItem(PASSWORD_KEY, password);
    } else {
      localStorage.removeItem(PASSWORD_KEY);
    }
  } catch {
    // Speicher nicht verfügbar – dann wird eben nichts gemerkt
  }
};

/* ---------- Diktieren (Spracherkennung des Browsers) ---------- */

const SpeechRecognitionClass: (new () => any) | undefined =
  typeof window !== "undefined"
    ? ((window as any).SpeechRecognition ??
      (window as any).webkitSpeechRecognition)
    : undefined;

/** 75 → "1:15" */
const formatSeconds = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const diaryOf = (entry: Entry) => entry.diaryId ?? DEFAULT_DIARY.id;

/** "8.11.2026, 14:10:00" → Zeitstempel (für die Sortierung neueste zuerst) */
const createdTime = (entry: Entry) => {
  const match = entry.createdAt.match(
    /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}),?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/
  );

  if (!match) {
    return 0;
  }

  const [, day, month, year, hour, minute, second] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second ?? 0)
  ).getTime();
};

function App() {
  const [diaryPassword, setDiaryPassword] = useState(loadRememberedPassword);
  const [rememberPassword, setRememberPassword] = useState(
    () => loadRememberedPassword() !== ""
  );
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const [fontSize, changeFontSize] = useSetting(FONT_SIZE);
  const [listWidth, changeListWidth] = useSetting(LIST_WIDTH);
  const [editorLines, changeEditorLines] = useSetting(EDITOR_LINES);

  const [diaries, setDiaries] = useState<Diary[]>(() =>
    DiaryService.loadDiaries()
  );
  const [activeDiaryId, setActiveDiaryId] = useState(() =>
    DiaryService.loadActiveDiaryId()
  );

  // Formulare in der Reiterleiste
  const [newDiaryName, setNewDiaryName] = useState<string | null>(null);
  const [manageName, setManageName] = useState<string | null>(null);
  const [confirmDiaryDelete, setConfirmDiaryDelete] = useState(false);
  const [confirmEntryDelete, setConfirmEntryDelete] = useState(false);

  // null = neuer Eintrag
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorPhotos, setEditorPhotos] = useState<EntryPhoto[]>([]);

  const [editorAudios, setEditorAudios] = useState<EntryAudio[]>([]);

  // null = es läuft keine Aufnahme, sonst die bisherige Dauer in Sekunden
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(
    null
  );

  // Diktat: gesprochener Text landet direkt im Eingabefeld
  const [dictating, setDictating] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Foto, das gerade groß angezeigt wird
  const [zoomedPhoto, setZoomedPhoto] = useState<EntryPhoto | null>(null);

  // Erst wenn die lokalen Einträge geladen sind, darf gespeichert werden
  const [ready, setReady] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    let cancelled = false;

    DiaryService.onSaveError = () => {
      setStatus(
        "⚠️ Lokales Speichern fehlgeschlagen. Möglicherweise ist der Browserspeicher voll."
      );
    };

    void DiaryService.load().then((loaded) => {
      if (!cancelled) {
        setEntries(loaded);
        setReady(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Aufnahme-Uhr; nach der Höchstdauer wird automatisch gestoppt
  const isRecording = recordingSeconds !== null;

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const timer = window.setInterval(() => {
      setRecordingSeconds((current) =>
        current === null ? null : current + 1
      );
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (recordingSeconds !== null && recordingSeconds >= MAX_AUDIO_SECONDS) {
      void stopRecording();
    }
  });

  // Großes Foto mit Esc schließen
  useEffect(() => {
    if (!zoomedPhoto) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoomedPhoto(null);
      }
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [zoomedPhoto]);

  const activeDiary =
    diaries.find((diary) => diary.id === activeDiaryId) ?? DEFAULT_DIARY;

  // Neueste zuerst – nach Schreibdatum, nicht nach Upload-Reihenfolge
  const visibleEntries = entries
    .filter((entry) => diaryOf(entry) === activeDiary.id && !entry.deleted)
    .sort((a, b) => createdTime(b) - createdTime(a));

  const selectedEntry =
    visibleEntries.find((entry) => entry.id === selectedId) ?? null;

  // Enthält auch Löschungen und Umbenennungen, die noch hoch müssen
  const unsyncedEntries = entries.filter((entry) => entry.synced !== true);

  const resetPhotoInput = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const openEntry = (entry: Entry | null) => {
    setSelectedId(entry?.id ?? null);
    setEditorText(entry?.text ?? "");
    setEditorPhotos(entry ? photosOf(entry) : []);
    setEditorAudios(entry?.audios ?? []);

    // Eine laufende Aufnahme gehört zum vorherigen Eintrag: verwerfen
    AudioService.cancel();
    setRecordingSeconds(null);
    stopDictation();
    setZoomedPhoto(null);
    setConfirmEntryDelete(false);
    resetPhotoInput();

    // Am Handy steht die Liste unter dem Editor: nach oben scrollen.
    if (entry && window.innerWidth <= 760) {
      editorRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  /* ---------- Tagebücher ---------- */

  const closeDiaryForms = () => {
    setNewDiaryName(null);
    setManageName(null);
    setConfirmDiaryDelete(false);
  };

  const switchDiary = (id: string) => {
    setActiveDiaryId(id);
    DiaryService.saveActiveDiaryId(id);
    closeDiaryForms();
    openEntry(null);
  };

  const createDiary = () => {
    const name = (newDiaryName ?? "").trim();

    if (!name) {
      setNewDiaryName(null);
      return;
    }

    const updated = DiaryService.addDiary(name, diaries);

    setDiaries(updated);
    switchDiary(updated[updated.length - 1].id);
    setStatus(`Tagebuch „${name}“ angelegt ✅`);
  };

  const renameDiary = () => {
    const name = (manageName ?? "").trim();

    if (!name || name === activeDiary.name) {
      closeDiaryForms();
      return;
    }

    const result = DiaryService.renameDiary(
      activeDiary.id,
      name,
      diaries,
      entries
    );

    setDiaries(result.diaries);
    setEntries(result.entries);
    closeDiaryForms();

    const count = result.entries.filter(
      (entry) => diaryOf(entry) === activeDiary.id && !entry.deleted
    ).length;

    setStatus(
      count > 0
        ? `Umbenannt in „${name}“ ✅ – mit „Auf BSV speichern“ kommt der neue Name auch auf die Chain.`
        : `Umbenannt in „${name}“ ✅`
    );
  };

  const deleteDiary = () => {
    const name = activeDiary.name;

    const result = DiaryService.deleteDiary(
      activeDiary.id,
      diaries,
      entries
    );

    setDiaries(result.diaries);
    setEntries(result.entries);
    switchDiary(DEFAULT_DIARY.id);

    const pending = result.entries.some(
      (entry) => entry.deleted && entry.synced !== true
    );

    setStatus(
      pending
        ? `Tagebuch „${name}“ gelöscht – mit „Auf BSV speichern“ verschwinden die Einträge auch beim Laden von der Chain.`
        : `Tagebuch „${name}“ gelöscht ✅`
    );
  };

  /* ---------- Einträge ---------- */

  const preparePhotos = async (fileList: FileList | null) => {
    const files = Array.from(fileList ?? []);

    if (files.length === 0) {
      return;
    }

    const free = MAX_PHOTOS - editorPhotos.length;

    if (free <= 0) {
      setStatus(`Maximal ${MAX_PHOTOS} Fotos pro Eintrag.`);
      resetPhotoInput();
      return;
    }

    const selected = files.slice(0, free);
    const added: EntryPhoto[] = [];
    let failure = "";

    for (let index = 0; index < selected.length; index++) {
      try {
        setStatus(
          selected.length > 1
            ? `Foto ${index + 1} von ${selected.length} wird verkleinert...`
            : "Foto wird verkleinert und vorbereitet..."
        );

        added.push(await PhotoService.prepare(selected[index]));
      } catch (error) {
        console.error("Foto-Fehler:", error);
        failure = `Foto-Fehler bei „${selected[index].name}“: ${errorText(error)}`;
      }
    }

    setEditorPhotos((current) =>
      [...current, ...added].slice(0, MAX_PHOTOS)
    );
    resetPhotoInput();

    if (failure) {
      setStatus(failure);
    } else if (files.length > free) {
      setStatus(
        `${added.length} Foto(s) bereit ✅ – mehr als ${MAX_PHOTOS} pro Eintrag gehen nicht, der Rest wurde weggelassen.`
      );
    } else {
      setStatus(
        added.length > 1 ? `${added.length} Fotos sind bereit ✅` : "Foto ist bereit ✅"
      );
    }
  };

  const stopDictation = () => {
    const recognition = recognitionRef.current;

    recognitionRef.current = null;
    setDictating(false);

    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;

      try {
        recognition.stop();
      } catch {
        // war schon beendet
      }
    }
  };

  const startDictation = () => {
    if (!SpeechRecognitionClass || dictating) {
      return;
    }

    const recognition = new SpeechRecognitionClass();

    recognition.lang = "de-AT";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interim = "";

      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];

        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalText.trim()) {
        setEditorText((current) =>
          current && !/\s$/.test(current)
            ? `${current} ${finalText.trim()}`
            : current + finalText.trim()
        );
      }

      setStatus(
        interim.trim()
          ? `🎤 ${interim.trim()}`
          : "Diktat läuft 🎤 – einfach sprechen"
      );
    };

    recognition.onerror = (event: any) => {
      // Sprechpausen sind kein Fehler
      if (event.error === "no-speech" || event.error === "aborted") {
        return;
      }

      console.error("Diktat-Fehler:", event.error);

      setStatus(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Diktat-Fehler: kein Zugriff auf Mikrofon oder Spracherkennung – bitte in den Einstellungen erlauben."
          : `Diktat-Fehler: ${event.error}`
      );
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
        setDictating(false);
        setStatus((current) =>
          current.startsWith("🎤") || current.startsWith("Diktat läuft")
            ? "Diktat beendet – Text bitte prüfen."
            : current
        );
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setDictating(true);
      setStatus("Diktat läuft 🎤 – einfach sprechen");
    } catch (error) {
      console.error("Diktat-Fehler:", error);
      setStatus(`Diktat-Fehler: ${errorText(error)}`);
    }
  };

  const startRecording = async () => {
    if (editorAudios.length >= MAX_AUDIOS) {
      setStatus(`Maximal ${MAX_AUDIOS} Sprachaufnahmen pro Eintrag.`);
      return;
    }

    try {
      await AudioService.start();
      setRecordingSeconds(0);
      setStatus("Aufnahme läuft 🎙");
    } catch (error) {
      console.error("Aufnahme-Fehler:", error);
      setStatus(`Aufnahme-Fehler: ${errorText(error)}`);
    }
  };

  const stopRecording = async () => {
    if (!AudioService.isRecording()) {
      return;
    }

    setRecordingSeconds(null);

    try {
      const audio = await AudioService.stop();

      setEditorAudios((current) => [...current, audio].slice(0, MAX_AUDIOS));
      setStatus(
        `Aufnahme (${formatSeconds(audio.seconds)}) ist bereit ✅ – mit „Eintrag speichern“ übernehmen.`
      );
    } catch (error) {
      console.error("Aufnahme-Fehler:", error);
      setStatus(`Aufnahme-Fehler: ${errorText(error)}`);
    }
  };

  const saveLocally = () => {
    if (recordingSeconds !== null) {
      setStatus("Bitte zuerst die laufende Aufnahme stoppen.");
      return;
    }

    if (
      !editorText.trim() &&
      editorPhotos.length === 0 &&
      editorAudios.length === 0
    ) {
      setStatus("Bitte zuerst einen Text eingeben oder etwas anhängen.");
      return;
    }

    try {
      if (selectedEntry) {
        setEntries(
          DiaryService.update(
            selectedEntry.id,
            editorText.trim(),
            entries,
            editorPhotos,
            editorAudios
          )
        );
        setStatus("Änderungen lokal gespeichert ✅ – noch nicht auf BSV.");
      } else {
        setEntries(
          DiaryService.create(
            editorText.trim(),
            entries,
            editorPhotos,
            activeDiary.id,
            editorAudios
          )
        );
        openEntry(null);
        setStatus("Eintrag lokal gespeichert ✅ – noch nicht auf BSV.");
      }
    } catch (error) {
      console.error("Lokales Speichern fehlgeschlagen:", error);
      setStatus(
        "Lokales Speichern fehlgeschlagen. Möglicherweise ist der Browserspeicher voll."
      );
    }
  };

  const deleteEntry = () => {
    if (!selectedEntry) {
      return;
    }

    const wasOnChain = selectedEntry.onChain !== false;

    setEntries(DiaryService.deleteEntries([selectedEntry.id], entries));
    openEntry(null);

    setStatus(
      wasOnChain
        ? "Eintrag gelöscht – mit „Auf BSV speichern“ verschwindet er auch beim Laden von der Chain."
        : "Eintrag gelöscht ✅"
    );
  };

  /* ---------- BSV ---------- */

  const uploadUnsynced = async () => {
    if (!diaryPassword.trim()) {
      setStatus("Bitte zuerst das Tagebuch-Passwort eingeben.");
      return;
    }

    if (unsyncedEntries.length === 0) {
      setStatus("Alles ist schon auf BSV gespeichert ✅");
      return;
    }

    setBusy(true);

    try {
      if (!WalletService.isConnected()) {
        setStatus("Verbinde Wallet...");
        await WalletService.connect();
      }

      setStatus(
        `Verschlüssele ${unsyncedEntries.length} Änderung(en) und speichere auf BSV...`
      );

      let current = entries;

      const saved = await BlockchainService.saveMany(
        unsyncedEntries,
        diaries,
        diaryPassword,
        (savedIds, batch, batches) => {
          current = DiaryService.markSynced(savedIds, current);
          setEntries(current);

          if (batches > 1) {
            setStatus(`Transaktion ${batch} von ${batches} gespeichert...`);
          }
        }
      );

      setStatus(`${saved} Änderung(en) verschlüsselt auf BSV gespeichert ✅`);
    } catch (error) {
      console.error("BSV-Speichern fehlgeschlagen:", error);
      setStatus(`BSV-Speichern fehlgeschlagen: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const loadFromBsv = async () => {
    if (!diaryPassword.trim()) {
      setStatus("Bitte zuerst das Tagebuch-Passwort eingeben.");
      return;
    }

    setBusy(true);

    try {
      setStatus("Lade Einträge von der BSV-Chain...");

      // Falls eine Wallet da ist, werden auch alte Einträge ohne Index gefunden.
      await WalletService.tryConnect();

      const result = await BlockchainService.loadEntries(diaryPassword);

      if (result.found > 0 && result.entries.length === 0 && result.undecryptable > 0) {
        setStatus(
          `${result.found} Einträge gefunden, aber keiner ließ sich entschlüsseln – stimmt das Passwort?`
        );
        return;
      }

      const merged = DiaryService.mergeWithChain(result.entries, entries);

      setEntries(merged);
      setDiaries(DiaryService.mergeDiaries(result.diaries, diaries, merged));
      openEntry(null);

      const skipped =
        result.undecryptable > 0
          ? ` (${result.undecryptable} mit anderem Passwort übersprungen)`
          : "";

      const notLoaded =
        result.skippedTxs > 0
          ? ` ⚠️ ${result.skippedTxs} Transaktion(en) nicht abrufbar`
          : "";

      const walletOnly =
        result.walletOnlyTxs > 0
          ? ` – ${result.walletOnlyTxs} Transaktion(en) nur über die Wallet gefunden`
          : "";

      const incomplete =
        result.incompleteEntries > 0
          ? ` ⚠️ ${result.incompleteEntries} Eintrag/Einträge unvollständig`
          : "";

      const walletNote = result.walletFailed
        ? " ⚠️ Wallet-Verlauf nicht erreichbar – ältere Einträge ohne Index fehlen evtl."
        : "";

      setStatus(
        `${result.entries.length} Eintrag/Einträge von BSV geladen ✅${skipped}${walletOnly}${notLoaded}${incomplete}${walletNote}`
      );
    } catch (error) {
      console.error("BSV-Laden fehlgeschlagen:", error);
      setStatus(`BSV-Laden fehlgeschlagen: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  /* ---------- Oberfläche ---------- */

  if (!ready) {
    return (
      <div className="app">
        <p className="status">Lade Tagebuch...</p>
      </div>
    );
  }

  return (
    <div
      className="app"
      style={
        {
          "--entry-size": `${fontSize}px`,
          "--list-width": `${listWidth}%`,
        } as React.CSSProperties
      }
    >
      <header className="topbar">
        <h1>Diary of Peter</h1>

        <div className="topbar-actions">
          <input
            type="password"
            value={diaryPassword}
            onChange={(event) => {
              setDiaryPassword(event.target.value);

              if (rememberPassword) {
                storeRememberedPassword(event.target.value);
              }
            }}
            placeholder="Tagebuch-Passwort"
            autoComplete="current-password"
          />

          <label
            className="remember-password"
            title="Speichert das Passwort unverschlüsselt in diesem Browser"
          >
            <input
              type="checkbox"
              checked={rememberPassword}
              onChange={(event) => {
                setRememberPassword(event.target.checked);
                storeRememberedPassword(
                  event.target.checked ? diaryPassword : null
                );
              }}
            />
            merken
          </label>

          <button type="button" onClick={loadFromBsv} disabled={busy}>
            Von BSV laden
          </button>

          <button
            type="button"
            className="primary"
            onClick={uploadUnsynced}
            disabled={busy || unsyncedEntries.length === 0}
          >
            {unsyncedEntries.length > 0
              ? `Auf BSV speichern (${unsyncedEntries.length})`
              : "Alles auf BSV ✓"}
          </button>

          <div className="view-settings">
            <Stepper
              label="Schrift"
              value={fontSize}
              onChange={changeFontSize}
              canDecrease={fontSize > FONT_SIZE.min}
              canIncrease={fontSize < FONT_SIZE.max}
            />
            <Stepper
              label="Feld"
              value={editorLines}
              onChange={changeEditorLines}
              canDecrease={editorLines > EDITOR_LINES.min}
              canIncrease={editorLines < EDITOR_LINES.max}
            />
            <Stepper
              label="Liste"
              className="hide-mobile"
              value={`${listWidth}%`}
              onChange={changeListWidth}
              canDecrease={listWidth > LIST_WIDTH.min}
              canIncrease={listWidth < LIST_WIDTH.max}
            />
          </div>
        </div>

        {status && <p className="status">{status}</p>}
      </header>

      <nav className="tabs">
        {diaries.map((diary) => {
          const unsynced = entries.filter(
            (entry) => diaryOf(entry) === diary.id && entry.synced !== true
          ).length;

          const active = diary.id === activeDiary.id;

          return (
            <button
              key={diary.id}
              type="button"
              className={active ? "tab active" : "tab"}
              onClick={() =>
                active
                  ? manageName === null
                    ? setManageName(diary.name)
                    : closeDiaryForms()
                  : switchDiary(diary.id)
              }
              title={active ? "Umbenennen oder löschen" : undefined}
            >
              {diary.name}
              {unsynced > 0 && <span className="tab-dot">●</span>}
              {active && <span className="tab-edit">✎</span>}
            </button>
          );
        })}

        <button
          type="button"
          className="tab add"
          onClick={() => {
            closeDiaryForms();
            setNewDiaryName("");
          }}
          title="Neues Tagebuch"
        >
          +
        </button>
      </nav>

      {newDiaryName !== null && (
        <form
          className="tab-form"
          onSubmit={(event) => {
            event.preventDefault();
            createDiary();
          }}
        >
          <span>Neues Tagebuch:</span>
          <input
            autoFocus
            value={newDiaryName}
            onChange={(event) => setNewDiaryName(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && closeDiaryForms()}
            placeholder="z. B. Arbeit, Hobby…"
            maxLength={40}
          />
          <button type="submit" className="primary">
            Anlegen
          </button>
          <button type="button" onClick={closeDiaryForms}>
            Abbrechen
          </button>
        </form>
      )}

      {manageName !== null && (
        <form
          className="tab-form"
          onSubmit={(event) => {
            event.preventDefault();
            renameDiary();
          }}
        >
          <span>Name:</span>
          <input
            autoFocus
            value={manageName}
            onChange={(event) => setManageName(event.target.value)}
            onKeyDown={(event) => event.key === "Escape" && closeDiaryForms()}
            maxLength={40}
          />
          <button type="submit" className="primary">
            Umbenennen
          </button>

          {activeDiary.id !== DEFAULT_DIARY.id &&
            (confirmDiaryDelete ? (
              <span className="confirm">
                „{activeDiary.name}“
                {visibleEntries.length > 0 &&
                  ` mit ${visibleEntries.length} ${
                    visibleEntries.length === 1 ? "Eintrag" : "Einträgen"
                  }`}{" "}
                löschen?
                <button type="button" className="danger" onClick={deleteDiary}>
                  Ja, löschen
                </button>
                <button type="button" onClick={() => setConfirmDiaryDelete(false)}>
                  Nein
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="danger-outline"
                onClick={() => setConfirmDiaryDelete(true)}
              >
                Tagebuch löschen
              </button>
            ))}

          <button type="button" onClick={closeDiaryForms}>
            Schließen
          </button>
        </form>
      )}

      <div className="layout">
        <Sidebar
          entries={visibleEntries}
          selectedId={selectedId}
          onSelect={openEntry}
          onNew={() => openEntry(null)}
        />

        <main className="editor" ref={editorRef}>
          <h2>
            {selectedEntry
              ? "Eintrag bearbeiten"
              : `Neuer Eintrag in „${activeDiary.name}“`}
          </h2>

          {selectedEntry && (
            <p className="meta">
              Erstellt: {selectedEntry.createdAt}
              {selectedEntry.updatedAt &&
                ` · Bearbeitet: ${selectedEntry.updatedAt}`}
              {" · "}
              {selectedEntry.synced ? "auf BSV ✓" : "noch nicht auf BSV"}
            </p>
          )}

          <textarea
            className="diary-text"
            value={editorText}
            onChange={(event) => setEditorText(event.target.value)}
            placeholder="Was ist heute passiert?"
            rows={editorLines}
          />

          <label className="photo-input">
            Fotos hinzufügen ({editorPhotos.length} von {MAX_PHOTOS}):
            <input
              ref={photoInputRef}
              type="file"
              multiple
              disabled={editorPhotos.length >= MAX_PHOTOS}
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              onChange={(event) => {
                void preparePhotos(event.target.files);
              }}
            />
          </label>

          {editorPhotos.length > 0 && (
            <div
              className={
                editorPhotos.length === 1 ? "photo-grid single" : "photo-grid"
              }
            >
              {editorPhotos.map((photo, index) => (
                <figure className="photo-preview" key={index}>
                  <button
                    type="button"
                    className="photo-zoom"
                    title="Groß anzeigen"
                    onClick={() => setZoomedPhoto(photo)}
                  >
                    <img src={photo.dataUrl} alt={photo.name} />
                  </button>
                  <figcaption>
                    <span className="photo-name">{photo.name}</span>
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        setEditorPhotos((current) =>
                          current.filter((_, position) => position !== index)
                        )
                      }
                    >
                      entfernen
                    </button>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}

          <div className="dictation">
            {SpeechRecognitionClass ? (
              <button
                type="button"
                className={dictating ? "danger" : undefined}
                onClick={dictating ? stopDictation : startDictation}
                disabled={isRecording}
              >
                {dictating ? "■ Diktat stoppen" : "🎤 Diktieren"}
              </button>
            ) : (
              <span className="hint">
                Diktieren: ins Textfeld tippen und die Mikrofon-Taste der
                Tastatur verwenden.
              </span>
            )}
          </div>

          <div className="audio-section">
            {isRecording ? (
              <button
                type="button"
                className="danger"
                onClick={() => void stopRecording()}
              >
                ■ Aufnahme stoppen ({formatSeconds(recordingSeconds ?? 0)} /{" "}
                {formatSeconds(MAX_AUDIO_SECONDS)})
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void startRecording()}
                disabled={editorAudios.length >= MAX_AUDIOS || dictating}
              >
                🎙 Sprachaufnahme ({editorAudios.length} von {MAX_AUDIOS})
              </button>
            )}

            {editorAudios.map((audio, index) => (
              <div className="audio-item" key={index}>
                <audio controls preload="metadata" src={audio.dataUrl} />
                <span className="audio-length">
                  {formatSeconds(audio.seconds)}
                </span>
                <button
                  type="button"
                  className="link"
                  onClick={() =>
                    setEditorAudios((current) =>
                      current.filter((_, position) => position !== index)
                    )
                  }
                >
                  entfernen
                </button>
              </div>
            ))}
          </div>

          <div className="editor-actions">
            <button type="button" className="primary" onClick={saveLocally}>
              {selectedEntry ? "Änderungen speichern" : "Eintrag speichern"}
            </button>

            {selectedEntry &&
              (confirmEntryDelete ? (
                <span className="confirm">
                  Eintrag wirklich löschen?
                  <button type="button" className="danger" onClick={deleteEntry}>
                    Ja, löschen
                  </button>
                  <button type="button" onClick={() => setConfirmEntryDelete(false)}>
                    Nein
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="danger-outline"
                  onClick={() => setConfirmEntryDelete(true)}
                >
                  Löschen
                </button>
              ))}

            <span className="hint">
              Wird zuerst nur hier gespeichert. Mit „Auf BSV speichern“ oben
              kommen alle Änderungen gesammelt auf die Chain.
            </span>
          </div>
        </main>
      </div>

      {zoomedPhoto && (
        <div
          className="lightbox"
          role="dialog"
          aria-label="Foto groß"
          onClick={() => setZoomedPhoto(null)}
        >
          <img src={zoomedPhoto.dataUrl} alt={zoomedPhoto.name} />
          <button
            type="button"
            className="lightbox-close"
            aria-label="Schließen"
            onClick={() => setZoomedPhoto(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
