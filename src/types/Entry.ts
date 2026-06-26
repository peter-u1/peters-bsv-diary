export type Entry = {
    id: string;
  
    createdAt: string;
    updatedAt?: string;
  
    text: string;
  
    txid?: string;
  
    synced: boolean;
  };