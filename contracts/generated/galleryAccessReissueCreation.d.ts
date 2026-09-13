// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryAccessReissueCreation {
  reissue: {
    id: string;
    orderId: string;
    verifiedEmail: string;
    ownerEmail: string;
    createdAt: string;
  };
  accessSecret: string;
  orderUrl: string;
}
