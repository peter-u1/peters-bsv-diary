import React, { useEffect, useState } from "react";
import Header from "./components/Header";
import Sidebar from "./components/Sidebar";
import type { Entry } from "./types/Entry";
import DiaryService from "./services/DiaryService";
import WalletService from "./blockchain/WalletService";
import BlockchainService from "./blockchain/BlockchainService";
import EncryptionService from "./blockchain/EncryptionService";

function App() {
  const [diaryPassword, setDiaryPassword] = useState("");
  const [text, setText] = useState("");
  const [editingText, setEditingText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntry, setSelectedEntry] =
    useState<Entry | null>(null);

  const [walletStatus, setWalletStatus] = useState(
    "Wallet nicht verbunden"
  );

  // Lokale Einträge beim Start laden
  useEffect(() => {
    setEntries(DiaryService.load());
  }, []);

  // Wallet verbinden
  const connectWallet = async () => {
    try {
      setWalletStatus("Verbinde Wallet...");

      await WalletService.connect();

      setWalletStatus("Wallet verbunden ✅");
    } catch (error) {
      console.error("Wallet-Fehler:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `Wallet-Verbindung fehlgeschlagen: ${message}`
      );
    }
  };

  // Einfachen BSV-Test speichern
  const createBsvTest = async () => {
    try {
      setWalletStatus("Speichere BSV-Test...");

      const result =
        await WalletService.createTestAction();

      console.log("BSV-Test:", result);

      setWalletStatus("BSV-Test gespeichert ✅");
    } catch (error) {
      console.error("BSV-Test-Fehler:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `BSV-Test fehlgeschlagen: ${message}`
      );
    }
  };

  // Verschlüsselung lokal testen
  const testEncryption = async () => {
    try {
      const encrypted =
        await EncryptionService.encrypt(
          "Das ist mein geheimer Test",
          "mein-test-passwort"
        );

      console.log("Verschlüsselt:", encrypted);

      const decrypted =
        await EncryptionService.decrypt(
          encrypted,
          "mein-test-passwort"
        );

      console.log("Entschlüsselt:", decrypted);

      setWalletStatus(
        `Verschlüsselung funktioniert ✅: ${decrypted}`
      );
    } catch (error) {
      console.error("Verschlüsselungsfehler:", error);

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `Verschlüsselung fehlgeschlagen: ${message}`
      );
    }
  };

  // Nur prüfen, wie viele Tagebuch-Aktionen vorhanden sind
  const loadDiaryActions = async () => {
    try {
      setWalletStatus(
        "Lade Tagebuch-Aktionen aus der Wallet..."
      );

      const result =
        await WalletService.listDiaryActions();

      console.log("Diary Actions:", result);

      setWalletStatus(
        `${result.totalActions} Tagebuch-Aktion(en) gefunden ✅`
      );
    } catch (error) {
      console.error(
        "Fehler bei listDiaryActions:",
        error
      );

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `Tagebuch-Aktionen konnten nicht geladen werden: ${message}`
      );
    }
  };

  // Ausgewählten Eintrag verschlüsselt auf BSV speichern
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
        "Verschlüssele und speichere auf BSV..."
      );

      const result = await BlockchainService.save(
        selectedEntry,
        diaryPassword
      );

      console.log("BSV-Ergebnis:", result);

      setWalletStatus(
        "Eintrag verschlüsselt auf BSV gespeichert ✅"
      );
    } catch (error) {
      console.error(
        "Fehler beim Speichern auf BSV:",
        error
      );

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `Speichern fehlgeschlagen: ${message}`
      );
    }
  };

  // Einträge von BSV laden und entschlüsseln
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

      setEntries(loadedEntries);

      if (loadedEntries.length > 0) {
        setSelectedEntry(loadedEntries[0]);
        setEditingText(loadedEntries[0].text);
      } else {
        setSelectedEntry(null);
        setEditingText("");
      }

      setWalletStatus(
        `${loadedEntries.length} Eintrag/Einträge von BSV geladen ✅`
      );
    } catch (error) {
      console.error(
        "Fehler beim Laden von BSV:",
        error
      );

      const message =
        error instanceof Error ? error.message : String(error);

      setWalletStatus(
        `Laden fehlgeschlagen: ${message}`
      );
    }
  };

  // Neuen Eintrag lokal speichern
  const saveEntry = () => {
    if (!text.trim()) {
      return;
    }

    const updatedEntries =
      DiaryService.create(text, entries);

    const newestEntry = updatedEntries[0];

    setEntries(updatedEntries);
    setSelectedEntry(newestEntry);
    setEditingText(newestEntry.text);
    setText("");
  };

  // Eintrag in der Sidebar auswählen
  const selectEntry = (entry: Entry) => {
    setSelectedEntry(entry);
    setEditingText(entry.text);
  };

  // Änderungen am ausgewählten Eintrag lokal speichern
  const saveSelectedEntry = () => {
    if (!selectedEntry) {
      return;
    }

    if (!editingText.trim()) {
      return;
    }

    const updatedEntries = DiaryService.update(
      selectedEntry.id,
      editingText,
      entries
    );

    const updatedSelectedEntry =
      updatedEntries.find(
        (entry) => entry.id === selectedEntry.id
      ) ?? null;

    setEntries(updatedEntries);
    setSelectedEntry(updatedSelectedEntry);
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

        <button onClick={createBsvTest}>
          BSV-Test speichern
        </button>

        <button onClick={testEncryption}>
          Verschlüsselung testen
        </button>

        <button onClick={loadDiaryActions}>
          BSV-Aktionen suchen
        </button>

        <button onClick={saveSelectedEntryToBsv}>
          Eintrag verschlüsselt auf BSV speichern
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

          <br />
          <br />

          <button onClick={saveEntry}>
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
                  setEditingText(event.target.value)
                }
                rows={12}
                style={{
                  width: "100%",
                  padding: 10,
                  fontSize: 16,
                  boxSizing: "border-box",
                }}
              />

              <br />
              <br />

              <button onClick={saveSelectedEntry}>
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