import { P2PKH, PrivateKey, Transaction } from "@bsv/sdk";

/**
 * Findet Tagebuch-Transaktionen direkt auf der BSV-Chain –
 * ohne Wallet und ohne eigenen Server.
 *
 * Idee: Aus dem Tagebuch-Passwort wird eine feste "Index-Adresse"
 * abgeleitet. Jeder Eintrag schickt 1 Satoshi an diese Adresse.
 * Zum Laden reicht es dann, die Transaktionen dieser Adresse über
 * einen öffentlichen Blockchain-Dienst (WhatsOnChain) abzufragen.
 */

const WOC_BASE = "https://api.whatsonchain.com/v1/bsv/main";

// Fester Salt nur für die Index-Adresse (nicht für die Verschlüsselung).
const INDEX_SALT = "PeterDiary/PDP/index/v1";
const INDEX_ITERATIONS = 250_000;

// WhatsOnChain erlaubt ohne API-Key ca. 3 Anfragen pro Sekunde.
const REQUEST_DELAY_MS = 400;

export type ChainDiaryTx = {
  txid: string;
  /** Blockhöhe, 0 = noch unbestätigt */
  height: number;
  /** Alle Output-Scripts der Transaktion als Hex */
  outputScripts: string[];
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

class ChainIndexService {
  private addressCache = new Map<string, string>();
  private lastRequest = 0;

  /** Transaktionen, die beim letzten Laden nicht abrufbar/lesbar waren */
  lastSkipped = 0;

  async getIndexAddress(password: string): Promise<string> {
    const cached = this.addressCache.get(password);

    if (cached) {
      return cached;
    }

    const encoder = new TextEncoder();

    const baseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: encoder.encode(INDEX_SALT),
        iterations: INDEX_ITERATIONS,
        hash: "SHA-256",
      },
      baseKey,
      256
    );

    const privateKey = new PrivateKey(
      Array.from(new Uint8Array(bits))
    );

    const address = privateKey.toAddress();

    this.addressCache.set(password, address);

    return address;
  }

  async getIndexLockingScript(password: string): Promise<string> {
    const address = await this.getIndexAddress(password);

    return new P2PKH().lock(address).toHex();
  }

  async loadDiaryTransactions(
    password: string
  ): Promise<ChainDiaryTx[]> {
    this.lastSkipped = 0;

    const address = await this.getIndexAddress(password);

    const history = await this.loadHistory(address);

    if (history.size === 0) {
      return [];
    }

    const txids = Array.from(history.keys());
    const result: ChainDiaryTx[] = [];

    // Maximal 20 Transaktionen pro Anfrage.
    for (let index = 0; index < txids.length; index += 20) {
      const chunk = txids.slice(index, index + 20);

      const rawTxs = await this.request<
        { txid: string; hex?: string; error?: string }[]
      >("/txs/hex", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txids: chunk }),
      });

      const returned = new Map(
        (Array.isArray(rawTxs) ? rawTxs : []).map((rawTx) => [
          rawTx.txid,
          rawTx.hex,
        ])
      );

      for (const txid of chunk) {
        const rawTx = { txid, hex: returned.get(txid) };

        // Große Transaktionen (z. B. mit Foto) liefert der Sammelabruf
        // nicht immer mit – dann einzeln nachladen.
        if (!rawTx.hex) {
          try {
            rawTx.hex = await this.requestText(`/tx/${txid}/hex`);
          } catch (error) {
            console.warn("Einzelabruf fehlgeschlagen:", txid, error);
          }
        }

        if (!rawTx.hex) {
          this.lastSkipped++;
          continue;
        }

        try {
          const tx = Transaction.fromHex(rawTx.hex);

          result.push({
            txid: rawTx.txid,
            height: history.get(rawTx.txid) ?? 0,
            outputScripts: tx.outputs.map((output) =>
              output.lockingScript.toHex()
            ),
          });
        } catch (error) {
          this.lastSkipped++;
          console.warn(
            "Transaktion konnte nicht gelesen werden:",
            rawTx.txid,
            error
          );
        }
      }
    }

    return result;
  }

  /** txid → Blockhöhe (0 = unbestätigt) */
  private async loadHistory(
    address: string
  ): Promise<Map<string, number>> {
    const history = new Map<string, number>();

    type HistoryPage = {
      result?: { tx_hash: string; height?: number }[];
      nextPageToken?: string;
    };

    let token: string | undefined;

    do {
      const query = token
        ? `?token=${encodeURIComponent(token)}`
        : "";

      const page = await this.request<HistoryPage>(
        `/address/${address}/confirmed/history${query}`
      );

      for (const item of page.result ?? []) {
        history.set(item.tx_hash, item.height ?? 0);
      }

      token = page.nextPageToken || undefined;
    } while (token);

    const unconfirmed = await this.request<HistoryPage>(
      `/address/${address}/unconfirmed/history`
    );

    for (const item of unconfirmed.result ?? []) {
      if (!history.has(item.tx_hash)) {
        history.set(item.tx_hash, 0);
      }
    }

    return history;
  }

  private async request<T>(
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const response = await this.fetchWithRetry(path, init);

    return (await response.json()) as T;
  }

  private async requestText(path: string): Promise<string> {
    const response = await this.fetchWithRetry(path);

    return (await response.text()).trim();
  }

  private async fetchWithRetry(
    path: string,
    init?: RequestInit
  ): Promise<Response> {
    const wait =
      this.lastRequest + REQUEST_DELAY_MS - Date.now();

    if (wait > 0) {
      await sleep(wait);
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      this.lastRequest = Date.now();

      const response = await fetch(WOC_BASE + path, init);

      if (response.status === 429) {
        await sleep(1500);
        continue;
      }

      if (!response.ok) {
        throw new Error(
          `WhatsOnChain antwortet mit ${response.status}`
        );
      }

      return response;
    }

    throw new Error(
      "WhatsOnChain: zu viele Anfragen, bitte kurz warten."
    );
  }
}

export default new ChainIndexService();
