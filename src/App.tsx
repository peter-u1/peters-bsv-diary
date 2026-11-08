import { useEffect, useRef, useState } from "react";
import type React from "react";

import Sidebar from "./components/Sidebar";

import { DEFAULT_DIARY } from "./types/Entry";
import type { Diary, Entry, EntryPhoto } from "./types/Entry";

import DiaryService from "./services/DiaryService";
import PhotoService from "./services/PhotoService";

import WalletService from "./blockchain/WalletService";
import BlockchainService from "./blockchain/BlockchainService";

import "./App.css";

const FONT_SIZE_KEY = "diary_font_size";
const FONT_SIZE_DEFAULT = 17;
const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 28;

const loadFontSize = () => {
  try {
    const stored = Number(localStorage.getItem(FONT_SIZE_KEY));

    if (stored >= FONT_SIZE_MIN && stored <= FONT_SIZE_MAX) {
      return stored;
    }
  } catch {
    // Speicher nicht verfügbar – Standard nehmen
  }

  return FONT_SIZE_DEFAULT;
};

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

function App() {
  const [diaryPassword, setDiaryPassword] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [fontSize, setFontSize] = useState(loadFontSize);

  const [diaries, setDiaries] = useState<Diary[]>(() =>
    DiaryService.loadDiaries()
  );
  const [activeDiaryId, setActiveDiaryId] = useState(() =>
    DiaryService.loadActiveDiaryId()
  );
  const [newDiaryName, setNewDiaryName] = useState<string | null>(null);

  // null = neuer Eintrag
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorText, setEditorText] = useState("");
  const [editorPhoto, setEditorPhoto] = useState<EntryPhoto | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Textfeld wächst mit dem Text mit, damit man alles ohne Scrollen liest.
  useEffect(() => {
    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight + 2}px`;
    }
  }, [editorText, selectedId, fontSize]);

  useEffect(() => {
    setEntries(DiaryService.load());
  }, []);

  const changeFontSize = (delta: number) => {
    setFontSize((current) => {
      const next = Math.min(
        FONT_SIZE_MAX,
        Math.max(FONT_SIZE_MIN, current + delta)
      );

      try {
        localStorage.setItem(FONT_SIZE_KEY, String(next));
      } catch {
        // ignorieren
      }

      return next;
    });
  };

  const activeDiary =
    diaries.find((diary) => diary.id === activeDiaryId) ?? DEFAULT_DIARY;

  const diaryOf = (entry: Entry) => entry.diaryId ?? DEFAULT_DIARY.id;

  const visibleEntries = entries.filter(
    (entry) => diaryOf(entry) === activeDiary.id
  );

  const selectedEntry =
    visibleEntries.find((entry) => entry.id === selectedId) ?? null;

  const unsyncedEntries = entries.filter(
    (entry) => entry.synced !== true
  );

  const resetPhotoInput = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const openEntry = (entry: Entry | null) => {
    setSelectedId(entry?.id ?? null);
    setEditorText(entry?.text ?? "");
    setEditorPhoto(entry?.photo ?? null);
    resetPhotoInput();

    // Am Handy steht die Liste unter dem Editor: nach oben scrollen.
    if (window.innerWidth <= 760) {
      editorRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const switchDiary = (id: string) => {
    setActiveDiaryId(id);
    DiaryService.saveActiveDiaryId(id);
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
    setNewDiaryName(null);
    switchDiary(updated[updated.length - 1].id);
    setStatus(`Tagebuch „${name}“ angelegt ✅`);
  };

  const preparePhoto = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      setStatus("Foto wird verkleinert und vorbereitet...");
      setEditorPhoto(await PhotoService.prepare(file));
      setStatus("Foto ist bereit ✅");
    } catch (error) {
      console.error("Foto-Fehler:", error);
      setStatus(`Foto-Fehler: ${errorText(error)}`);
    }
  };

  const saveLocally = () => {
    if (!editorText.trim()) {
      setStatus("Bitte zuerst einen Text eingeben.");
      return;
    }

    try {
      if (selectedEntry) {
        const updated = DiaryService.update(
          selectedEntry.id,
          editorText.trim(),
          entries,
          editorPhoto
        );

        setEntries(updated);
        setStatus("Änderungen lokal gespeichert ✅ – noch nicht auf BSV.");
      } else {
        const updated = DiaryService.create(
          editorText.trim(),
          entries,
          editorPhoto ?? undefined,
          activeDiary.id
        );

        setEntries(updated);
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
        `Verschlüssele ${unsyncedEntries.length} Eintrag/Einträge und speichere auf BSV...`
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
            setStatus(
              `Transaktion ${batch} von ${batches} gespeichert...`
            );
          }
        }
      );

      setStatus(`${saved} Eintrag/Einträge verschlüsselt auf BSV gespeichert ✅`);
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

      if (result.found > 0 && result.entries.length === 0) {
        setStatus(
          `${result.found} Einträge gefunden, aber keiner ließ sich entschlüsseln – stimmt das Passwort?`
        );
        return;
      }

      const merged = DiaryService.mergeWithChain(result.entries, entries);

      setDiaries(DiaryService.mergeDiaries(result.diaries, diaries));

      setEntries(merged);
      openEntry(null);

      const skipped =
        result.undecryptable > 0
          ? ` (${result.undecryptable} mit anderem Passwort übersprungen)`
          : "";

      setStatus(
        `${result.entries.length} Eintrag/Einträge von BSV geladen ✅${skipped}`
      );
    } catch (error) {
      console.error("BSV-Laden fehlgeschlagen:", error);
      setStatus(`BSV-Laden fehlgeschlagen: ${errorText(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="app"
      style={{ "--entry-size": `${fontSize}px` } as React.CSSProperties}
    >
      <header className="topbar">
        <h1>Diary of Peter</h1>

        <div className="topbar-actions">
          <input
            type="password"
            value={diaryPassword}
            onChange={(event) => setDiaryPassword(event.target.value)}
            placeholder="Tagebuch-Passwort"
            autoComplete="current-password"
          />

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

          <div className="font-size" title="Schriftgröße der Einträge">
            <button
              type="button"
              onClick={() => changeFontSize(-1)}
              disabled={fontSize <= FONT_SIZE_MIN}
              aria-label="Schrift kleiner"
            >
              A−
            </button>
            <span>{fontSize}</span>
            <button
              type="button"
              onClick={() => changeFontSize(1)}
              disabled={fontSize >= FONT_SIZE_MAX}
              aria-label="Schrift größer"
            >
              A+
            </button>
          </div>
        </div>

        {status && <p className="status">{status}</p>}
      </header>

      <nav className="tabs">
        {diaries.map((diary) => {
          const unsynced = entries.filter(
            (entry) =>
              diaryOf(entry) === diary.id && entry.synced !== true
          ).length;

          return (
            <button
              key={diary.id}
              type="button"
              className={diary.id === activeDiary.id ? "tab active" : "tab"}
              onClick={() => switchDiary(diary.id)}
            >
              {diary.name}
              {unsynced > 0 && <span className="tab-dot">●</span>}
            </button>
          );
        })}

        {newDiaryName === null ? (
          <button
            type="button"
            className="tab add"
            onClick={() => setNewDiaryName("")}
            title="Neues Tagebuch"
          >
            +
          </button>
        ) : (
          <form
            className="new-diary"
            onSubmit={(event) => {
              event.preventDefault();
              createDiary();
            }}
          >
            <input
              autoFocus
              value={newDiaryName}
              onChange={(event) => setNewDiaryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setNewDiaryName(null);
                }
              }}
              placeholder="z. B. Arbeit, Hobby…"
              maxLength={40}
            />
            <button type="submit" className="primary">
              Anlegen
            </button>
            <button type="button" onClick={() => setNewDiaryName(null)}>
              Abbrechen
            </button>
          </form>
        )}
      </nav>

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
            ref={textareaRef}
            className="diary-text"
            value={editorText}
            onChange={(event) => setEditorText(event.target.value)}
            placeholder="Was ist heute passiert?"
            rows={8}
          />

          <label className="photo-input">
            {editorPhoto ? "Foto ersetzen:" : "Foto hinzufügen:"}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
              onChange={(event) => {
                void preparePhoto(event.target.files?.[0]);
              }}
            />
          </label>

          {editorPhoto && (
            <figure className="photo-preview">
              <img src={editorPhoto.dataUrl} alt={editorPhoto.name} />
              <figcaption>
                {editorPhoto.name}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setEditorPhoto(null);
                    resetPhotoInput();
                  }}
                >
                  entfernen
                </button>
              </figcaption>
            </figure>
          )}

          <div className="editor-actions">
            <button type="button" className="primary" onClick={saveLocally}>
              {selectedEntry ? "Änderungen speichern" : "Eintrag speichern"}
            </button>
            <span className="hint">
              Wird zuerst nur hier gespeichert. Mit „auf BSV speichern“ oben
              kommen alle neuen Einträge gesammelt auf die Chain.
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
