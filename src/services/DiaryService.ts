import type { Entry } from "../types/Entry";

class DiaryService {
  private storageKey = "diary_entries";

  load(): Entry[] {
    const saved = localStorage.getItem(this.storageKey);

    if (!saved) {
      return [];
    }

    return JSON.parse(saved);
  }

  saveAll(entries: Entry[]) {
    localStorage.setItem(this.storageKey, JSON.stringify(entries));
  }

  create(text: string, existingEntries: Entry[]): Entry[] {
    const newEntry: Entry = {
      id: crypto.randomUUID(),
      text,
      createdAt: new Date().toLocaleString(),
      synced: false,
    };

    const updated = [newEntry, ...existingEntries];

    this.saveAll(updated);

    return updated;
  }

  update(id: string, newText: string, existingEntries: Entry[]): Entry[] {
    const updated = existingEntries.map((entry) =>
      entry.id === id
        ? {
            ...entry,
            text: newText,
            updatedAt: new Date().toLocaleString(),
            synced: false,
          }
        : entry
    );

    this.saveAll(updated);

    return updated;
  }

  delete(id: string, existingEntries: Entry[]): Entry[] {
    const updated = existingEntries.filter((entry) => entry.id !== id);

    this.saveAll(updated);

    return updated;
  }
}

export default new DiaryService();