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
  synced?: boolean;
  photo?: EntryPhoto;
};