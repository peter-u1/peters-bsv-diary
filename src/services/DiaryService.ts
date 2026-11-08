import { DEFAULT_DIARY } from "../types/Entry";
import type {
  Diary,
  Entry,
  EntryPhoto,
} from "../types/Entry";

const STORAGE_KEY = "diary_entries";
const DIARIES_KEY = "diary_list";
const ACTIVE_DIARY_KEY = "diary_active";

class DiaryService {
  /* ---------- Tagebücher (Reiter) ---------- */

  loadDiaries(): Diary[] {
    try {
      const parsed: unknown = JSON.parse(
        localStorage.getItem(DIARIES_KEY) ?? "[]"
      );

      const diaries = Array.isArray(parsed)
        ? parsed.filter(
            (diary): diary is Diary =>
              typeof diary?.id === "string" &&
              typeof diary?.name === "string"
          )
        : [];

      return this.withDefault(diaries);
    } catch {
      return [DEFAULT_DIARY];
    }
  }

  addDiary(name: string, diaries: Diary[]): Diary[] {
    const updated = [
      ...diaries,
      { id: crypto.randomUUID(), name },
    ];

    this.saveDiaries(updated);

    return updated;
  }

  /** Nimmt Tagebücher auf, die von der Chain kamen und lokal fehlen. */
  mergeDiaries(found: Diary[], diaries: Diary[]): Diary[] {
    const known = new Set(diaries.map((diary) => diary.id));

    const updated = [
      ...diaries,
      ...found.filter((diary) => !known.has(diary.id)),
    ];

    this.saveDiaries(updated);

    return updated;
  }

  loadActiveDiaryId(): string {
    try {
      return localStorage.getItem(ACTIVE_DIARY_KEY) ?? DEFAULT_DIARY.id;
    } catch {
      return DEFAULT_DIARY.id;
    }
  }

  saveActiveDiaryId(id: string): void {
    try {
      localStorage.setItem(ACTIVE_DIARY_KEY, id);
    } catch {
      // ignorieren
    }
  }

  private withDefault(diaries: Diary[]): Diary[] {
    return diaries.some((diary) => diary.id === DEFAULT_DIARY.id)
      ? diaries
      : [DEFAULT_DIARY, ...diaries];
  }

  private saveDiaries(diaries: Diary[]): void {
    localStorage.setItem(DIARIES_KEY, JSON.stringify(diaries));
  }

  /* ---------- Einträge ---------- */

  load(): Entry[] {
    try {
      const storedEntries =
        localStorage.getItem(STORAGE_KEY);

      if (!storedEntries) {
        return [];
      }

      const parsed: unknown = JSON.parse(storedEntries);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (entry): entry is Entry =>
          typeof entry === "object" &&
          entry !== null &&
          typeof entry.id === "string" &&
          typeof entry.text === "string" &&
          typeof entry.createdAt === "string"
      );
    } catch (error) {
      console.error(
        "Lokale Einträge konnten nicht geladen werden:",
        error
      );

      return [];
    }
  }

  create(
    text: string,
    entries: Entry[],
    photo: EntryPhoto | undefined,
    diaryId: string
  ): Entry[] {
    const newEntry: Entry = {
      id: crypto.randomUUID(),
      diaryId,
      text,
      createdAt: new Date().toLocaleString("de-AT"),
      ...(photo ? { photo } : {}),
    };

    const updatedEntries = [newEntry, ...entries];

    this.save(updatedEntries);

    return updatedEntries;
  }

  update(
    id: string,
    text: string,
    entries: Entry[],
    photo: EntryPhoto | null
  ): Entry[] {
    const updatedEntries = entries.map((entry) => {
      if (entry.id !== id) {
        return entry;
      }

      const updatedEntry: Entry = {
        ...entry,
        text,
        updatedAt: new Date().toLocaleString("de-AT"),
        synced: false,
      };

      if (photo) {
        return {
          ...updatedEntry,
          photo,
        };
      }

      const {
        photo: removedPhoto,
        ...entryWithoutPhoto
      } = updatedEntry;

      void removedPhoto;

      return entryWithoutPhoto;
    });

    this.save(updatedEntries);

    return updatedEntries;
  }

  markSynced(ids: string[], entries: Entry[]): Entry[] {
    const idSet = new Set(ids);

    const updatedEntries = entries.map((entry) =>
      idSet.has(entry.id) ? { ...entry, synced: true } : entry
    );

    this.save(updatedEntries);

    return updatedEntries;
  }

  /**
   * Führt von BSV geladene Einträge mit den lokalen zusammen.
   * Lokale Einträge mit noch nicht hochgeladenen Änderungen
   * (synced !== true) werden nicht überschrieben.
   */
  mergeWithChain(
    chainEntries: Entry[],
    localEntries: Entry[]
  ): Entry[] {
    const localById = new Map(
      localEntries.map((entry) => [entry.id, entry])
    );
    const chainIds = new Set(
      chainEntries.map((entry) => entry.id)
    );

    const localOnly = localEntries.filter(
      (entry) => !chainIds.has(entry.id)
    );

    const merged = chainEntries.map((chainEntry) => {
      const local = localById.get(chainEntry.id);

      return local && local.synced !== true
        ? local
        : chainEntry;
    });

    const result = [...localOnly, ...merged];

    this.save(result);

    return result;
  }

  private save(entries: Entry[]): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries)
    );
  }
}

export default new DiaryService();