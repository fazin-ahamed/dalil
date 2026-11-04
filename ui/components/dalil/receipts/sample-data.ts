/** Sample receipt rows for the design system. Every row is illustrative and labelled Sample in the UI. */

export type ReceiptIncluded = "question" | "controls" | "screenshot" | "context";
export type RedactionType = "card number" | "email" | "phone";

export interface ReceiptRow {
  id: string;
  createdAt?: string;
  model?: string;
  /** 24 hour local time, HH:MM. */
  time: string;
  host: string;
  included: ReceiptIncluded[];
  sizeKb: number;
  redactions: Partial<Record<RedactionType, number>>;
  /** Full sample hash. The table shows a shortened form. */
  hash: string;
}

const HOST = "api.example.com";

export const SAMPLE_RECEIPTS: ReceiptRow[] = [
  {
    id: "r1",
    time: "14:02",
    host: HOST,
    included: ["question", "controls"],
    sizeKb: 3.8,
    redactions: { email: 1, phone: 1 },
    hash: "9f2c41ab7d3e06b85c1fa2d4e9b07c63a58d1e2f4b7c90a3d6e8f1b25c4a07de",
  },
  {
    id: "r2",
    time: "13:47",
    host: HOST,
    included: ["question", "controls", "screenshot"],
    sizeKb: 212.4,
    redactions: { "card number": 1 },
    hash: "3be8d05a91c27f4e6d8b3a1c5f70e29d4a6b8c0e1f3d5a7b9c2e4f60813a5c7b",
  },
  {
    id: "r3",
    time: "13:31",
    host: HOST,
    included: ["question", "controls"],
    sizeKb: 4.1,
    redactions: {},
    hash: "c7a1f3e5092b4d68ae0c2e4f6a8b1d3f5072c9e4b6d8a0f2c4e6b8d1a3f5c7e9",
  },
  {
    id: "r4",
    time: "11:20",
    host: HOST,
    included: ["question", "controls"],
    sizeKb: 2.9,
    redactions: {},
    hash: "5d09b2e4f61a3c8570e9d2b4a6f8c1e3057b9d2f4a6c8e0b1d3f5a7c9e2b4d60",
  },
  {
    id: "r5",
    time: "11:18",
    host: HOST,
    included: ["question"],
    sizeKb: 0.4,
    redactions: {},
    hash: "e41a7c93b5d0f2684a6c8e0b2d4f61a3c5e7092b4d6f8a1c3e5b7d9f0a2c4e68",
  },
  {
    id: "r6",
    time: "10:05",
    host: HOST,
    included: ["question", "controls"],
    sizeKb: 5.6,
    redactions: { email: 2, phone: 1 },
    hash: "08f6d2a4c1e5b79302a4c6e8f1b3d5a7c9e0f2b4d6a8c1e3f5b7d9a0c2e4f681",
  },
  {
    id: "r7",
    time: "09:52",
    host: HOST,
    included: ["question", "controls", "screenshot"],
    sizeKb: 187.9,
    redactions: {},
    hash: "b2c4e6a8d0f13597b9d1f3a5c7e9b0d2f4a6c8e1b3d5f7a9c0e2b4d6f8a1c3e5",
  },
  {
    id: "r8",
    time: "09:40",
    host: HOST,
    included: ["question", "controls"],
    sizeKb: 3.3,
    redactions: { email: 1 },
    hash: "7a3e5c9b1d4f6082a4c6e8b0d2f4a6c8e1b3d5f7a9c0e2b4d6f8a1c3e5b7d9f0",
  },
];

export function redactionTotal(r: ReceiptRow): number {
  return Object.values(r.redactions).reduce((a, b) => a + (b ?? 0), 0);
}

/** First 8 and last 4 characters of the hash. */
export function shortHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-4)}`;
}
