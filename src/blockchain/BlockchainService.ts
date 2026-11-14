import WalletService from "./WalletService";
import EncryptionService from "./EncryptionService";
import ChainIndexService from "./ChainIndexService";
import { joinParts, splitPayload } from "./PdpParts";
import { MAX_PHOTOS, photosOf } from "../types/Entry";
import type {
  Diary,
  Entry,
  EntryPhoto,
} from "../types/Entry";
import type { PDPv1 } from "../types/PDP";

type DecryptedEntryContent = {
  text: string;
  photos?: EntryPhoto[];
  /** Tagebuch – liegt verschlüsselt im Eintrag, damit auch die Namen privat bleiben */
  diary?: Diary;
  /** Grabstein: Eintrag wurde gelöscht */
  deleted?: boolean;
};

/** Ein gefundener Eintrag samt Infos, welche Version die neueste ist */
type FoundEntry = {
  entry: Entry;
  diary?: Diary;
  deleted: boolean;
  savedAt: number;
  height: number;
  order: number;
};

export type LoadResult = {
  entries: Entry[];
  /** Tagebücher, die in den Einträgen vorkommen */
  diaries: Diary[];
  /** Tagebuch-Transaktionen, die gefunden wurden */
  found: number;
  /** Davon mit dem Passwort nicht entschlüsselbar */
  undecryptable: number;
  /** Transaktionen, die nicht von der Chain abrufbar waren */
  skippedTxs: number;
  /** Transaktionen, die nur über die Wallet gefunden wurden (ohne Index) */
  walletOnlyTxs: number;
  /** Geteilte Einträge, von denen Teile fehlen */
  incompleteEntries: number;
  /** Wallet war verbunden, hat aber ihren Verlauf nicht geliefert */
  walletFailed: boolean;
};

// Obergrenzen pro Transaktion (ein Foto ist verschlüsselt ca. 350 KB)
const MAX_BATCH_BYTES = 900_000;
const MAX_BATCH_ENTRIES = 25;

class BlockchainService {
  /**
   * Speichert mehrere Einträge auf BSV. Kleine Einträge kommen gemeinsam
   * in eine Transaktion. Große Einträge (mit Fotos) werden in Teile
   * zerlegt; sehr große (mehrere Fotos) verteilen sich auf mehrere
   * Transaktionen. onSaved wird nach jeder erfolgreichen Transaktion mit
   * den Einträgen aufgerufen, die damit vollständig gespeichert sind.
   */
  async saveMany(
    entries: Entry[],
    diaries: Diary[],
    password: string,
    onSaved?: (savedIds: string[], batch: number, batches: number) => void
  ): Promise<number> {
    if (!password.trim()) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    type PlannedTx = {
      outputs: string[];
      size: number;
      /** Einträge, die mit dieser Transaktion vollständig auf der Chain sind */
      completedIds: string[];
    };

    const txs: PlannedTx[] = [];
    let current: PlannedTx = { outputs: [], size: 0, completedIds: [] };

    const flush = () => {
      if (current.outputs.length > 0) {
        txs.push(current);
        current = { outputs: [], size: 0, completedIds: [] };
      }
    };

    for (const entry of entries) {
      const payload = await this.buildPayload(
        entry,
        diaries.find((diary) => diary.id === entry.diaryId),
        password
      );

      // Manche Wallets erlauben höchstens 100 000 Bytes pro Output.
      const outputs = splitPayload(payload, crypto.randomUUID());

      if (payload.length > MAX_BATCH_BYTES) {
        // Sehr großer Eintrag: eigene Transaktionen, Teil für Teil
        flush();

        for (const output of outputs) {
          if (
            current.outputs.length > 0 &&
            current.size + output.length > MAX_BATCH_BYTES
          ) {
            flush();
          }

          current.outputs.push(output);
          current.size += output.length;
        }

        current.completedIds.push(entry.id);
        flush();
        continue;
      }

      if (
        current.outputs.length > 0 &&
        (current.size + payload.length > MAX_BATCH_BYTES ||
          current.completedIds.length >= MAX_BATCH_ENTRIES)
      ) {
        flush();
      }

      current.outputs.push(...outputs);
      current.size += payload.length;
      current.completedIds.push(entry.id);
    }

    flush();

    const indexLockingScript =
      await ChainIndexService.getIndexLockingScript(password);

    let saved = 0;

    for (let index = 0; index < txs.length; index++) {
      const tx = txs[index];

      await WalletService.createDiaryTransaction(
        tx.outputs,
        indexLockingScript,
        Math.max(1, tx.completedIds.length)
      );

      saved += tx.completedIds.length;

      onSaved?.(tx.completedIds, index + 1, txs.length);
    }

    return saved;
  }

  private async buildPayload(
    entry: Entry,
    diary: Diary | undefined,
    password: string
  ): Promise<string> {
    const photos = photosOf(entry);

    const content: DecryptedEntryContent = entry.deleted
      ? { text: "", deleted: true }
      : {
          text: entry.text,
          ...(photos.length > 0 ? { photos } : {}),
          ...(diary ? { diary: { id: diary.id, name: diary.name } } : {}),
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

    return JSON.stringify(pdp);
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

      for (const script of tx.outputScripts) {
        if (script.startsWith("006a")) {
          scripts.push({
            script,
            height: tx.height,
            order: order++,
          });
        }
      }
    }

    const skippedTxs = ChainIndexService.lastSkipped;
    let walletOnlyTxs = 0;

    let walletFailed = false;

    // Die Wallet ist nur ein Zusatz (alte Einträge ohne Index-Adresse).
    // Antwortet sie nicht, wird trotzdem alles von der Chain geladen.
    let walletActions: any[] = [];

    if (WalletService.isConnected()) {
      try {
        walletActions = (await WalletService.listDiaryActions()).actions;
      } catch (error) {
        walletFailed = true;
        console.warn("Wallet-Verlauf nicht abrufbar:", error);
      }
    }

    {
      for (const action of walletActions) {
        if (seenTxids.has(action.txid)) {
          continue;
        }

        walletOnlyTxs++;

        const diaryOutputs = (action.outputs ?? []).filter(
          (output: any) =>
            output.outputDescription ===
              "Encrypted PDP diary entry" &&
            typeof output.lockingScript === "string" &&
            output.lockingScript.startsWith("006a")
        );

        for (const output of diaryOutputs) {
          scripts.push({
            script: output.lockingScript,
            height: 0,
            order: order++,
          });
        }
      }
    }

    const entriesById = new Map<string, FoundEntry>();
    const diariesById = new Map<string, Diary>();
    let found = 0;
    let undecryptable = 0;

    // Geteilte Einträge (mehrere Outputs) wieder zusammensetzen
    const texts: { text: string; height: number; order: number }[] = [];

    for (const { script, height, order: position } of scripts) {
      try {
        texts.push({
          text: this.scriptToText(script),
          height,
          order: position,
        });
      } catch {
        continue;
      }
    }

    const joined = joinParts(texts);

    for (const { text, height, order: position } of joined.items) {
      let pdp: PDPv1;

      try {
        pdp = JSON.parse(text) as PDPv1;
      } catch {
        continue;
      }

      if (typeof pdp !== "object" || pdp === null || !pdp.entry) {
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
          ...(content.diary ? { diaryId: content.diary.id } : {}),
          text: content.text,
          createdAt: pdp.entry.createdAt,

          ...(pdp.entry.updatedAt
            ? { updatedAt: pdp.entry.updatedAt }
            : {}),

          ...(content.photos
            ? { photos: content.photos }
            : {}),

          synced: true,
          onChain: true,
        },
        ...(content.diary ? { diary: content.diary } : {}),
        deleted: content.deleted === true,
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

    // Gelöschte (Grabsteine) fallen weg
    const newest = Array.from(entriesById.values())
      .filter((item) => !item.deleted)
      .sort((a, b) => (this.isNewer(a, b) ? -1 : 1));

    const entries = newest.map((item) => item.entry);

    // Tagebuch-Namen: der zuletzt gespeicherte gewinnt
    const diaryVersions = new Map<string, FoundEntry>();

    for (const item of newest) {
      if (!item.diary) {
        continue;
      }

      const existing = diaryVersions.get(item.diary.id);

      if (!existing || this.isNewer(item, existing)) {
        diaryVersions.set(item.diary.id, item);
      }
    }

    for (const [id, item] of diaryVersions) {
      diariesById.set(id, item.diary as Diary);
    }

    return {
      entries,
      diaries: Array.from(diariesById.values()),
      found,
      undecryptable,
      skippedTxs,
      walletOnlyTxs,
      incompleteEntries: joined.incomplete,
      walletFailed,
    };
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

  private scriptToText(
    lockingScript: string
  ): string {
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

    return new TextDecoder().decode(bytes);
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
        // Neues Format: "photos" (Liste); altes Format: "photo" (eines)
        const rawPhotos: unknown[] = Array.isArray((parsed as any).photos)
          ? (parsed as any).photos
          : (parsed as any).photo
            ? [(parsed as any).photo]
            : [];

        const photos = rawPhotos
          .filter((photo): photo is EntryPhoto => this.isEntryPhoto(photo))
          .slice(0, MAX_PHOTOS);

        const diary = (parsed as any).diary;

        return {
          text: (parsed as any).text,

          ...((parsed as any).deleted === true ? { deleted: true } : {}),

          ...(typeof diary?.id === "string" &&
          typeof diary?.name === "string"
            ? { diary: { id: diary.id, name: diary.name } }
            : {}),

          ...(photos.length > 0 ? { photos } : {}),
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
