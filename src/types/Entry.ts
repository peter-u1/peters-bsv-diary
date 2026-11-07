export type EntryPhoto = {
  name: string;
  mimeType: string;
  dataUrl: string;
};

export type Entry = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
  synced?: boolean;
  photo?: EntryPhoto;
};