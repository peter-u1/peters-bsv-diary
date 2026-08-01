import WalletService from "./WalletService";
import EncryptionService from "./EncryptionService";
import type { Entry } from "../types/Entry";
import type { PDPv1 } from "../types/PDP";
import type { EncryptedData } from "./EncryptionService";

class BlockchainService {
  async save(entry: Entry, password: string) {
    if (!password) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    const encrypted = await EncryptionService.encrypt(
      entry.text,
      password
    );

    const pdp: PDPv1 = {
      app: "PeterDiary",
      protocol: "PDP",
      version: 1,

      entry: {
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        encryption: "AES-256-GCM",
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
      },
    };

    console.log("Verschlüsselter PDP-Payload:", pdp);

    return WalletService.createDiaryTransaction(
      JSON.stringify(pdp)
    );
  }

  private hexToText(hex: string): string {
    const cleanHex = hex.startsWith("006a")
      ? hex.slice(4)
      : hex;

    const bytePairs = cleanHex.match(/.{1,2}/g);

    if (!bytePairs) {
      throw new Error("Ungültiger Hex-Text");
    }

    const bytes = new Uint8Array(
      bytePairs.map((byte) => parseInt(byte, 16))
    );

    return new TextDecoder().decode(bytes);
  }

  private parsePDPFromLockingScript(
    lockingScript: string
  ): PDPv1 {
    const jsonText = this.hexToText(lockingScript);

    console.log("Dekodiertes PDP-JSON:", jsonText);

    return JSON.parse(jsonText) as PDPv1;
  }

  async loadEntries(password: string): Promise<Entry[]> {
    if (!password) {
      throw new Error("Tagebuch-Passwort fehlt");
    }

    const result = await WalletService.listDiaryActions();
    const actions = (result as any).actions ?? [];

    const loadedEntries: Entry[] = [];

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

      const pdp = this.parsePDPFromLockingScript(
        diaryOutput.lockingScript
      );

      const encryptedData: EncryptedData = {
        ciphertext: pdp.entry.ciphertext,
        salt: pdp.entry.salt,
        iv: pdp.entry.iv,
      };

      const decryptedText =
        await EncryptionService.decrypt(
          encryptedData,
          password
        );

      loadedEntries.push({
        id: pdp.entry.id,
        createdAt: pdp.entry.createdAt,
        updatedAt: pdp.entry.updatedAt,
        text: decryptedText,
        synced: true,
      });
    }

    return loadedEntries.reverse();
  }
}

export default new BlockchainService();