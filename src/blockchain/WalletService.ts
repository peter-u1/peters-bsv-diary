import { WalletClient } from "@bsv/sdk";

class WalletService {
  private client: WalletClient | null = null;

  async connect() {
    const client = new WalletClient();

    const result = await client.getPublicKey({
      identityKey: true,
    });

    this.client = client;

    console.log("Wallet public key:", result);

    return result;
  }

  async createTestAction() {
    return this.createDiaryTransaction("Hello from BSV Diary");
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async createDiaryTransaction(
    text: string,
    indexLockingScript?: string
  ) {
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

        // 1 Satoshi an die Index-Adresse: damit lässt sich der Eintrag
        // später ohne Wallet direkt auf der Chain wiederfinden.
        ...(indexLockingScript
          ? [
              {
                satoshis: 1,
                lockingScript: indexLockingScript,
                outputDescription: "PDP diary index",
              },
            ]
          : []),
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