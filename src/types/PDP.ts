export type PDPv1 = {
  app: "PeterDiary";
  protocol: "PDP";
  version: 1;

  entry: {
    id: string;
    createdAt: string;
    updatedAt?: string;

    /** Zeitpunkt des Hochladens (ms seit 1970) – bestimmt die neueste Version */
    savedAt?: number;

    encryption: "AES-256-GCM";
    ciphertext: string;
    salt: string;
    iv: string;
  };
};
