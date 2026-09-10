import { z } from "zod";

import { apiClient } from "@/core/api/client";
import { ApiError, safeApiMessage } from "@/core/api/errors";

const MAX_SIGNED_LINK_TTL_MS = 15 * 60 * 1_000;

export const adminExportRequestSchema = z
  .object({
    exportType: z.enum([
      "overview",
      "platform_analytics",
      "activity",
      "user_report",
    ]),
    period: z.enum(["7d", "30d", "90d"]),
    platform: z.enum(["all", "ios", "android"]).default("all"),
    format: z.enum(["json", "csv", "pdf"]),
    userId: z.string().trim().min(1).max(128).optional(),
    supportReason: z.string().trim().min(10).max(500).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.exportType === "user_report") !==
      Boolean(value.userId && value.supportReason)
    )
      context.addIssue({
        code: "custom",
        message:
          "User exports require an authorized support target and reason.",
      });
  });

export const acceptedAdminExportSchema = z
  .object({
    attemptId: z.uuid(),
    status: z.enum([
      "queued",
      "generating",
      "ready",
      "sending",
      "delivered",
      "failed",
      "expired",
    ]),
    ledgerVersion: z.number().int().nonnegative(),
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const adminExportStatusSchema = z
  .object({
    id: z.uuid(),
    reportType: z.string(),
    format: z.enum(["json", "csv", "pdf"]),
    delivery: z.enum(["download", "email"]),
    status: z.enum([
      "queued",
      "generating",
      "ready",
      "sending",
      "delivered",
      "failed",
      "expired",
    ]),
    metadata: z.record(z.string(), z.unknown()),
    requestedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    downloadUrl: z.url().startsWith("https://").optional(),
    downloadUrlExpiresAt: z.iso.datetime({ offset: true }).optional(),
    errorCode: z.string().max(80).optional(),
    requestId: z.string().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.downloadUrl) !== Boolean(value.downloadUrlExpiresAt))
      context.addIssue({
        code: "custom",
        message: "Download URL and expiry must be paired.",
      });
    if (value.downloadUrl && !["ready", "delivered"].includes(value.status))
      context.addIssue({
        code: "custom",
        message: "Only completed exports may have a link.",
      });
  });

export type AdminExportRequest = z.input<typeof adminExportRequestSchema>;
export type AdminExportStatus = z.infer<typeof adminExportStatusSchema>;

export const reportExportsRepository = {
  request(input: AdminExportRequest) {
    return apiClient.post(
      "/api/v1/admin/exports",
      adminExportRequestSchema.parse(input),
      acceptedAdminExportSchema,
    );
  },
  async get(attemptId: string) {
    const value = await apiClient.get(
      `/api/v1/admin/exports/${encodeURIComponent(z.uuid().parse(attemptId))}`,
      adminExportStatusSchema,
    );
    if (value.downloadUrlExpiresAt) {
      const linkExpiry = Date.parse(value.downloadUrlExpiresAt);
      if (
        linkExpiry <= Date.now() ||
        linkExpiry > Date.now() + MAX_SIGNED_LINK_TTL_MS ||
        linkExpiry > Date.parse(value.expiresAt)
      )
        throw new ApiError("gone", safeApiMessage("gone"), 410);
    }
    return value;
  },
  async wait(
    attemptId: string,
    options: {
      attempts?: number;
      delayMs?: number;
      sleep?: (milliseconds: number) => Promise<void>;
    } = {},
  ): Promise<AdminExportStatus> {
    const attempts = options.attempts ?? 100,
      delayMs = options.delayMs ?? 500,
      sleep =
        options.sleep ??
        ((milliseconds: number) =>
          new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 100 ||
      !Number.isInteger(delayMs) ||
      delayMs < 0 ||
      delayMs > 10_000
    )
      throw new Error("report_export_poll_invalid");
    for (let index = 0; index < attempts; index += 1) {
      const value = await this.get(attemptId);
      if (["ready", "delivered", "failed", "expired"].includes(value.status))
        return value;
      await sleep(delayMs);
    }
    throw new Error("report_export_timeout");
  },
};
