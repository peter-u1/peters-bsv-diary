import { WalletClient } from "@bsv/sdk";

class WalletService {
  private client: WalletClient | null = null;

  async connect() {
    this.client = new WalletClient();

    const result = await this.client.getPublicKey({
      identityKey: true,
    });

    console.log("Wallet public key:", result);
    return result;
  }

  async createTestAction() {
    return this.createDiaryTransaction("Hello from BSV Diary");
  }

  async createDiaryTransaction(text: string) {
    if (!this.client) {
      throw new Error("Wallet not connected");
    }

    const hex = Array.from(new TextEncoder().encode(text))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const result = await this.client.createAction({
      description: "Diary Entry",
      outputs: [
        {
          satoshis: 1,
          lockingScript: "006a" + hex,
          outputDescription: "Diary",
        },
      ],
    });

    console.log("Diary transaction:", result);
    return result;
  }
}

export default new WalletService();