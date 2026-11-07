import WalletService from "./WalletService";
import EncryptionService from "./EncryptionService";
import type {
  Entry,
  EntryPhoto,
} from "../types/Entry";
import type { PDPv1 } from "../types/PDP";

type DecryptedEntryContent = {
  text: string;
  photo?: EntryPhoto;
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

        encryption: "AES-256-GCM",
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
      },
    };

    console.log(
      "Verschlüsselter PDP-Payload:",
      pdp
    );

    return WalletService.createDiaryTransaction(
      JSON.stringify(pdp)
    );
  }

  async loadEntries(
    password: string
  ): Promise<Entry[]> {
    if (!password.trim()) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    const result =
      await WalletService.listDiaryActions();

    const actions = result.actions ?? [];

    // Pro Eintrags-ID gewinnt die zuletzt geschriebene Version
    // (die Wallet liefert die Aktionen von alt nach neu).
    const entriesById = new Map<string, Entry>();

    for (const action of actions) {
      const outputs = action.outputs ?? [];

      const diaryOutput = outputs.find(
        (output: any) =>
          output.outputDescription ===
            "Encrypted PDP diary entry" &&
          typeof output.lockingScript === "string" &&
          output.lockingScript.startsWith("006a")
      );

      if (!diaryOutput) {
        continue;
      }

      let pdp: PDPv1;

      try {
        pdp = this.parsePdp(
          diaryOutput.lockingScript
        );
      } catch (error) {
        console.warn(
          "Eine Aktion enthält kein gültiges PDP-JSON:",
          error
        );

        continue;
      }

      if (
        pdp.app !== "PeterDiary" ||
        pdp.protocol !== "PDP" ||
        pdp.version !== 1
      ) {
        continue;
      }

      const decrypted =
        await EncryptionService.decrypt(
          {
            ciphertext: pdp.entry.ciphertext,
            salt: pdp.entry.salt,
            iv: pdp.entry.iv,
          },
          password
        );

      const content =
        this.parseDecryptedContent(decrypted);

      entriesById.delete(pdp.entry.id);

      entriesById.set(pdp.entry.id, {
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
      });
    }

    // Neueste zuerst anzeigen.
    return Array.from(entriesById.values()).reverse();
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