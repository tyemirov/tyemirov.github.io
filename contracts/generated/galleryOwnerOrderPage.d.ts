// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryOwnerOrderPage {
  /**
   * @minItems 0
   * @maxItems 100
   */
  items: {
    id: string;
    createdAt: string;
    status: "payment-pending" | "awaiting-approval" | "complete" | "cancelled" | "revoked";
    email: string;
    totalCents: number;
    currency: string;
    receipt: {
      status: "pending" | "queued" | "sent" | "attention";
    } | null;
  }[];
  nextCursor: string | null;
}
