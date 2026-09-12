"use client";

import { useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState, PageHeader } from "@/components/admin/ui";
import { getActionLabel, getStatusLabel } from "@/core/localization/display-labels";
import { useLocale } from "@/core/localization/provider";
import { formatDate } from "@/lib/admin-utils";
import {
  useDeletionRequest,
  useExportRequest,
  useRetentionPolicy,
  useSecurityAction,
  useSecurityList,
} from "./hooks";
import { securityRepository } from "./repository";
import type { DeletionWorkflowRequest, ExportRequestDetail, RetentionPolicyDetail } from "./contracts";

const privacyCopy = {
  ar: {
    exportTitle: "طلبات تصدير البيانات",
    exportDescription: "سير عمل تصدير للبيانات الوصفية فقط. لا يتم إنتاج أرشيف أو URL أو رمز أو Blob أو تنزيل ملف.",
    exportList: "قائمة طلبات التصدير",
    metadataRequests: "طلبات بيانات وصفية فقط",
    exportCaption: "قائمة طلبات تصدير البيانات",
    request: "الطلب",
    customer: "العميل",
    datasets: "مجموعات البيانات",
    status: "الحالة",
    file: "الملف",
    availability: "الإتاحة",
    noDownloadableUrl: "لا يوجد URL قابل للتنزيل",
    exportRequest: "طلب تصدير",
    exportMetadata: "بيانات وصفية لطلب التصدير",
    exportDetailDescription: "تسميات النطاق وبيانات الملف الوصفية فقط؛ بدون محتوى بيانات عميل.",
    fileMetadata: "بيانات الملف الوصفية",
    sensitiveExportNote: "المرحلة 7 لا تنشئ رابطا أو object URL أو data URL أو Blob أو أرشيفا أو بيانات عميل مخزنة في المتصفح.",
    simulateDownload: "محاكاة التنزيل",
    deletionTitle: "طلبات حذف الحساب",
    deletionDescription: "حالة سير الحذف فقط، بدون عرض محتوى بيانات العميل.",
    customerNotExposed: "بيانات العميل غير معروضة عبر هذه الواجهة البرمجية",
    requestedAt: "تاريخ الطلب",
    coolingOffEndsAt: "تنتهي مهلة التراجع",
    completedAt: "تاريخ الإكمال",
    noChecklist: "لا تعرض هذه الواجهة البرمجية بيانات قائمة التحقق",
    legalHold: "الحجز القانوني",
    checklistItemsResolved: "عناصر قائمة تحقق محلولة",
    checklist: "قائمة التحقق",
    preservedEvidence: "دليل تدقيق محفوظ",
    confirmDeletion: "تأكيد إجراء سير الحذف",
    deletionConsequence: "يحدّث حالة طلب الحذف في الباك؛ التنفيذ الفعلي يتم بواسطة عامل الحذف بعد انتهاء مهلة التراجع.",
    retentionTitle: "سياسات الاحتفاظ",
    retentionDescription: "فترات احتفاظ mock محدودة. تنفيذ التنظيف يخص خلفية مستقبلية.",
    days: "أيام",
    bounds: "الحدود",
    effectiveCleanup: "التنظيف الفعال",
    legalHoldSuspends: "الحجز القانوني يعلق التنظيف",
    retentionPolicy: "سياسة الاحتفاظ",
    retentionHelp: "تحديث أيام mock داخل حدود العقد مع إقرار واضح بالأثر.",
    retentionDays: "أيام الاحتفاظ",
    updatePolicy: "تحديث السياسة",
    confirmRetention: "تأكيد تحديث الاحتفاظ",
    retentionConsequence: "يحدث سياسة mock حتمية فقط؛ بلا تنظيف أو تعديل تخزين أو قائمة انتظار أو مهام.",
  },
  en: {
    exportTitle: "Data Export Requests",
    exportDescription: "Metadata-only export workflow. No archive content, URL, token, Blob, or file download is produced.",
    exportList: "Export request list",
    metadataRequests: "metadata-only requests",
    exportCaption: "Data export request list",
    request: "Request",
    customer: "Customer",
    datasets: "Datasets",
    status: "Status",
    file: "File",
    availability: "Availability",
    noDownloadableUrl: "No downloadable URL",
    exportRequest: "Export Request",
    exportMetadata: "Export request metadata",
    exportDetailDescription: "Scope labels and file metadata only; no customer data contents.",
    fileMetadata: "File metadata",
    sensitiveExportNote: "Phase 7 never creates a link, object URL, data URL, Blob, archive, or browser-stored customer data.",
    simulateDownload: "Simulate Download",
    deletionTitle: "Account Deletion Requests",
    deletionDescription: "Deletion workflow status only; customer data contents are not exposed.",
    customerNotExposed: "Customer details are not exposed by this API",
    requestedAt: "Requested",
    coolingOffEndsAt: "Cooling-off ends",
    completedAt: "Completed",
    noChecklist: "No checklist data is exposed by this API",
    legalHold: "legal hold",
    checklistItemsResolved: "checklist items resolved",
    checklist: "Checklist",
    preservedEvidence: "preserved audit evidence",
    confirmDeletion: "Confirm deletion workflow action",
    deletionConsequence: "Updates the backend deletion request; the deletion worker executes it after the cooling-off period.",
    retentionTitle: "Retention Policies",
    retentionDescription: "Bounded mock retention periods. Cleanup execution belongs to a future backend.",
    days: "days",
    bounds: "bounds",
    effectiveCleanup: "Effective cleanup",
    legalHoldSuspends: "legal hold suspends cleanup",
    retentionPolicy: "Retention Policy",
    retentionHelp: "Update mock days inside contract bounds with explicit impact acknowledgement.",
    retentionDays: "Retention days",
    updatePolicy: "Update Policy",
    confirmRetention: "Confirm retention update",
    retentionConsequence: "Updates deterministic mock policy only; no cleanup, storage mutation, queue, or job runs.",
  },
} as const;

function stateLabel(locale: "ar" | "en", value: string) {
  return getStatusLabel(locale, value.toLowerCase().replace(/\s+/g, "_"));
}

function Id({ value }: { value: string }) {
  return <bdi className="ltr">{value}</bdi>;
}

function Badge({ value, tone = "neutral" }: { value: string; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{value}</span>;
}

function exportTone(state: string): "success" | "warning" | "danger" | "info" | "neutral" {
  return state === "Ready" ? "success" : state === "Failed" || state === "Expired" || state === "Cancelled" ? "danger" : state === "Processing" || state === "Validating" ? "warning" : "info";
}

function defaultContext(state: string, revision: number) {
  return {
    expectedState: state,
    expectedRevision: revision,
    reason: "Phase 7 mock privacy review",
    confirmationToken: "CONFIRM-SPEC-008" as const,
  };
}

function Card({ children }: { children: React.ReactNode }) {
  return <article className="mobile-data-card">{children}</article>;
}

export function ExportRequestsRoute() {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const query = useSecurityList("exports", { page: 1, pageSize: 25 });
  return (
    <div className="page">
      <PageHeader title={copy.exportTitle} description={copy.exportDescription} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState /> : (
        <section className="table-card ops-table-card" aria-labelledby="exports-title">
          <div className="card-heading ops-card-heading"><div><h2 id="exports-title">{copy.exportList}</h2><p>{query.data.pagination.totalItems} {copy.metadataRequests}</p></div></div>
          <ExportTable requests={query.data.items as ExportRequestDetail[]} />
        </section>
      )}
    </div>
  );
}

function ExportTable({ requests }: { requests: ExportRequestDetail[] }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  return (
    <>
      <div className="desktop-table">
        <table className="data-table ops-data-table">
          <caption>{copy.exportCaption}</caption>
          <thead><tr><th>{copy.request}</th><th>{copy.customer}</th><th>{copy.datasets}</th><th>{copy.status}</th><th>{copy.file}</th><th>{copy.availability}</th></tr></thead>
          <tbody>{requests.map((request) => (
            <tr key={request.id}>
              <td><LinkId id={request.id} /></td>
              <td>{request.customer.label}</td>
              <td>{request.scopes.join(", ")}</td>
              <td><Badge value={stateLabel(locale, request.state)} tone={exportTone(request.state)} /></td>
              <td>{request.file ? <Id value={request.file.basename} /> : "-"}</td>
              <td><Badge value={stateLabel(locale, request.file?.state ?? "no file")} tone={request.file?.state === "ready" ? "success" : "neutral"} /><small>{copy.noDownloadableUrl}</small></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobile-cards ops-mobile-cards">{requests.map((request) => <ExportCard key={request.id} request={request} />)}</div>
    </>
  );
}

function LinkId({ id }: { id: string }) {
  return <a href={`/admin/data-requests/exports/${id}`}><Id value={id} /></a>;
}

function ExportCard({ request }: { request: ExportRequestDetail }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  return (
    <Card>
      <div className="mobile-data-head"><LinkId id={request.id} /><Badge value={stateLabel(locale, request.state)} tone={exportTone(request.state)} /></div>
      <strong>{request.customer.label}</strong>
      <p>{request.scopes.join(" · ")}</p>
      {request.file && <small><Id value={request.file.basename} /> · {stateLabel(locale, request.file.state)} · {copy.noDownloadableUrl}</small>}
    </Card>
  );
}

function ExportSummary({ request }: { request: ExportRequestDetail }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  return (
    <div className="export-detail-grid">
      <div className="export-detail-main">
        <div className="mobile-data-head"><Id value={request.id} /><Badge value={stateLabel(locale, request.state)} tone={exportTone(request.state)} /></div>
        <strong>{request.customer.label}</strong>
        <p>{request.scopes.join(" · ")}</p>
      </div>
      <div className="export-detail-file">
        <small>{copy.fileMetadata}</small>
        <strong>{request.file ? <Id value={request.file.basename} /> : stateLabel(locale, "no file")}</strong>
        <span>{request.file ? `${stateLabel(locale, request.file.state)} · ${copy.noDownloadableUrl}` : copy.noDownloadableUrl}</span>
      </div>
    </div>
  );
}

export function ExportDetailRoute({ requestId }: { requestId: string }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const request = useExportRequest(requestId);
  const mutation = useSecurityAction();
  const [message, setMessage] = useState("");
  if (request.isPending) return <div className="page"><LoadingState /></div>;
  if (request.isError) return <div className="page"><ErrorState /></div>;
  const data = request.data;
  return (
    <div className="page">
      <PageHeader title={`${copy.exportRequest} ${data.id}`} description={copy.exportDetailDescription} />
      <section className="table-card export-detail-card" aria-label={copy.exportMetadata}>
        <ExportSummary request={data} />
        <div className="export-detail-footer">
          <div>
            {message && <p role="status">{message}</p>}
            <p className="privacy-note">{copy.sensitiveExportNote}</p>
          </div>
          {data.state === "Ready" && <button className="button primary" onClick={() => mutation.mutate({
            resource: "exports",
            id: data.id,
            action: "simulate-download",
            run: () => securityRepository.simulateExportDownload(data.id, { expectedRevision: data.revision }),
          }, { onSuccess: (value) => setMessage(String((value as { message: string }).message)) })}>{copy.simulateDownload}</button>}
        </div>
      </section>
    </div>
  );
}

export function DeletionRequestsRoute() {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const query = useSecurityList("deletions", { page: 1, pageSize: 25 });
  return (
    <div className="page">
      <PageHeader title={copy.deletionTitle} description={copy.deletionDescription} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState /> : (
        <div className="phase7-cards">
          {(query.data.items as DeletionWorkflowRequest[]).map((request) => <DeletionCard key={request.id} request={request} />)}
        </div>
      )}
    </div>
  );
}

function DeletionCard({ request }: { request: DeletionWorkflowRequest }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  return (
    <Card>
      <div className="mobile-data-head"><a href={`/admin/data-requests/deletions/${request.id}`}><Id value={request.id} /></a><span>{stateLabel(locale, request.state)}</span></div>
      <strong>{request.customer?.label ?? copy.customerNotExposed}</strong>
      {request.subscriptionStatus && request.legalHold !== null && (
        <p>{stateLabel(locale, request.subscriptionStatus)} · {copy.legalHold} {request.legalHold ? getStatusLabel(locale, "active") : getStatusLabel(locale, "clear")}</p>
      )}
      <p><span>{copy.requestedAt}: <time dateTime={request.requestedAt}>{formatDate(request.requestedAt, true)}</time></span>{request.coolingOffEndsAt && <> · <span>{copy.coolingOffEndsAt}: <time dateTime={request.coolingOffEndsAt}>{formatDate(request.coolingOffEndsAt, true)}</time></span></>}{request.completedAt && <> · <span>{copy.completedAt}: <time dateTime={request.completedAt}>{formatDate(request.completedAt, true)}</time></span></>}</p>
      <small>{request.checklist.length > 0
        ? `${request.checklist.filter((item) => item.state === "completed" || item.state === "preserved").length}/${request.checklist.length} ${copy.checklistItemsResolved}`
        : copy.noChecklist}</small>
    </Card>
  );
}

export function DeletionDetailRoute({ requestId }: { requestId: string }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const request = useDeletionRequest(requestId);
  const mutation = useSecurityAction();
  const [open, setOpen] = useState(false);
  if (request.isPending) return <div className="page"><LoadingState /></div>;
  if (request.isError) return <div className="page"><ErrorState /></div>;
  const data = request.data;
  const action = data.allowedActions[0];
  return (
    <div className="page">
      <PageHeader title={`Deletion Request ${data.id}`} description="Checklist and blockers only; no underlying customer payloads." />
      <DeletionCard request={data} />
      {data.checklist.length > 0 && <section className="table-card">
        <h2>{copy.checklist}</h2>
        <ul>{data.checklist.map((item) => <li key={item.category}>{item.category}: {stateLabel(locale, item.state)}{item.preserved ? ` · ${copy.preservedEvidence}` : ""}</li>)}</ul>
      </section>}
      {action && <button className="button primary" onClick={() => setOpen(true)}>{getActionLabel(locale, action)}</button>}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "deletions",
          id: data.id,
          action,
          run: () => securityRepository.actOnDeletionRequest(data.id, { action, context: defaultContext(data.state, data.revision) }),
        }, { onSuccess: () => setOpen(false) })}
        title={copy.confirmDeletion}
        scope={data.id}
        consequence={copy.deletionConsequence}
        permission="data_requests.deletions.manage"
        auditEvent="account_deletion.updated"
        pending={mutation.isPending}
        outcomes={{ success: "updated", failure: "failed", conflict: "conflict" }}
      />
    </div>
  );
}

export function RetentionPoliciesRoute() {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const query = useSecurityList("retention", { page: 1, pageSize: 25 });
  return (
    <div className="page">
      <PageHeader title={copy.retentionTitle} description={copy.retentionDescription} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState /> : (
        <div className="phase7-cards">
          {(query.data.items as RetentionPolicyDetail[]).map((policy) => <RetentionCard key={policy.id} policy={policy} />)}
        </div>
      )}
    </div>
  );
}

function RetentionCard({ policy }: { policy: RetentionPolicyDetail }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  return (
    <Card>
      <div className="mobile-data-head"><a href={`/admin/data-requests/retention?policy=${policy.id}`}><Id value={policy.id} /></a><span>{stateLabel(locale, policy.state)}</span></div>
      <strong>{policy.dataCategory}</strong>
      <p>{policy.retentionDays} {copy.days} · {copy.bounds} {policy.minimumDays}-{policy.maximumDays}</p>
      <small>{copy.effectiveCleanup}: {stateLabel(locale, policy.effectiveCleanupState)}{policy.legalHold ? ` · ${copy.legalHoldSuspends}` : ""}</small>
    </Card>
  );
}

export function RetentionDetailRoute({ policyId = "RET-1001" }: { policyId?: string }) {
  const { locale } = useLocale();
  const copy = privacyCopy[locale];
  const policy = useRetentionPolicy(policyId);
  const mutation = useSecurityAction();
  const [days, setDays] = useState(400);
  const [open, setOpen] = useState(false);
  if (policy.isPending) return <div className="page"><LoadingState /></div>;
  if (policy.isError) return <div className="page"><ErrorState /></div>;
  const data = policy.data;
  return (
    <div className="page">
      <section className="table-card">
        <h2>{copy.retentionPolicy} {data.id}</h2>
        <p>{copy.retentionHelp}</p>
      </section>
      <RetentionCard policy={data} />
      <label>{copy.retentionDays}<input type="number" min={data.minimumDays} max={data.maximumDays} step={1} value={days} onChange={(event) => setDays(Number(event.target.value))} /></label>
      <button className="button primary" onClick={() => setOpen(true)}>{copy.updatePolicy}</button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "retention",
          id: data.id,
          action: "update",
          run: () => securityRepository.updateRetentionPolicy(data.id, {
            retentionDays: days,
            reason: "Phase 7 retention review",
            impactAcknowledged: true,
            expectedRevision: data.revision,
            confirmationToken: "CONFIRM-SPEC-008",
          }),
        }, { onSuccess: () => setOpen(false) })}
        title={copy.confirmRetention}
        scope={data.id}
        consequence={copy.retentionConsequence}
        permission="data_retention.manage"
        auditEvent="retention_policy.updated"
        pending={mutation.isPending}
        outcomes={{ success: "updated", failure: "failed", conflict: "conflict" }}
      />
    </div>
  );
}
