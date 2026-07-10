export type PDPv1 = {
    app: "PeterDiary";
    protocol: "PDP";
    version: 1;
  
    entry: {
      id: string;
      createdAt: string;
      updatedAt?: string;
      content: string;
    };
  };
