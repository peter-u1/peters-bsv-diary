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

    const pageSize = 100;
    const actions: any[] = [];
    let totalActions = 0;
    let offset = 0;

    // Seitenweise laden, damit auch mehr als 100 Einträge gefunden werden.
    do {
      const page = await this.client.listActions({
        labels: ["peter_diary"],
        includeLabels: true,
        includeOutputs: true,
        includeOutputLockingScripts: true,
        limit: pageSize,
        offset,
      });

      totalActions = page.totalActions;
      actions.push(...page.actions);
      offset += page.actions.length;

      if (page.actions.length === 0) {
        break;
      }
    } while (offset < totalActions);

    console.log(
      `Gefundene Tagebuch-Aktionen: ${actions.length} von ${totalActions}`
    );

    return { totalActions, actions };
  }
}
export default new WalletService();