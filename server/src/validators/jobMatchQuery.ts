import { z } from "zod";

export const MATCH_MAX_PAGE_LIMIT = 50;

export const jobMatchListQuerySchema = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1, "Page must be at least 1")
    .max(10000)
    .optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(MATCH_MAX_PAGE_LIMIT, `Limit must be ${MATCH_MAX_PAGE_LIMIT} or less`)
    .optional(),
  minScore: z.coerce
    .number()
    .int()
    .min(0, "minScore must be between 0 and 100")
    .max(100, "minScore must be between 0 and 100")
    .optional(),
  matchLevel: z
    .enum(["strong_match", "good_match", "partial_match", "weak_match"])
    .optional(),
  sort: z.enum(["score_asc", "score_desc", "newest"]).optional(),
});

export type JobMatchListQueryParams = z.infer<typeof jobMatchListQuerySchema>;
