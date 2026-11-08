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

  /**
   * Versucht still, eine Wallet zu verbinden (z. B. zum Laden alter
   * Einträge). Gibt false zurück, wenn keine Wallet da ist.
   */
  async tryConnect(timeoutMs = 4000): Promise<boolean> {
    if (this.client) {
      return true;
    }

    try {
      await Promise.race([
        this.connect(),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Zeitüberschreitung")),
            timeoutMs
          )
        ),
      ]);

      return this.client !== null;
    } catch {
      return false;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  /**
   * Schreibt einen oder mehrere verschlüsselte Einträge in EINER
   * Transaktion auf die Chain (je Eintrag ein OP_RETURN-Output).
   */
  async createDiaryTransaction(
    payloads: string[],
    indexLockingScript?: string
  ) {
    if (!this.client) {
      throw new Error("Wallet ist nicht verbunden");
    }

    if (payloads.length === 0) {
      throw new Error("Keine Einträge zum Speichern");
    }

    const toHex = (text: string) =>
      Array.from(new TextEncoder().encode(text))
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");

    const result = await this.client.createAction({
      description:
        payloads.length === 1
          ? "Encrypted diary entry"
          : `${payloads.length} encrypted diary entries`,

      labels: ["peter_diary"],

      outputs: [
        ...payloads.map((payload) => ({
          satoshis: 1,
          lockingScript: "006a" + toHex(payload),
          outputDescription: "Encrypted PDP diary entry",
        })),

        // 1 Satoshi an die Index-Adresse: damit lässt sich die Transaktion
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