import type {
  Entry,
  EntryPhoto,
} from "../types/Entry";

const STORAGE_KEY = "diary_entries";

class DiaryService {
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
    photo?: EntryPhoto
  ): Entry[] {
    const newEntry: Entry = {
      id: crypto.randomUUID(),
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

  private save(entries: Entry[]): void {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(entries)
    );
  }
}

export default new DiaryService();