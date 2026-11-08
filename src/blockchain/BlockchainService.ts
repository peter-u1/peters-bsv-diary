import WalletService from "./WalletService";
import EncryptionService from "./EncryptionService";
import ChainIndexService from "./ChainIndexService";
import type {
  Entry,
  EntryPhoto,
} from "../types/Entry";
import type { PDPv1 } from "../types/PDP";

type DecryptedEntryContent = {
  text: string;
  photo?: EntryPhoto;
};

/** Ein gefundener Eintrag samt Infos, welche Version die neueste ist */
type FoundEntry = {
  entry: Entry;
  savedAt: number;
  height: number;
  order: number;
};

export type LoadResult = {
  entries: Entry[];
  /** Tagebuch-Transaktionen, die gefunden wurden */
  found: number;
  /** Davon mit dem Passwort nicht entschlüsselbar */
  undecryptable: number;
};

class BlockchainService {
  async save(entry: Entry, password: string) {
    if (!password.trim()) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    const content: DecryptedEntryContent = {
      text: entry.text,
      ...(entry.photo ? { photo: entry.photo } : {}),
    };

    const encrypted =
      await EncryptionService.encrypt(
        JSON.stringify(content),
        password
      );

    const pdp: PDPv1 = {
      app: "PeterDiary",
      protocol: "PDP",
      version: 1,

      entry: {
        id: entry.id,
        createdAt: entry.createdAt,

        ...(entry.updatedAt
          ? { updatedAt: entry.updatedAt }
          : {}),

        savedAt: Date.now(),

        encryption: "AES-256-GCM",
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
      },
    };

    const indexLockingScript =
      await ChainIndexService.getIndexLockingScript(
        password
      );

    return WalletService.createDiaryTransaction(
      JSON.stringify(pdp),
      indexLockingScript
    );
  }

  /**
   * Lädt alle Einträge direkt von der Chain (ohne Wallet).
   * Ist zusätzlich eine Wallet verbunden, werden auch ältere
   * Einträge gefunden, die noch ohne Index-Adresse gespeichert wurden.
   */
  async loadEntries(password: string): Promise<LoadResult> {
    if (!password.trim()) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    const scripts: {
      script: string;
      height: number;
      order: number;
    }[] = [];

    const seenTxids = new Set<string>();
    let order = 0;

    const chainTxs =
      await ChainIndexService.loadDiaryTransactions(password);

    for (const tx of chainTxs) {
      seenTxids.add(tx.txid);

      const script = tx.outputScripts.find((candidate) =>
        candidate.startsWith("006a")
      );

      if (script) {
        scripts.push({
          script,
          height: tx.height,
          order: order++,
        });
      }
    }

    if (WalletService.isConnected()) {
      const result =
        await WalletService.listDiaryActions();

      for (const action of result.actions) {
        if (seenTxids.has(action.txid)) {
          continue;
        }

        const diaryOutput = (action.outputs ?? []).find(
          (output: any) =>
            output.outputDescription ===
              "Encrypted PDP diary entry" &&
            typeof output.lockingScript === "string" &&
            output.lockingScript.startsWith("006a")
        );

        if (diaryOutput?.lockingScript) {
          scripts.push({
            script: diaryOutput.lockingScript,
            height: 0,
            order: order++,
          });
        }
      }
    }

    const entriesById = new Map<string, FoundEntry>();
    let found = 0;
    let undecryptable = 0;

    for (const { script, height, order: position } of scripts) {
      let pdp: PDPv1;

      try {
        pdp = this.parsePdp(script);
      } catch {
        continue;
      }

      if (
        pdp.app !== "PeterDiary" ||
        pdp.protocol !== "PDP" ||
        pdp.version !== 1
      ) {
        continue;
      }

      found++;

      let decrypted: string;

      try {
        decrypted = await EncryptionService.decrypt(
          {
            ciphertext: pdp.entry.ciphertext,
            salt: pdp.entry.salt,
            iv: pdp.entry.iv,
          },
          password
        );
      } catch {
        undecryptable++;
        continue;
      }

      const content =
        this.parseDecryptedContent(decrypted);

      const candidate: FoundEntry = {
        entry: {
          id: pdp.entry.id,
          text: content.text,
          createdAt: pdp.entry.createdAt,

          ...(pdp.entry.updatedAt
            ? { updatedAt: pdp.entry.updatedAt }
            : {}),

          ...(content.photo
            ? { photo: content.photo }
            : {}),

          synced: true,
        },
        savedAt: pdp.entry.savedAt ?? 0,
        // Unbestätigt (0) gilt als neuestes
        height: height === 0 ? Number.MAX_SAFE_INTEGER : height,
        order: position,
      };

      const existing = entriesById.get(pdp.entry.id);

      if (
        !existing ||
        this.isNewer(candidate, existing)
      ) {
        entriesById.set(pdp.entry.id, candidate);
      }
    }

    const entries = Array.from(entriesById.values())
      .sort((a, b) => (this.isNewer(a, b) ? -1 : 1))
      .map((item) => item.entry);

    return { entries, found, undecryptable };
  }

  private isNewer(a: FoundEntry, b: FoundEntry): boolean {
    if (a.savedAt !== b.savedAt) {
      return a.savedAt > b.savedAt;
    }

    if (a.height !== b.height) {
      return a.height > b.height;
    }

    return a.order > b.order;
  }

  private parsePdp(
    lockingScript: string
  ): PDPv1 {
    const hex = lockingScript.startsWith("006a")
      ? lockingScript.slice(4)
      : lockingScript;

    const bytePairs = hex.match(/.{1,2}/g);

    if (!bytePairs) {
      throw new Error("Ungültiger Hex-Inhalt");
    }

    const bytes = new Uint8Array(
      bytePairs.map((pair) =>
        Number.parseInt(pair, 16)
      )
    );

    const jsonText =
      new TextDecoder().decode(bytes);

    return JSON.parse(jsonText) as PDPv1;
  }

  private parseDecryptedContent(
    decrypted: string
  ): DecryptedEntryContent {
    try {
      const parsed: unknown =
        JSON.parse(decrypted);

      if (
        typeof parsed === "object" &&
        parsed !== null &&
        typeof (parsed as any).text === "string"
      ) {
        const photo = (parsed as any).photo;

        return {
          text: (parsed as any).text,

          ...(this.isEntryPhoto(photo)
            ? { photo }
            : {}),
        };
      }
    } catch {
      // Alte Einträge enthielten nur normalen Text.
    }

    return {
      text: decrypted,
    };
  }

  private isEntryPhoto(
    value: unknown
  ): value is EntryPhoto {
    if (
      typeof value !== "object" ||
      value === null
    ) {
      return false;
    }

    const photo =
      value as Record<string, unknown>;

    return (
      typeof photo.name === "string" &&
      typeof photo.mimeType === "string" &&
      typeof photo.dataUrl === "string" &&
      photo.dataUrl.startsWith("data:image/")
    );
  }
}

export default new BlockchainService();
