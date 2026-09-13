// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryOrder {
  id: string;
  status: "payment-pending" | "awaiting-approval" | "complete" | "cancelled" | "revoked";
  email: string;
  /**
   * @minItems 1
   * @maxItems 20
   */
  items: [
    {
      artworkId: string;
      title: string;
      offer: {
        id: string;
        priceCents: number;
        currency: string;
        license: string;
        revision: string;
        file: {
          label: string;
          format: "PNG" | "JPEG" | "WebP";
          width: number;
          height: number;
        };
        deliveryTerms: string;
      };
    },
    ...{
      artworkId: string;
      title: string;
      offer: {
        id: string;
        priceCents: number;
        currency: string;
        license: string;
        revision: string;
        file: {
          label: string;
          format: "PNG" | "JPEG" | "WebP";
          width: number;
          height: number;
        };
        deliveryTerms: string;
      };
    }[]
  ];
  totalCents: number;
  currency: string;
  approvalUrl: string | null;
  /**
   * @minItems 0
   * @maxItems 20
   */
  entitlements: {
    offerId: string;
    revision: string;
    status: "active" | "revoked";
  }[];
  receipt: {
    status: "pending" | "queued" | "sent" | "attention";
  } | null;
}
