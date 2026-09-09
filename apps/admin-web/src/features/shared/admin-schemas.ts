import { z } from "zod";

export const metricSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  change: z.number().optional(),
  note: z.string().optional(),
  tone: z.enum(["default", "attention", "premium"]).optional(),
});

export const chartPointSchema = z.object({
  name: z.string().min(1),
  current: z.number(),
  previous: z.number().optional(),
  secondary: z.number().optional(),
});

export const severitySchema = z.enum([
  "info",
  "low",
  "medium",
  "high",
  "critical",
]);
export const systemStatusSchema = z.enum([
  "operational",
  "degraded",
  "partial-outage",
  "major-outage",
  "maintenance",
]);

export const userRecordSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().regex(/^[^@]*\*{3}[^@]*@example\.test$/),
  country: z.enum(["السعودية", "الإمارات"]),
  platform: z.enum(["iOS", "Android"]),
  plan: z.enum(["Free", "Basic", "Premium"]),
  status: z.enum(["active", "suspended", "pending"]),
  verification: z.enum(["verified", "pending"]),
  risk: z.enum(["low", "medium", "high"]),
  registeredAt: z.iso.date(),
  lastActive: z.iso.datetime({ offset: true }),
  language: z.string().min(1),
  currency: z.enum(["SAR", "AED"]),
  timezone: z.string().min(1),
  appVersion: z.string().min(1),
  accounts: z.number().int().nonnegative(),
  transactions: z.number().int().nonnegative(),
  goals: z.number().int().nonnegative(),
  lastSync: z.iso.datetime({ offset: true }),
  importSources: z.number().int().nonnegative(),
});

export const importRecordSchema = z.object({
  id: z.string().min(1),
  user: z
    .string()
    .regex(/^USR-\d{2}\*{3}$/)
    .optional(),
  source: z.string().min(1),
  bank: z.string().min(1).optional(),
  platform: z.enum(["iOS", "Android"]).optional(),
  failureType: z.string().min(1),
  parserVersion: z.string().min(1).optional(),
  attempts: z.number().int().nonnegative(),
  revision: z.number().int().positive(),
  severity: severitySchema,
  time: z.iso.datetime({ offset: true }),
  status: z.enum([
    "received",
    "processing",
    "review",
    "complete",
    "failed",
    "cancelled",
    "unsupported",
  ]),
  appVersion: z.string().min(1).optional(),
  sanitizedResult: z
    .string()
    .min(1)
    .max(500)
    .refine(
      (value) => !/\b\d{10,}\b/.test(value),
      "Sanitized results cannot contain long numeric identifiers.",
    ),
});

export const serviceHealthSchema = z.object({
  name: z.string().min(1),
  status: systemStatusSchema,
  uptime: z.string().min(1),
  latency: z.string().min(1),
  errorRate: z.string().min(1),
  lastIncident: z.string().min(1),
  lastCheck: z.string().min(1),
});

export const incidentSchema = z.object({
  id: z.string().min(1),
  severity: severitySchema,
  service: z.string().min(1),
  title: z.string().min(1),
  detail: z.string().min(1).max(500),
  startedAt: z.iso.datetime({ offset: true }),
  status: z.string().min(1),
  affectedArea: z.string().min(1),
  timeline: z.array(z.string().min(1)),
});
