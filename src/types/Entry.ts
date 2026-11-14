export type EntryPhoto = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type Diary = {
  id: string;
  name: string;
};

export const DEFAULT_DIARY: Diary = {
  id: "main",
  name: "Tagebuch",
};

export type Entry = {
  id: string;
  /** Zu welchem Tagebuch der Eintrag gehört (fehlt = Standard-Tagebuch) */
  diaryId?: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  /** true = aktueller Stand ist auf der Chain */
  synced?: boolean;
  /** false = war noch nie auf der Chain (fehlt = unbekannt) */
  onChain?: boolean;
  /** Gelöscht – wird als "Grabstein" hochgeladen, damit er überall verschwindet */
  deleted?: boolean;
  /** Bis zu MAX_PHOTOS Fotos */
  photos?: EntryPhoto[];
  /** Altes Format (ein Foto) – wird nur noch gelesen */
  photo?: EntryPhoto;
};

export const MAX_PHOTOS = 10;

/** Fotos eines Eintrags – egal ob im neuen oder alten Format gespeichert */
export const photosOf = (entry: Entry): EntryPhoto[] =>
  entry.photos && entry.photos.length > 0
    ? entry.photos.slice(0, MAX_PHOTOS)
    : entry.photo
      ? [entry.photo]
      : [];