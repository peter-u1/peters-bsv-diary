/**
 * Manche Wallets (z. B. im BSV Browser am iPhone) erlauben pro Output
 * höchstens 100 000 Bytes. Ein Eintrag mit Foto ist größer – er wird
 * deshalb in mehrere Teile zerlegt (je Teil ein Output derselben
 * Transaktion) und beim Laden wieder zusammengesetzt.
 */

/** Maximale Zeichen pro Teil – lässt Platz für die Hülle unter 100 000 Bytes */
export const MAX_PART_CHARS = 90_000;

export type PDPPart = {
  app: "PeterDiary";
  protocol: "PDP";
  version: 1;
  part: {
    /** Gemeinsame Kennung aller Teile eines Eintrags */
    id: string;
    /** Position des Teils, ab 0 */
    index: number;
    total: number;
    data: string;
  };
};

/** Zerlegt einen Payload in Output-Texte. Kleine Payloads bleiben unverändert. */
export function splitPayload(
  payload: string,
  partId: string,
  maxChars = MAX_PART_CHARS
): string[] {
  if (payload.length <= maxChars) {
    return [payload];
  }

  const total = Math.ceil(payload.length / maxChars);
  const outputs: string[] = [];

  for (let index = 0; index < total; index++) {
    const part: PDPPart = {
      app: "PeterDiary",
      protocol: "PDP",
      version: 1,
      part: {
        id: partId,
        index,
        total,
        data: payload.slice(index * maxChars, (index + 1) * maxChars),
      },
    };

    outputs.push(JSON.stringify(part));
  }

  return outputs;
}

function isPart(value: unknown): value is PDPPart {
  const part = (value as any)?.part;

  return (
    typeof part === "object" &&
    part !== null &&
    typeof part.id === "string" &&
    Number.isInteger(part.index) &&
    Number.isInteger(part.total) &&
    part.total > 0 &&
    part.total <= 1000 &&
    part.index >= 0 &&
    part.index < part.total &&
    typeof part.data === "string"
  );
}

/**
 * Setzt geteilte Einträge wieder zusammen. Texte, die kein Teil sind,
 * werden unverändert durchgereicht. Unvollständige Einträge fallen weg
 * und werden in `incomplete` gezählt.
 */
export function joinParts<T extends { text: string }>(
  items: T[]
): { items: T[]; incomplete: number } {
  const result: T[] = [];
  const groups = new Map<
    string,
    { pieces: (string | undefined)[]; received: number; last: T }
  >();

  for (const item of items) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(item.text);
    } catch {
      result.push(item);
      continue;
    }

    if (!isPart(parsed)) {
      result.push(item);
      continue;
    }

    const { id, index, total, data } = parsed.part;
    let group = groups.get(id);

    if (!group) {
      group = { pieces: new Array(total), received: 0, last: item };
      groups.set(id, group);
    }

    if (group.pieces.length !== total || group.pieces[index] !== undefined) {
      continue;
    }

    group.pieces[index] = data;
    group.received++;
    group.last = item;

    if (group.received === total) {
      result.push({ ...group.last, text: group.pieces.join("") });
      groups.delete(id);
    }
  }

  return { items: result, incomplete: groups.size };
}
