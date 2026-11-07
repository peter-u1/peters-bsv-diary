type EncryptedData = {
  ciphertext: string;
  salt: string;
  iv: string;
};

class EncryptionService {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  private bytesToBase64(bytes: Uint8Array): string {
    let binary = "";

    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });

    return btoa(binary);
  }

  private base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  private async deriveKey(
    password: string,
    salt: Uint8Array<ArrayBuffer>,
  ): Promise<CryptoKey> {
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      this.encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );

    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: 250_000,
        hash: "SHA-256",
      },
      passwordKey,
      {
        name: "AES-GCM",
        length: 256,
      },
      false,
      ["encrypt", "decrypt"],
    );
  }

  async encrypt(text: string, password: string): Promise<EncryptedData> {
    if (!password) {
      throw new Error("Passwort fehlt");
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);

    const encryptedBuffer = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      this.encoder.encode(text),
    );

    return {
      ciphertext: this.bytesToBase64(new Uint8Array(encryptedBuffer)),
      salt: this.bytesToBase64(salt),
      iv: this.bytesToBase64(iv),
    };
  }

  async decrypt(
    encryptedData: EncryptedData,
    password: string,
  ): Promise<string> {
    const salt = this.base64ToBytes(encryptedData.salt);
    const iv = this.base64ToBytes(encryptedData.iv);
    const ciphertext = this.base64ToBytes(encryptedData.ciphertext);

    const key = await this.deriveKey(password, salt);

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext,
    );

    return this.decoder.decode(decryptedBuffer);
  }
}

export type { EncryptedData };
export default new EncryptionService();