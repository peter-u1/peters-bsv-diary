import WalletService from "./WalletService";
import type { Entry } from "../types/Entry";

class BlockchainService {
  async save(entry: Entry) {
    const payload = {
      version: 1,
      type: "diary",
      id: entry.id,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      text: entry.text,
    };

    const json = JSON.stringify(payload);

    return await WalletService.createDiaryTransaction(json);
  }
}

export default new BlockchainService();