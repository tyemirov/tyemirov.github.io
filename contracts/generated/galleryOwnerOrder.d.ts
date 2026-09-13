// Generated from contracts/*.schema.json. Do not edit.

export interface GalleryOwnerOrder {
  id: string;
  createdAt: string;
  status: "payment-pending" | "awaiting-approval" | "complete" | "cancelled" | "revoked";
  email: string;
  totalCents: number;
  currency: string;
  receipt: {
    status: "pending" | "queued" | "sent" | "attention";
  } | null;
}
