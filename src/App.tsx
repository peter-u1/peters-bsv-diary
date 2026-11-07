import {
  useEffect,
  useRef,
  useState,
} from "react";

import Header from "./components/Header";
import Sidebar from "./components/Sidebar";

import type {
  Entry,
  EntryPhoto,
} from "./types/Entry";

import DiaryService from "./services/DiaryService";
import PhotoService from "./services/PhotoService";

import WalletService from "./blockchain/WalletService";
import BlockchainService from "./blockchain/BlockchainService";

type PhotoPreviewProps = {
  photo: EntryPhoto;
  onRemove: () => void;
};

function PhotoPreview({
  photo,
  onRemove,
}: PhotoPreviewProps) {
  return (
    <div
      style={{
        marginTop: 12,
        marginBottom: 12,
      }}
    >
      <img
        src={photo.dataUrl}
        alt={photo.name}
        style={{
          display: "block",
          maxWidth: "100%",
          width: 420,
          maxHeight: 340,
          objectFit: "contain",
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
      />

      <div
        style={{
          marginTop: 6,
          fontSize: 13,
        }}
      >
        {photo.name}
      </div>

      <button
        type="button"
        onClick={onRemove}
        style={{
          marginTop: 8,
        }}
      >
        Foto entfernen
      </button>
    </div>
  );
}

function App() {
  const [diaryPassword, setDiaryPassword] =
    useState("");

  const [text, setText] = useState("");
  const [editingText, setEditingText] =
    useState("");

  const [entries, setEntries] =
    useState<Entry[]>([]);

  const [selectedEntry, setSelectedEntry] =
    useState<Entry | null>(null);

  const [newPhoto, setNewPhoto] =
    useState<EntryPhoto | null>(null);

  const [editingPhoto, setEditingPhoto] =
    useState<EntryPhoto | null>(null);

  const [walletStatus, setWalletStatus] =
    useState("Wallet nicht verbunden");

  const newPhotoInputRef =
    useRef<HTMLInputElement>(null);

  const editingPhotoInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEntries(DiaryService.load());
  }, []);

  const connectWallet = async () => {
    try {
      setWalletStatus("Verbinde Wallet...");

      await WalletService.connect();

      setWalletStatus("Wallet verbunden ✅");
    } catch (error) {
      console.error("Wallet-Fehler:", error);

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setWalletStatus(
        `Wallet-Verbindung fehlgeschlagen: ${message}`
      );
    }
  };

  const loadDiaryActions = async () => {
    try {
      setWalletStatus(
        "Lade Tagebuch-Aktionen..."
      );

      const result =
        await WalletService.listDiaryActions();

      console.log("Diary Actions:", result);

      setWalletStatus(
        `${result.totalActions} Tagebuch-Aktion(en) gefunden ✅`
      );
    } catch (error) {
      console.error(
        "Fehler beim Laden der Aktionen:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setWalletStatus(
        `Aktionen konnten nicht geladen werden: ${message}`
      );
    }
  };

  const preparePhoto = async (
    file: File | undefined,
    destination: "new" | "editing"
  ) => {
    if (!file) {
      return;
    }

    try {
      setWalletStatus(
        "Foto wird verkleinert und vorbereitet..."
      );

      const preparedPhoto =
        await PhotoService.prepare(file);

      if (destination === "new") {
        setNewPhoto(preparedPhoto);
      } else {
        setEditingPhoto(preparedPhoto);
      }

      setWalletStatus("Foto ist bereit ✅");
    } catch (error) {
      console.error(
        "Foto konnte nicht vorbereitet werden:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setWalletStatus(
        `Foto-Fehler: ${message}`
      );
    }
  };

  const saveEntry = () => {
    if (!text.trim()) {
      setWalletStatus(
        "Bitte zuerst einen Text eingeben."
      );
      return;
    }

    try {
      const updatedEntries =
        DiaryService.create(
          text.trim(),
          entries,
          newPhoto ?? undefined
        );

      const newestEntry = updatedEntries[0];

      setEntries(updatedEntries);
      setSelectedEntry(newestEntry);
      setEditingText(newestEntry.text);
      setEditingPhoto(
        newestEntry.photo ?? null
      );

      setText("");
      setNewPhoto(null);

      if (newPhotoInputRef.current) {
        newPhotoInputRef.current.value = "";
      }

      setWalletStatus(
        "Eintrag lokal gespeichert ✅"
      );
    } catch (error) {
      console.error(
        "Lokales Speichern fehlgeschlagen:",
        error
      );

      setWalletStatus(
        "Lokales Speichern fehlgeschlagen. Möglicherweise ist der Browserspeicher voll."
      );
    }
  };

  const selectEntry = (entry: Entry) => {
    setSelectedEntry(entry);
    setEditingText(entry.text);
    setEditingPhoto(entry.photo ?? null);
  };

  const saveSelectedEntry = () => {
    if (!selectedEntry) {
      setWalletStatus(
        "Bitte zuerst einen Eintrag auswählen."
      );
      return;
    }

    if (!editingText.trim()) {
      setWalletStatus(
        "Der Text darf nicht leer sein."
      );
      return;
    }

    try {
      const updatedEntries =
        DiaryService.update(
          selectedEntry.id,
          editingText.trim(),
          entries,
          editingPhoto
        );

      const updatedSelectedEntry =
        updatedEntries.find(
          (entry) =>
            entry.id === selectedEntry.id
        ) ?? null;

      setEntries(updatedEntries);
      setSelectedEntry(updatedSelectedEntry);

      setWalletStatus(
        "Änderungen lokal gespeichert ✅"
      );
    } catch (error) {
      console.error(
        "Änderungen konnten nicht gespeichert werden:",
        error
      );

      setWalletStatus(
        "Lokales Speichern fehlgeschlagen. Möglicherweise ist der Browserspeicher voll."
      );
    }
  };

  const saveSelectedEntryToBsv = async () => {
    if (!selectedEntry) {
      setWalletStatus(
        "Bitte zuerst einen Eintrag auswählen."
      );
      return;
    }

    if (!diaryPassword.trim()) {
      setWalletStatus(
        "Bitte zuerst das Tagebuch-Passwort eingeben."
      );
      return;
    }

    try {
      setWalletStatus(
        selectedEntry.photo
          ? "Verschlüssele Text und Foto und speichere auf BSV..."
          : "Verschlüssele Text und speichere auf BSV..."
      );

      const result =
        await BlockchainService.save(
          selectedEntry,
          diaryPassword
        );

      console.log("BSV-Ergebnis:", result);

      const updatedEntries =
        DiaryService.markSynced(
          selectedEntry.id,
          entries
        );

      setEntries(updatedEntries);
      setSelectedEntry(
        updatedEntries.find(
          (entry) => entry.id === selectedEntry.id
        ) ?? null
      );

      setWalletStatus(
        selectedEntry.photo
          ? "Text und Foto verschlüsselt auf BSV gespeichert ✅"
          : "Eintrag verschlüsselt auf BSV gespeichert ✅"
      );
    } catch (error) {
      console.error(
        "BSV-Speichern fehlgeschlagen:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setWalletStatus(
        `BSV-Speichern fehlgeschlagen: ${message}`
      );
    }
  };

  const loadEntriesFromBsv = async () => {
    if (!diaryPassword.trim()) {
      setWalletStatus(
        "Bitte zuerst das Tagebuch-Passwort eingeben."
      );
      return;
    }

    try {
      setWalletStatus(
        "Lade und entschlüssele Einträge von BSV..."
      );

      const loadedEntries =
        await BlockchainService.loadEntries(
          diaryPassword
        );

      const mergedEntries =
        DiaryService.mergeWithChain(
          loadedEntries,
          entries
        );

      setEntries(mergedEntries);

      if (mergedEntries.length > 0) {
        const firstEntry = mergedEntries[0];

        setSelectedEntry(firstEntry);
        setEditingText(firstEntry.text);
        setEditingPhoto(
          firstEntry.photo ?? null
        );
      } else {
        setSelectedEntry(null);
        setEditingText("");
        setEditingPhoto(null);
      }

      setWalletStatus(
        `${loadedEntries.length} Eintrag/Einträge von BSV geladen ✅`
      );
    } catch (error) {
      console.error(
        "BSV-Laden fehlgeschlagen:",
        error
      );

      const message =
        error instanceof Error
          ? error.message
          : String(error);

      setWalletStatus(
        `BSV-Laden fehlgeschlagen: ${message}`
      );
    }
  };

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial",
        width: "100%",
        boxSizing: "border-box",
        textAlign: "left",
      }}
    >
      <Header title="Diary of Peter" />

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <button onClick={connectWallet}>
          BSV Wallet verbinden
        </button>

        <button onClick={loadDiaryActions}>
          BSV-Aktionen suchen
        </button>

        <button onClick={saveSelectedEntryToBsv}>
          Ausgewählten Eintrag auf BSV speichern
        </button>

        <button onClick={loadEntriesFromBsv}>
          Einträge von BSV laden
        </button>
      </div>

      <input
        type="password"
        value={diaryPassword}
        onChange={(event) =>
          setDiaryPassword(event.target.value)
        }
        placeholder="Tagebuch-Passwort"
        autoComplete="off"
        style={{
          display: "block",
          width: 300,
          maxWidth: "100%",
          padding: 8,
          marginBottom: 8,
          boxSizing: "border-box",
        }}
      />

      <p>{walletStatus}</p>

      <div
        style={{
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        <Sidebar
          entries={entries}
          selectedEntry={selectedEntry}
          onSelect={selectEntry}
        />

        <main
          style={{
            flex: 1,
            minWidth: 0,
          }}
        >
          <h2>Neuer Eintrag</h2>

          <textarea
            value={text}
            onChange={(event) =>
              setText(event.target.value)
            }
            placeholder="Schreibe einen neuen privaten Eintrag..."
            rows={6}
            style={{
              width: "100%",
              padding: 10,
              fontSize: 16,
              boxSizing: "border-box",
            }}
          />

          <div
            style={{
              marginTop: 12,
            }}
          >
            <label>
              Foto hinzufügen:
              <br />

              <input
                ref={newPhotoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                onChange={(event) => {
                  void preparePhoto(
                    event.target.files?.[0],
                    "new"
                  );
                }}
                style={{
                  marginTop: 6,
                }}
              />
            </label>
          </div>

          {newPhoto && (
            <PhotoPreview
              photo={newPhoto}
              onRemove={() => {
                setNewPhoto(null);

                if (newPhotoInputRef.current) {
                  newPhotoInputRef.current.value =
                    "";
                }
              }}
            />
          )}

          <button
            onClick={saveEntry}
            style={{
              marginTop: 14,
            }}
          >
            Eintrag lokal speichern
          </button>

          <hr
            style={{
              margin: "30px 0",
            }}
          />

          {selectedEntry ? (
            <section>
              <h2>Eintrag bearbeiten</h2>

              <small>
                Erstellt: {selectedEntry.createdAt}

                {selectedEntry.updatedAt && (
                  <>
                    {" "}
                    · Bearbeitet:{" "}
                    {selectedEntry.updatedAt}
                  </>
                )}
              </small>

              <br />
              <br />

              <textarea
                value={editingText}
                onChange={(event) =>
                  setEditingText(
                    event.target.value
                  )
                }
                rows={12}
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />

              <div
                style={{
                  marginTop: 12,
                }}
              >
                <label>
                  Foto hinzufügen oder ersetzen:
                  <br />

                  <input
                    ref={editingPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
                    onChange={(event) => {
                      void preparePhoto(
                        event.target.files?.[0],
                        "editing"
                      );
                    }}
                    style={{
                      marginTop: 6,
                    }}
                  />
                </label>
              </div>

              {editingPhoto && (
                <PhotoPreview
                  photo={editingPhoto}
                  onRemove={() => {
                    setEditingPhoto(null);

                    if (
                      editingPhotoInputRef.current
                    ) {
                      editingPhotoInputRef.current.value =
                        "";
                    }
                  }}
                />
              )}

              <button
                onClick={saveSelectedEntry}
                style={{
                  marginTop: 14,
                }}
              >
                Änderungen lokal speichern
              </button>
            </section>
          ) : (
            <p>Kein Eintrag ausgewählt.</p>
          )}
        </main>
      </div>
    </div>
  );
}

export default App;