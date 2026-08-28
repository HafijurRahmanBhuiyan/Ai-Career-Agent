import { z } from "zod";

export const ANALYTICS_RANGES = [
  "7d",
  "30d",
  "90d",
  "180d",
  "365d",
  "all",
] as const;

export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const RANGE_DAYS: Record<Exclude<AnalyticsRange, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
};

export const analyticsQuerySchema = z
  .object({
    range: z.enum(ANALYTICS_RANGES).optional(),
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
