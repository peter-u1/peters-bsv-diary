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
      throw new Error("Wallet ist nicht verbunden");
    }

    const hex = Array.from(new TextEncoder().encode(text))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const result = await this.client.createAction({
      description: "Encrypted diary entry",

      labels: ["peter_diary"],

      outputs: [
        {
          satoshis: 1,
          lockingScript: "006a" + hex,
          outputDescription: "Encrypted PDP diary entry",
        },
      ],
    });

    console.log("Diary transaction:", result);

    return result;
  }
  async listDiaryActions() {
    if (!this.client) {
      throw new Error("Wallet ist nicht verbunden");
    }
  
    const result = await this.client.listActions({
      labels: ["peter_diary"],
      includeLabels: true,
      includeOutputs: true,
      includeOutputLockingScripts: true,
      limit: 100,
    });
  
    console.log(
      "Gefundene Tagebuch-Aktionen vollständig:",
      JSON.stringify(result, null, 2)
    );
  
    return result;
  }
}
export default new WalletService();