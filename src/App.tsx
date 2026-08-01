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
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
  const [walletStatus, setWalletStatus] = useState(
    "Wallet nicht verbunden"
  );

  useEffect(() => {
    setEntries(DiaryService.load());
  }, []);

  const testEncryption = async () => {
    try {
      const encrypted = await EncryptionService.encrypt(
        "Das ist mein geheimer Test",
        "mein-test-passwort"
      );

      console.log("Verschlüsselt:", encrypted);

      const decrypted = await EncryptionService.decrypt(
        encrypted,
        "mein-test-passwort"
      );

      console.log("Entschlüsselt:", decrypted);
      setWalletStatus(`Verschlüsselung funktioniert ✅: ${decrypted}`);
    } catch (error) {
      console.error(error);
      setWalletStatus("Verschlüsselung fehlgeschlagen ❌");
    }
  };

  const connectWallet = async () => {
    try {
      setWalletStatus("Verbinde Wallet...");
      await WalletService.connect();
      setWalletStatus("Wallet verbunden ✅");
    } catch (error) {
      console.error(error);
      setWalletStatus("Wallet Fehler ❌");
    }
  };

  const createBsvTest = async () => {
    try {
      setWalletStatus("Speichere BSV Test...");
      const result = await WalletService.createTestAction();

      console.log(result);
      setWalletStatus("BSV Test gespeichert ✅");
    } catch (error) {
      console.error(error);
      setWalletStatus("BSV Test Fehler ❌");
    }
  };
  // HIER EINFÜGEN 👇
  const saveSelectedEntryToBsv = async () => {
    if (!selectedEntry) {
      setWalletStatus("Bitte zuerst einen Eintrag auswählen.");
      return;
    }

    if (!diaryPassword.trim()) {
      setWalletStatus("Bitte zuerst das Tagebuch-Passwort eingeben.");
      return;
    }

    try {
      setWalletStatus("Verschlüssele und speichere auf BSV...");

      const result = await BlockchainService.save(
        selectedEntry,
        diaryPassword
      );

      console.log(result);

      setWalletStatus("Eintrag verschlüsselt auf BSV gespeichert ✅");
    } catch (error) {
      console.error(error);
      setWalletStatus("Fehler beim Speichern ❌");
    }
  };

  useEffect(() => {
    ...
  }); 
  const saveSelectedEntryToBsv = async () => {
    if (!selectedEntry) {
      setWalletStatus("Bitte zuerst einen Eintrag auswählen.");
      return;
    }

    if (!diaryPassword.trim()) {
      setWalletStatus("Bitte zuerst das Tagebuch-Passwort eingeben.");
      return;
    }

    try {
      setWalletStatus("Verschlüssele und speichere auf BSV...");

      const result = await BlockchainService.save(
        selectedEntry,
        diaryPassword
      );

      console.log("BSV result:", result);

      setWalletStatus(
        "Eintrag verschlüsselt auf BSV gespeichert ✅"
      );
    } catch (error) {
      console.error(error);
      setWalletStatus("Fehler beim verschlüsselten Speichern ❌");
    }
  };

  const saveEntry = () => {
    if (!text.trim()) return;

    const updated = DiaryService.create(text, entries);
    setEntries(updated);

    const newestEntry = updated[0];

    setSelectedEntry(newestEntry);
    setEditingText(newestEntry.text);
    setText("");
  };

  const selectEntry = (entry: Entry) => {
    setSelectedEntry(entry);
    setEditingText(entry.text);
  };

  const saveSelectedEntry = () => {
    if (!selectedEntry) return;

    const updated = DiaryService.update(
      selectedEntry.id,
      editingText,
      entries
    );

    setEntries(updated);

    const updatedSelected =
      updated.find((entry) => entry.id === selectedEntry.id) ?? null;

    setSelectedEntry(updatedSelected);
  };

  return (
    <div
      style={{
        padding: 40,
        fontFamily: "Arial",
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      <Header title="Diary of Peter" />

      <button onClick={connectWallet}>
        BSV Wallet verbinden
      </button>

      <button onClick={createBsvTest}>
        BSV Test speichern
      </button>

      <button onClick={saveSelectedEntryToBsv}>
        Ausgewählten Eintrag verschlüsselt auf BSV speichern
      </button>

      <button onClick={testEncryption}>
        Verschlüsselung testen
      </button>

      <input
        type="password"
        value={diaryPassword}
        onChange={(event) => setDiaryPassword(event.target.value)}
        placeholder="Tagebuch-Passwort"
        style={{
          display: "block",
          marginTop: 12,
          padding: 8,
          width: 300,
        }}
      />

      <p>{walletStatus}</p>

      <div style={{ display: "flex", gap: 20 }}>
        <Sidebar
          entries={entries}
          selectedEntry={selectedEntry}
          onSelect={selectEntry}
        />

        <div style={{ flex: 1 }}>
          <h2>Neuer Eintrag</h2>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Schreibe einen neuen privaten Eintrag..."
            rows={6}
            style={{ width: "100%", fontSize: 16 }}
          />

          <br />
          <br />

          <button onClick={saveEntry}>
            Eintrag speichern
          </button>

          <hr />

          {selectedEntry ? (
            <div>
              <h2>Eintrag bearbeiten</h2>

              <small>
                Erstellt: {selectedEntry.createdAt}
                {selectedEntry.updatedAt && (
                  <> · Bearbeitet: {selectedEntry.updatedAt}</>
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
                style={{ width: "100%", fontSize: 16 }}
              />

              <br />
              <br />

              <button onClick={saveSelectedEntry}>
                Änderungen speichern
              </button>
            </div>
          ) : (
            <p>Kein Eintrag ausgewählt.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;