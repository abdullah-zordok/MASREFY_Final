import { z } from "zod";
import {
  adminSelfContextSchema,
  attentionItemSchema,
  attentionQuerySchema,
  attentionResponseSchema,
  dateRangeSchema,
  globalSearchQuerySchema,
  globalSearchResponseSchema,
  globalSearchResultSchema,
  navigationGroupSchema,
  navigationItemSchema,
  navigationResponseSchema,
  platformBreakdownSchema,
  platformOptionSchema,
  platformOptionsResponseSchema,
} from "./schemas";

export type AdminSession = z.infer<typeof adminSelfContextSchema>;
export type NavigationItem = z.infer<typeof navigationItemSchema>;
export type NavigationGroup = z.infer<typeof navigationGroupSchema>;
export type NavigationResponse = z.infer<typeof navigationResponseSchema>;
export type AttentionItem = z.infer<typeof attentionItemSchema>;
export type AttentionQuery = z.input<typeof attentionQuerySchema>;
export type AttentionResponse = z.infer<typeof attentionResponseSchema>;
export type GlobalSearchQuery = z.input<typeof globalSearchQuerySchema>;
export type GlobalSearchResult = z.infer<typeof globalSearchResultSchema>;
export type GlobalSearchResponse = z.infer<typeof globalSearchResponseSchema>;
export type PlatformOption = z.infer<typeof platformOptionSchema>;
export type PlatformOptionsResponse = z.infer<typeof platformOptionsResponseSchema>;
export type PlatformBreakdown = z.infer<typeof platformBreakdownSchema>;
export type DateRangeInput = z.input<typeof dateRangeSchema>;
