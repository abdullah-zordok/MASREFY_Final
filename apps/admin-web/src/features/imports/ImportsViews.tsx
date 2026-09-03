"use client";

import Link from "next/link";
import { FilterX, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocale } from "@/core/localization/provider";
import { ConfirmDialog, PageHeader, RegionState } from "@/components/admin/ui";
import { importsCopy } from "./importsCopy";
import { operationalCopy } from "./operationalCopy";
import { ApiError } from "@/core/api/errors";
import { useSimulatedRole } from "@/core/auth/use-simulated-role";
import type { PermissionKey } from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import { formatAdminNumber, formatDate } from "@/lib/admin-utils";
import {
  type ImportSessionDetail,
  type ImportSource,
  type OperationalRecord,
  type Phase4ActionRequest,
  type Phase4Resource,
  type PlatformScope,
} from "./contracts";
import {
  useImportOverview,
  usePhase4Action,
  usePhase4Detail,
  usePhase4List,
} from "./hooks";

interface ResourceCopy {
  title: string;
  description: string;
  permission: PermissionKey;
}

export const resourceCopy: Record<Phase4Resource, ResourceCopy> = {
  sessions: {
    title: "جلسات الاستيراد",
    description: "متابعة الجلسات المنقحة حسب المنصة والمصدر والحالة.",
    permission: "imports.read",
  },
  failures: {
    title: "عمليات الاستيراد الفاشلة",
    description: "معالجة حالات الفشل دون عرض المحتوى المستورد الخام.",
    permission: "imports.failures.manage",
  },
  "low-confidence": {
    title: "الاستيرادات منخفضة الثقة",
    description: "مراجعة اقتراحات الخادم ضمن النتائج المسموح بها فقط.",
    permission: "imports.confidence.manage",
  },
  duplicates: {
    title: "مرشحو التكرار",
    description: "مقارنة ملخصات منقحة مع الحفاظ على دلالات الحدث الأصلي.",
    permission: "imports.duplicates.manage",
  },
  unsupported: {
    title: "التنسيقات غير المدعومة",
    description: "توجيه الحالات غير المدعومة دون كشف الرسائل أو الملفات الخام.",
    permission: "imports.unsupported.manage",
  },
  banks: {
    title: "البنوك المدعومة",
    description: "مراقبة تغطية المصادر والمرسلين وقواعد التحليل.",
    permission: "parsers.coverage.read",
  },
  senders: {
    title: "إدارة المرسلين",
    description: "إدارة أنماط مرسلين محدودة وآمنة ضمن المحاكاة.",
    permission: "parsers.senders.manage",
  },
  "parser-rules": {
    title: "قواعد المحلل",
    description: "قواعد تعريفية محدودة دون تشغيل شيفرة أو اتصالات شبكة.",
    permission: "parsers.rules.read",
  },
  "test-cases": {
    title: "حالات اختبار المحلل",
    description: "عينات محلية خيالية فقط لا ترتبط ببيانات العملاء.",
    permission: "parsers.tests.run",
  },
  versions: {
    title: "إصدارات المحلل",
    description: "دورة إصدار ثابتة وتاريخ غير قابل للتعديل.",
    permission: "parsers.versions.manage",
  },
  "merchant-rules": {
    title: "قواعد التجار",
    description: "توحيد أسماء تجريبية وحدود أسماء بديلة واضحة.",
    permission: "parsers.merchants.manage",
  },
  "category-rules": {
    title: "قواعد التصنيف",
    description: "أنماط آمنة وثقة ونطاقات محددة للمحاكاة.",
    permission: "parsers.categories.manage",
  },
};

const actionPermissions: Record<Phase4Resource, PermissionKey> = {
  sessions: "imports.failures.manage",
  failures: "imports.failures.manage",
  "low-confidence": "imports.confidence.manage",
  duplicates: "imports.duplicates.manage",
  unsupported: "imports.unsupported.manage",
  banks: "parsers.coverage.read",
  senders: "parsers.senders.manage",
  "parser-rules": "parsers.rules.manage",
  "test-cases": "parsers.tests.run",
  versions: "parsers.versions.manage",
  "merchant-rules": "parsers.merchants.manage",
  "category-rules": "parsers.categories.manage",
};

function detailHref(record: OperationalRecord): string | null {
  if (record.kind === "sessions") return `/admin/imports/sessions/${record.id}`;
  if (record.kind === "banks") return `/admin/parsers/banks/${record.id}`;
  if (record.kind === "parser-rules")
    return `/admin/parsers/rules/${record.id}`;
  return null;
}

function errorCode(error: unknown): { code?: string } | undefined {
  return error instanceof ApiError ? { code: error.code } : undefined;
}

export function RecordRows({ records }: { records: OperationalRecord[] }) {
  return records.map((record) => {
    const href = detailHref(record);
    return (
      <tr key={record.id}>
        <td className="ltr">
          {href ? <Link href={href}>{record.id}</Link> : record.id}
        </td>
        <td>
          <strong>{record.title}</strong>
          <small>{record.secondary}</small>
        </td>
        <td>
          <span className="badge severity-info">{record.status}</span>
        </td>
        <td>{record.platform ?? "—"}</td>
        <td>
          {record.source ?? record.bank ?? "—"}
          {record.version ? ` · ${record.version}` : ""}
          {record.appVersion ? ` · ${record.appVersion}` : ""}
        </td>
        <td className="numbers">
          {record.confidence === undefined
            ? "—"
            : `${Math.round(record.confidence * 100)}%`}
        </td>
        <td>
          <time dateTime={record.updatedAt}>
            {formatDate(record.updatedAt, true)}
          </time>
        </td>
      </tr>
    );
  });
}

export function RecordCards({
  records,
  copy,
}: {
  records: OperationalRecord[];
  copy: {
    mobileLabels: {
      results: string;
      platform: string;
      source: string;
      pattern: string;
    };
  };
}) {
  return (
    <div className="mobile-cards" aria-label={copy.mobileLabels.results}>
      {records.map((record) => {
        const href = detailHref(record);
        return (
          <article className="mobile-data-card" key={record.id}>
            <div className="mobile-data-head">
              {href ? (
                <Link className="ltr" href={href}>
                  {record.id}
                </Link>
              ) : (
                <bdi className="ltr">{record.id}</bdi>
              )}
              <span className="badge severity-info">{record.status}</span>
            </div>
            <strong>{record.title}</strong>
            <p>{record.secondary}</p>
            <div className="mobile-data-meta">
              <span>
                <small>{copy.mobileLabels.platform}</small>
                {record.platform ?? "—"}
              </span>
              <span>
                <small>{copy.mobileLabels.source}</small>
                {record.source ?? record.bank ?? "—"}
                {record.version ? ` · ${record.version}` : ""}
              </span>
              {record.pattern && (
                <span>
                  <small>{copy.mobileLabels.pattern}</small>
                  <bdi className="ltr">{record.pattern}</bdi>
                </span>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function OperationalListView({
  resource,
}: {
  resource: Phase4Resource;
}) {
  const { locale } = useLocale();
  const copy = operationalCopy[locale];
  const resCopy = copy.resources[resource];
  const role = useSimulatedRole();
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<PlatformScope>("all");
  const [source, setSource] = useState<ImportSource | "">("");
  const [status, setStatus] = useState("");
  const [bankId, setBankId] = useState("");
  const [parserVersionId, setParserVersionId] = useState("");
  const [appVersion, setAppVersion] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<
    "updatedAt" | "id" | "status" | "source" | "bank" | "version" | "appVersion"
  >("updatedAt");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25);
  const [reason, setReason] = useState(copy.actions.defaultReason as string);
  const [selected, setSelected] = useState<{
    record: OperationalRecord;
    action: Phase4ActionRequest["action"];
  } | null>(null);
  const [notice, setNotice] = useState("");
  const query = usePhase4List(resource, {
    search: search || undefined,
    platform,
    source: source || undefined,
    status: status || undefined,
    bankId: bankId || undefined,
    parserVersionId: parserVersionId || undefined,
    appVersion: appVersion || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort,
    order,
    page,
    pageSize,
  });
  const mutation = usePhase4Action();
  const records = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const availableActions = useMemo(() => {
    const supportedActions = new Set(Object.keys(copy.actionLabels));
    return records.flatMap((record) =>
      record.actions
        .filter((action): action is Phase4ActionRequest["action"] =>
          supportedActions.has(action),
        )
        .map((action) => ({ record, action })),
    );
  }, [copy.actionLabels, records]);

  return (
    <div className="page">
      <PageHeader
        eyebrow={copy.eyebrow}
        title={resCopy.title}
        description={resCopy.description}
      />
      {notice && (
        <p className="privacy-notice" role="status">
          {notice}
        </p>
      )}
      {mutation.isError && (
        <p className="state-box error" role="alert">
          {copy.errorMutation}
        </p>
      )}
      <div className="toolbar parsers-toolbar">
        <div className="toolbar-filters">
          <label className="search-input">
            <Search size={17} />
            <span className="sr-only">{copy.searchAria}</span>
            <input
              className="input"
              maxLength={120}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchPlaceholder}
              value={search}
            />
          </label>
          <select
            aria-label={copy.platformAria}
            className="select"
            onChange={(event) => {
              setPlatform(event.target.value as PlatformScope);
              setPage(1);
            }}
            value={platform}
          >
            <option value="all">{copy.allPlatforms}</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
          <select
            aria-label={copy.sourceAria}
            className="select"
            onChange={(event) => {
              setSource(event.target.value as ImportSource | "");
              setPage(1);
            }}
            value={source}
          >
            <option value="">{copy.allSources}</option>
            <option value="android_sms">Android SMS</option>
            <option value="android_notification">Android Notification</option>
            <option value="ios_shortcut">iOS Shortcut</option>
            <option value="screenshot">Screenshot</option>
            <option value="receipt">Receipt</option>
            <option value="pdf_statement">PDF</option>
          </select>
          <input
            aria-label={copy.statusAria}
            className="input compact-input"
            maxLength={40}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            placeholder={copy.statusPlaceholder}
            value={status}
          />
          <input
            aria-label={copy.bankIdAria}
            className="input compact-input ltr"
            maxLength={48}
            onChange={(event) => {
              setBankId(event.target.value);
              setPage(1);
            }}
            placeholder="BNK-001"
            value={bankId}
          />
          <input
            aria-label={copy.parserVersionAria}
            className="input compact-input ltr"
            maxLength={48}
            onChange={(event) => {
              setParserVersionId(event.target.value);
              setPage(1);
            }}
            placeholder="PV-3182"
            value={parserVersionId}
          />
          <input
            aria-label={copy.appVersionAria}
            className="input compact-input ltr"
            maxLength={48}
            onChange={(event) => {
              setAppVersion(event.target.value);
              setPage(1);
            }}
            placeholder="4.8.1"
            value={appVersion}
          />
          <input
            aria-label={copy.dateFromAria}
            className="input compact-input ltr"
            onChange={(event) => {
              setDateFrom(event.target.value);
              setPage(1);
            }}
            type="date"
            value={dateFrom}
          />
          <input
            aria-label={copy.dateToAria}
            className="input compact-input ltr"
            onChange={(event) => {
              setDateTo(event.target.value);
              setPage(1);
            }}
            type="date"
            value={dateTo}
          />
          <select
            aria-label={copy.sortAria}
            className="select"
            onChange={(event) => setSort(event.target.value as typeof sort)}
            value={sort}
          >
            <option value="updatedAt">{copy.sort.updatedAt}</option>
            <option value="id">{copy.sort.id}</option>
            <option value="status">{copy.sort.status}</option>
            <option value="source">{copy.sort.source}</option>
            <option value="bank">{copy.sort.bank}</option>
            <option value="version">{copy.sort.version}</option>
            <option value="appVersion">{copy.sort.appVersion}</option>
          </select>
          <select
            aria-label={copy.sortDirAria}
            className="select"
            onChange={(event) => setOrder(event.target.value as "asc" | "desc")}
            value={order}
          >
            <option value="desc">{copy.order.desc}</option>
            <option value="asc">{copy.order.asc}</option>
          </select>
          <select
            aria-label={copy.pageSizeAria}
            className="select"
            onChange={(event) => {
              setPageSize(Number(event.target.value) as 25 | 50 | 100);
              setPage(1);
            }}
            value={pageSize}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          {(search ||
            platform !== "all" ||
            source ||
            status ||
            bankId ||
            parserVersionId ||
            appVersion ||
            dateFrom ||
            dateTo ||
            sort !== "updatedAt" ||
            order !== "desc" ||
            page !== 1 ||
            pageSize !== 25) && (
            <button
              className="button ghost"
              onClick={() => {
                setSearch("");
                setPlatform("all");
                setSource("");
                setStatus("");
                setBankId("");
                setParserVersionId("");
                setAppVersion("");
                setDateFrom("");
                setDateTo("");
                setSort("updatedAt");
                setOrder("desc");
                setPage(1);
                setPageSize(25);
              }}
              type="button"
            >
              <FilterX size={16} /> {copy.clear}
            </button>
          )}
        </div>
      </div>
      <RegionState
        emptyLabel={copy.emptyState}
        error={errorCode(query.error)}
        isError={query.isError}
        isPending={query.isPending}
        onRetry={() => query.refetch()}
        permission={resCopy.permission}
        region={query.data?.region}
      >
        <div className="table-card parsers-table-card">
          <div className="parsers-pagination" aria-label={copy.paginationAria}>
            <div className="parsers-pagination-info">
              <div className="parsers-pagination-item">
                <small>{copy.page}</small>
                <strong className="numbers">
                  {query.data?.page ?? page} / {query.data?.totalPages ?? 0}
                </strong>
              </div>
              <div className="parsers-pagination-item">
                <small>{copy.total}</small>
                <strong className="numbers">
                  {query.data?.totalItems ?? 0}
                </strong>
              </div>
            </div>
            <div className="parsers-pagination-controls">
              <button
                className="button ghost"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                type="button"
              >
                {copy.previous}
              </button>
              <button
                className="button ghost"
                disabled={
                  query.isFetching || page >= (query.data?.totalPages ?? 0)
                }
                onClick={() => setPage((current) => current + 1)}
                type="button"
              >
                {copy.next}
              </button>
            </div>
          </div>
          <div className="desktop-table">
            <table className="data-table parsers-data-table">
              <thead>
                <tr>
                  <th>{copy.columns.identifier}</th>
                  <th>{copy.columns.record}</th>
                  <th>{copy.columns.status}</th>
                  <th>{copy.columns.platform}</th>
                  <th>{copy.columns.source}</th>
                  <th>{copy.columns.confidence}</th>
                  <th>{copy.columns.updated}</th>
                </tr>
              </thead>
              <tbody>
                <RecordRows records={records} />
              </tbody>
            </table>
          </div>
          <RecordCards records={records} copy={copy} />
        </div>
      </RegionState>
      {availableActions.length > 0 && (
        <section className="card" aria-labelledby={`${resource}-actions`}>
          <div className="card-heading">
            <div>
              <h2 id={`${resource}-actions`}>{copy.actions.sectionTitle}</h2>
              <p>{copy.actions.sectionDescription}</p>
            </div>
          </div>
          <label>
            {copy.actions.reasonLabel}
            <textarea
              className="input"
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              value={reason}
            />
          </label>
          <div className="dialog-actions">
            {availableActions.map(({ record, action }) => (
              <button
                className="button"
                disabled={
                  !hasPermission(role, actionPermissions[resource]) ||
                  mutation.isPending
                }
                key={`${record.id}:${action}`}
                onClick={() => setSelected({ record, action })}
                type="button"
              >
                {copy.actionLabels[action]} ·{" "}
                <bdi className="ltr">{record.id}</bdi>
              </button>
            ))}
          </div>
        </section>
      )}
      <ConfirmDialog
        auditEvent={
          selected
            ? `admin.${resource}.${selected.action}`
            : `admin.${resource}.action`
        }
        consequence={copy.actions.confirmConsequence}
        onClose={() => setSelected(null)}
        onConfirm={() => {
          if (!selected) return;
          mutation.mutate(
            {
              resource,
              id: selected.record.id,
              request: {
                action: selected.action,
                expectedState: selected.record.status,
                expectedRevision: selected.record.revision,
                reason,
              },
            },
            {
              onSuccess: (response) => {
                setNotice(
                  `${response.message} ${copy.actions.auditRef}: ${response.auditReference.eventId}`,
                );
                setSelected(null);
              },
            },
          );
        }}
        open={Boolean(selected)}
        outcomes={{
          success: copy.actions.confirmSuccess,
          failure: copy.actions.confirmFailure,
          conflict: copy.actions.confirmConflict,
        }}
        pending={mutation.isPending}
        permission={actionPermissions[resource]}
        scope={selected?.record.id ?? resource}
        title={
          selected
            ? copy.actionLabels[selected.action]
            : copy.actions.confirmTitle
        }
      />
    </div>
  );
}

export function ImportOverviewAnalytics() {
  const [platform, setPlatform] = useState<PlatformScope>("all");
  const { locale } = useLocale();
  const copy = importsCopy[locale];
  const overview = useImportOverview(platform);
  return (
    <section className="card" aria-labelledby="phase4-overview-title">
      <div className="card-heading">
        <div>
          <h2 id="phase4-overview-title">{copy.analytics.title}</h2>
          <p>{copy.analytics.description}</p>
        </div>
        <select
          className="select"
          aria-label={copy.analytics.platform}
          value={platform}
          onChange={(event) => setPlatform(event.target.value as PlatformScope)}
        >
          <option value="all">{copy.analytics.all}</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select>
      </div>
      <RegionState
        error={errorCode(overview.error)}
        isError={overview.isError}
        isPending={overview.isPending}
        onRetry={() => overview.refetch()}
        permission="imports.read"
        region={overview.data?.region}
      >
        {overview.data && (
          <div
            className="summary-strip"
            style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
          >
            <div className="summary-item">
              <small>{copy.analytics.uniqueCustomers}</small>
              <strong
                className="numbers"
                data-testid="unique-customers"
                data-value={overview.data.uniqueCustomers}
              >
                {formatAdminNumber(overview.data.uniqueCustomers)}
              </strong>
            </div>
            <div className="summary-item">
              <small>{copy.analytics.sessions}</small>
              <strong className="numbers">
                {formatAdminNumber(overview.data.totalSessions)}
              </strong>
            </div>
            <div className="summary-item">
              <small>{copy.analytics.failedSessions}</small>
              <strong className="numbers">
                {formatAdminNumber(overview.data.failedSessions)}
              </strong>
            </div>
            <div className="summary-item">
              <small>{copy.analytics.topFailedSource}</small>
              <strong>{overview.data.highestFailureSource}</strong>
            </div>
          </div>
        )}
      </RegionState>
    </section>
  );
}

function SessionDetailFields({ detail }: { detail: ImportSessionDetail }) {
  const { locale } = useLocale();
  const copy = operationalCopy[locale];
  return (
    <>
      <div className="detail-grid">
        <div className="detail-item">
          <small>{copy.columns.status}</small>
          <strong>{detail.status}</strong>
        </div>
        <div className="detail-item">
          <small>{locale === "ar" ? "العناصر" : "Items"}</small>
          <strong className="numbers">{detail.totalItems}</strong>
        </div>
        <div className="detail-item">
          <small>{locale === "ar" ? "الناجحة" : "Successful"}</small>
          <strong className="numbers">{detail.successfulItems}</strong>
        </div>
        <div className="detail-item">
          <small>{locale === "ar" ? "الفاشلة" : "Failed"}</small>
          <strong className="numbers">{detail.failedItems}</strong>
        </div>
      </div>
      <ol className="timeline">
        {detail.timeline.map((step) => (
          <li className="timeline-item" key={step.timestamp}>
            {step.label} · {step.status}
          </li>
        ))}
      </ol>
    </>
  );
}

export function OperationalDetailView({
  resource,
  id,
}: {
  resource: Extract<Phase4Resource, "sessions" | "banks" | "parser-rules">;
  id: string;
}) {
  const { locale } = useLocale();
  const copy = operationalCopy[locale];
  const resCopy = copy.resources[resource];
  const role = useSimulatedRole();
  const [selectedAction, setSelectedAction] = useState<
    Phase4ActionRequest["action"] | null
  >(null);
  const [reason, setReason] = useState(copy.detail.defaultReason as string);
  const [notice, setNotice] = useState("");
  const query = usePhase4Detail(resource, id);
  const mutation = usePhase4Action();
  const detail = query.data;
  const supportedActions = new Set(Object.keys(copy.actionLabels));
  const availableActions =
    detail?.actions.filter((action): action is Phase4ActionRequest["action"] =>
      supportedActions.has(action),
    ) ?? [];
  const actionPermission = actionPermissions[resource];
  return (
    <div className="page">
      <PageHeader
        eyebrow={copy.detail.eyebrow}
        title={resCopy.title}
        description={copy.detail.description}
      />
      {notice && (
        <p className="privacy-notice" role="status">
          {notice}
        </p>
      )}
      {mutation.isError && (
        <p className="state-box error" role="alert">
          {copy.detail.errorMutation}
        </p>
      )}
      <RegionState
        error={errorCode(query.error)}
        isError={query.isError}
        isPending={query.isPending}
        onRetry={() => query.refetch()}
        permission={resCopy.permission}
      >
        {detail && (
          <>
            <article className="card">
              <div className="card-heading">
                <div>
                  <h2>{detail.title}</h2>
                  <p>
                    <bdi className="ltr">{detail.id}</bdi> · {detail.secondary}
                  </p>
                </div>
                <span className="badge severity-info">{detail.status}</span>
              </div>
              {"timeline" in detail && <SessionDetailFields detail={detail} />}
              {detail.preview && (
                <div className="privacy-notice">
                  {locale === "ar" ? "معاينة منقحة" : "Sanitized preview"}:{" "}
                  {detail.preview.maskedBankSender} ·{" "}
                  {detail.preview.maskedMerchant} · {detail.preview.currency} ·{" "}
                  {locale === "ar"
                    ? "القيم المالية مخفية."
                    : "Financial values hidden."}
                </div>
              )}
              {detail.definition && (
                <>
                  <div
                    className="state-box complex-editor-mobile-note"
                    role="status"
                  >
                    {locale === "ar"
                      ? "يتطلب تحرير القواعد ومقارنة النتائج شاشة مكتبية بعرض 768 بكسل أو أكثر."
                      : "Editing rules and comparing results requires a desktop screen of 768px or wider."}
                  </div>
                  <fieldset className="complex-editor">
                    <legend>
                      {locale === "ar"
                        ? "تعريف القاعدة المحدود"
                        : "Limited rule definition"}
                    </legend>
                    <div className="detail-grid">
                      <label className="detail-item">
                        {locale === "ar" ? "اسم القاعدة" : "Rule name"}
                        <input
                          className="input"
                          maxLength={120}
                          readOnly
                          value={detail.title}
                        />
                      </label>
                      <label className="detail-item">
                        {locale === "ar" ? "المرسل" : "Sender"}
                        <input
                          className="input ltr"
                          maxLength={120}
                          readOnly
                          value={detail.definition.matches[0]?.value ?? ""}
                        />
                      </label>
                      <label className="detail-item">
                        {locale === "ar" ? "عملية المطابقة" : "Match operator"}
                        <select
                          className="select"
                          disabled
                          value={
                            detail.definition.matches[0]?.operator ?? "equals"
                          }
                        >
                          <option value="equals">equals</option>
                          <option value="contains">contains</option>
                          <option value="starts_with">starts_with</option>
                          <option value="safe_pattern">safe_pattern</option>
                        </select>
                      </label>
                      <label className="detail-item">
                        {locale === "ar" ? "الأولوية" : "Priority"}
                        <input
                          className="input numbers"
                          max={100}
                          min={1}
                          readOnly
                          type="number"
                          value={detail.priority ?? 1}
                        />
                      </label>
                      <div className="detail-item">
                        <small>
                          {locale === "ar" ? "حقول الالتقاط" : "Capture fields"}
                        </small>
                        <strong>{detail.definition.captures.length}</strong>
                      </div>
                      <div className="detail-item">
                        <small>
                          {locale === "ar"
                            ? "عمليات التطبيع"
                            : "Normalizations"}
                        </small>
                        <strong>
                          {detail.definition.normalizations.length}
                        </strong>
                      </div>
                      <div className="detail-item">
                        <small>
                          {locale === "ar"
                            ? "خرائط الإخراج"
                            : "Output mappings"}
                        </small>
                        <strong>{detail.definition.mappings.length}</strong>
                      </div>
                    </div>
                  </fieldset>
                </>
              )}
              {detail.fictionalSample && (
                <section
                  className="complex-editor"
                  aria-labelledby="fictional-preview-title"
                >
                  <h3 id="fictional-preview-title">
                    {locale === "ar"
                      ? "مقارنة اختبار خيالي"
                      : "Fictional test comparison"}
                  </h3>
                  <p className="privacy-notice">
                    {locale === "ar"
                      ? "هذه عينة محلية خيالية صريحة ولا تحتوي على بيانات عميل."
                      : "This is an explicit local fictional sample that contains no customer data."}
                  </p>
                  <div className="section-grid equal">
                    <div className="card">
                      <h4>
                        {locale === "ar"
                          ? "المتوقع المنقح"
                          : "Expected (sanitized)"}
                      </h4>
                      <pre>{detail.fictionalSample}</pre>
                    </div>
                    <div className="card">
                      <h4>
                        {locale === "ar"
                          ? "الفعلي المنقح"
                          : "Actual (sanitized)"}
                      </h4>
                      <pre>{detail.fictionalSample}</pre>
                    </div>
                  </div>
                </section>
              )}
              {availableActions.length > 0 && (
                <section
                  className="complex-editor"
                  aria-labelledby="detail-actions-title"
                >
                  <h3 id="detail-actions-title">{copy.detail.detailActions}</h3>
                  <label>
                    {copy.actions.reasonLabel}
                    <textarea
                      className="input"
                      maxLength={500}
                      onChange={(event) => setReason(event.target.value)}
                      value={reason}
                    />
                  </label>
                  <div className="dialog-actions">
                    {availableActions.map((action) => (
                      <button
                        className="button"
                        disabled={
                          !hasPermission(role, actionPermission) ||
                          mutation.isPending
                        }
                        key={action}
                        onClick={() => setSelectedAction(action)}
                        type="button"
                      >
                        {copy.actionLabels[action]}
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </article>
            <Link
              className="button"
              href={
                resource === "sessions"
                  ? "/admin/imports/sessions"
                  : resource === "banks"
                    ? "/admin/parsers/banks"
                    : "/admin/parsers/rules"
              }
            >
              {copy.detail.backToList}
            </Link>
          </>
        )}
      </RegionState>
      <ConfirmDialog
        auditEvent={
          selectedAction
            ? `admin.${resource}.${selectedAction}`
            : `admin.${resource}.action`
        }
        consequence={copy.detail.confirmConsequence}
        onClose={() => setSelectedAction(null)}
        onConfirm={() => {
          if (!detail || !selectedAction) return;
          mutation.mutate(
            {
              resource,
              id: detail.id,
              request: {
                action: selectedAction,
                expectedState: detail.status,
                expectedRevision: detail.revision,
                reason,
              },
            },
            {
              onSuccess: (response) => {
                setNotice(
                  `${response.message} ${copy.actions.auditRef}: ${response.auditReference.eventId}`,
                );
                setSelectedAction(null);
              },
            },
          );
        }}
        open={Boolean(selectedAction)}
        outcomes={{
          success: copy.actions.confirmSuccess,
          failure: copy.actions.confirmFailure,
          conflict: copy.actions.confirmConflict,
        }}
        pending={mutation.isPending}
        permission={actionPermission}
        scope={detail?.id ?? id}
        title={
          selectedAction
            ? copy.actionLabels[selectedAction]
            : copy.actions.confirmTitle
        }
      />
    </div>
  );
}
