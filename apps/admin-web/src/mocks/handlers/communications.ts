import type { RequestHandler } from "msw";
import { http, HttpResponse } from "msw";
import { z } from "zod";
import { ADMIN_ROLES, type AdminRole, type PermissionKey } from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import { actionResultSchema } from "@/features/communications/contracts";
import {
  communicationsOverview,
  communicationsPage,
  findCommunicationDetail,
} from "@/mocks/fixtures/communications";

const base = "/api/v1/admin";
const now = "2026-07-29T12:00:00+03:00";
const audiencePreviewRequestSchema = z.object({
  platforms: z.array(z.enum(["ios", "android", "web"])).min(1).max(3),
  locales: z.array(z.enum(["ar", "en"])).min(1).max(2),
  activity: z.enum(["all", "active", "inactive"]),
  segmentKeys: z.array(z.string()).max(10),
}).strict();

function simulatedRole(request: Request): AdminRole | null {
  const candidate = request.headers.get("x-admin-simulated-role");
  if (candidate === null) return "super-admin";
  return ADMIN_ROLES.find((role) => role === candidate) ?? null;
}

function denied(request: Request, permission: PermissionKey): Response | null {
  const role = simulatedRole(request);
  return role && hasPermission(role, permission)
    ? null
    : HttpResponse.json(safeError(403, "forbidden", "Access denied"), { status: 403 });
}

function safeError(status: number, code: string, message: string) {
  return { status: String(status), code, message, correlationId: "CORR-007-SAFE-0001" };
}

function action(resourceId: string, actionName = "update") {
  return actionResultSchema.parse({
    resourceId,
    previousState: "mock",
    currentState: actionName,
    outcome: "success",
    message: "Mock action accepted",
    timestamp: now,
    auditReference: "AUDIT-7777-ACT",
  });
}

async function readActionName(request: Request): Promise<string> {
  const body: unknown = await request.json().catch(() => ({}));
  return typeof body === "object" && body !== null && "action" in body && typeof body.action === "string"
    ? body.action
    : "update";
}

function detail(id: string) {
  const item = findCommunicationDetail(id);
  return item
    ? HttpResponse.json(item)
    : HttpResponse.json(safeError(404, "not_found", "Record not found"), { status: 404 });
}

export const communicationsHandlers: RequestHandler[] = [
  http.get(`${base}/support/overview`, ({ request }) => denied(request, "support.overview.read") ?? HttpResponse.json(communicationsOverview("support"))),
  http.get(`${base}/support/tickets`, ({ request }) => denied(request, "support.tickets.read") ?? HttpResponse.json({ tickets: communicationsPage("support").items, ...communicationsPage("support") })),
  http.get(`${base}/support/tickets/:ticketId`, ({ request, params }) => denied(request, "support.tickets.read") ?? detail(String(params.ticketId))),
  http.post(`${base}/support/tickets/:ticketId/actions`, async ({ request, params }) => denied(request, "support.tickets.manage") ?? HttpResponse.json(action(String(params.ticketId), await readActionName(request)))),
  http.get(`${base}/support/categories`, ({ request }) => denied(request, "support.categories.read") ?? HttpResponse.json(communicationsPage("support-categories"))),
  http.post(`${base}/support/categories`, async ({ request }) => denied(request, "support.categories.manage") ?? HttpResponse.json(action("CAT-1003", await readActionName(request)))),
  http.post(`${base}/support/categories/:categoryId/actions`, async ({ request, params }) => denied(request, "support.categories.manage") ?? HttpResponse.json(action(String(params.categoryId), await readActionName(request)))),

  http.get(`${base}/feedback/abuse-reports`, ({ request }) => denied(request, "feedback.abuse.manage") ?? HttpResponse.json(communicationsPage("abuse"))),
  http.post(`${base}/feedback/abuse-reports/:reportId/actions`, async ({ request, params }) => denied(request, "feedback.abuse.manage") ?? HttpResponse.json(action(String(params.reportId), await readActionName(request)))),
  http.get(`${base}/feedback`, ({ request }) => denied(request, "feedback.read") ?? HttpResponse.json(communicationsPage("feedback"))),
  http.get(`${base}/feedback/:feedbackId`, ({ request, params }) => denied(request, "feedback.read") ?? detail(String(params.feedbackId))),
  http.post(`${base}/feedback/:feedbackId/actions`, async ({ request, params }) => denied(request, "feedback.manage") ?? HttpResponse.json(action(String(params.feedbackId), await readActionName(request)))),

  http.get(`${base}/content/:collection`, ({ request }) => denied(request, "content.manage") ?? HttpResponse.json(communicationsPage("content"))),
  http.post(`${base}/content/:collection`, async ({ request }) => denied(request, "content.manage") ?? HttpResponse.json(action("CNT-1003-NEW", await readActionName(request)))),
  http.get(`${base}/content/:collection/:itemId`, ({ request, params }) => denied(request, "content.manage") ?? detail(String(params.itemId))),
  http.post(`${base}/content/:collection/:itemId/actions`, async ({ request, params }) => denied(request, "content.manage") ?? HttpResponse.json(action(String(params.itemId), await readActionName(request)))),

  http.get(`${base}/communications/templates`, ({ request }) => denied(request, "communications.templates.manage") ?? HttpResponse.json(communicationsPage("templates"))),
  http.post(`${base}/communications/templates`, async ({ request }) => denied(request, "communications.templates.manage") ?? HttpResponse.json(action("TPL-1003", await readActionName(request)))),
  http.post(`${base}/communications/templates/:templateId/actions`, async ({ request, params }) => denied(request, "communications.templates.manage") ?? HttpResponse.json(action(String(params.templateId), await readActionName(request)))),

  http.get(`${base}/notifications/overview`, ({ request }) => denied(request, "notifications.overview.read") ?? HttpResponse.json(communicationsOverview("notifications"))),
  http.post(`${base}/notifications/audience-preview`, async ({ request }) => {
    const permissionError = denied(request, "notifications.audience.preview");
    if (permissionError) return permissionError;
    const parsed = audiencePreviewRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return HttpResponse.json(safeError(422, "validation_error", "Invalid audience preview"), { status: 422 });
    return HttpResponse.json({ previewId: "90000000-0000-4000-8000-000000000001", audienceVersion: "mock-v1", eligible: 1280, excluded: 120, optedOut: 84, expiresAt: "2026-07-29T12:15:00+03:00" });
  }),
  http.get(`${base}/notifications/campaigns`, ({ request }) => denied(request, "notifications.campaigns.read") ?? HttpResponse.json(communicationsPage("campaigns"))),
  http.post(`${base}/notifications/campaigns`, async ({ request }) => denied(request, "notifications.campaigns.manage") ?? HttpResponse.json(action("CMP-1002", await readActionName(request)))),
  http.get(`${base}/notifications/campaigns/:campaignId`, ({ request, params }) => denied(request, "notifications.campaigns.read") ?? detail(String(params.campaignId))),
  http.post(`${base}/notifications/campaigns/:campaignId/actions`, async ({ request, params }) => denied(request, "notifications.campaigns.manage") ?? HttpResponse.json(action(String(params.campaignId), await readActionName(request)))),
  http.get(`${base}/notifications/transactional`, ({ request }) => denied(request, "templates.transactional.read") ?? HttpResponse.json(communicationsPage("transactional"))),
  http.get(`${base}/notifications/delivery-logs`, ({ request }) => denied(request, "notifications.delivery.read") ?? HttpResponse.json(communicationsPage("delivery"))),
];
