import WalletService from "./WalletService";
import EncryptionService from "./EncryptionService";
import type { Entry } from "../types/Entry";
import type { PDPv1 } from "../types/PDP";

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
}

export default new BlockchainService();