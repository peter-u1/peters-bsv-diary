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

  /**
   * Übernimmt Tagebücher von der Chain: fehlende werden ergänzt (sofern
   * sie sichtbare Einträge haben), Namen werden aktualisiert, solange
   * lokal keine nicht hochgeladenen Änderungen in dem Tagebuch liegen.
   */
  mergeDiaries(
    found: Diary[],
    diaries: Diary[],
    entries: Entry[]
  ): Diary[] {
    const diaryOf = (entry: Entry) => entry.diaryId ?? DEFAULT_DIARY.id;

    const hasVisible = (id: string) =>
      entries.some((entry) => diaryOf(entry) === id && !entry.deleted);

    const hasPending = (id: string) =>
      entries.some(
        (entry) => diaryOf(entry) === id && entry.synced !== true
      );

    const foundById = new Map(found.map((diary) => [diary.id, diary]));

    const updated = diaries.map((diary) => {
      const remote = foundById.get(diary.id);

      return remote && remote.name !== diary.name && !hasPending(diary.id)
        ? { ...diary, name: remote.name }
        : diary;
    });

    const known = new Set(updated.map((diary) => diary.id));

    for (const diary of found) {
      if (!known.has(diary.id) && hasVisible(diary.id)) {
        updated.push(diary);
      }
    }

    this.saveDiaries(updated);

    return updated;
  }

  /** Benennt um; die Einträge werden zum erneuten Hochladen markiert. */
  renameDiary(
    id: string,
    name: string,
    diaries: Diary[],
    entries: Entry[]
  ): { diaries: Diary[]; entries: Entry[] } {
    const updatedDiaries = diaries.map((diary) =>
      diary.id === id ? { ...diary, name } : diary
    );

    const updatedEntries = entries.map((entry) =>
      (entry.diaryId ?? DEFAULT_DIARY.id) === id && !entry.deleted
        ? { ...entry, synced: false }
        : entry
    );

    this.saveDiaries(updatedDiaries);
    this.save(updatedEntries);

    return { diaries: updatedDiaries, entries: updatedEntries };
  }

  /** Löscht ein Tagebuch samt Einträgen (auf der Chain per Grabstein). */
  deleteDiary(
    id: string,
    diaries: Diary[],
    entries: Entry[]
  ): { diaries: Diary[]; entries: Entry[] } {
    const updatedDiaries = diaries.filter((diary) => diary.id !== id);

    const ids = entries
      .filter((entry) => (entry.diaryId ?? DEFAULT_DIARY.id) === id)
      .map((entry) => entry.id);

    this.saveDiaries(updatedDiaries);

    return {
      diaries: updatedDiaries,
      entries: this.deleteEntries(ids, entries),
    };
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
      onChain: false,
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

  /**
   * Löscht Einträge. Was nie auf der Chain war, verschwindet sofort;
   * der Rest wird zum Grabstein, der beim nächsten Hochladen auf die
   * Chain kommt und den Eintrag überall ausblendet.
   */
  deleteEntries(ids: string[], entries: Entry[]): Entry[] {
    const idSet = new Set(ids);

    const updatedEntries = entries.flatMap((entry): Entry[] => {
      if (!idSet.has(entry.id)) {
        return [entry];
      }

      if (entry.onChain === false) {
        return [];
      }

      return [
        {
          id: entry.id,
          diaryId: entry.diaryId,
          text: "",
          createdAt: entry.createdAt,
          deleted: true,
          synced: false,
        },
      ];
    });

    this.save(updatedEntries);

    return updatedEntries;
  }

  markSynced(ids: string[], entries: Entry[]): Entry[] {
    const idSet = new Set(ids);

    const updatedEntries = entries.flatMap((entry): Entry[] => {
      if (!idSet.has(entry.id)) {
        return [entry];
      }

      // Hochgeladener Grabstein: lokal nicht mehr nötig
      if (entry.deleted) {
        return [];
      }

      return [{ ...entry, synced: true, onChain: true }];
    });

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