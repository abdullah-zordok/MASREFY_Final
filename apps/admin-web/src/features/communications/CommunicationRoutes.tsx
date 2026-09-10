"use client";

import Link from "next/link";
import { useState } from "react";
import { MetricCard, PageHeader, RegionState } from "@/components/admin/ui";
import { getStatusLabel } from "@/core/localization/display-labels";
import { useLocale } from "@/core/localization/provider";
import type {
  CommunicationDetail,
  CommunicationOverview,
  CommunicationPage,
  CommunicationRecord,
} from "./contracts";
import {
  useAbuseReports,
  useAudiencePreview,
  useCampaignAction,
  useCampaignDetail,
  useCampaigns,
  useContent,
  useContentAction,
  useContentItem,
  useDeliveryLogs,
  useFeedback,
  useFeedbackAction,
  useFeedbackDetail,
  useNotificationOverview,
  useSupportCategories,
  useSupportOverview,
  useSupportTicketDetail,
  useSupportTickets,
  useTemplates,
  useTicketAction,
  useTransactionalTemplates,
} from "./hooks";
import {
  OperationalFilters,
  type OperationalFilterState,
} from "./shared/OperationalFilters";
import { SafeText } from "./shared/SafeText";

type QueryLike<T> = {
  data?: T;
  isPending: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
};

const copy = {
  ar: {
    aggregateOnly: "إجمالي فقط",
    audiencePreview: "معاينة الجمهور",
    bytes: "بايت",
    campaignNewDescription: "إعداد حملة مع معاينة آمنة للجمهور قبل الحفظ.",
    campaigns: "الحملات",
    campaignsDescription: "إدارة دورة حياة الحملات وإجراءاتها المعتمدة.",
    deliveryLogs: "سجلات التسليم",
    deliveryLogsDescription:
      "تشخيصات تسليم مقنعة فقط؛ بدون رمز أو عنوان أو حمولة أو نص رسالة.",
    detail: "التفاصيل",
    detailDescription: "تفاصيل تشغيلية آمنة للخصوصية.",
    eligible: "مؤهل",
    id: "المعرف",
    locale: "اللغة",
    newCampaign: "حملة جديدة",
    openTickets: "فتح التذاكر",
    optedOut: "اختار الخروج",
    platform: "المنصة",
    privacyNotice:
      "عرض آمن للخصوصية: لا توجد مرفقات خام أو عناوين أو حمولات مزود أو قيم مالية.",
    reviewCampaign: "مراجعة الحملة المجدولة",
    revision: "المراجعة",
    safeReference: "مرجع آمن",
    scope: "النطاق",
    state: "الحالة",
    supportTickets: "تذاكر الدعم",
    supportTicketsDescription: "فرز التذاكر مع سياق عميل مقنع.",
    title: "العنوان",
    updated: "آخر تحديث",
  },
  en: {
    aggregateOnly: "aggregate only",
    audiencePreview: "Audience preview",
    bytes: "bytes",
    campaignNewDescription:
      "Prepare a campaign with a safe audience preview before saving.",
    campaigns: "Campaigns",
    campaignsDescription: "Manage the approved campaign lifecycle and actions.",
    deliveryLogs: "Delivery logs",
    deliveryLogsDescription:
      "Masked delivery diagnostics only; no token, address, payload, or message body.",
    detail: "Detail",
    detailDescription: "Privacy-safe operational detail.",
    eligible: "Eligible",
    id: "ID",
    locale: "Locale",
    newCampaign: "New campaign",
    openTickets: "Open tickets",
    optedOut: "opted out",
    platform: "Platform",
    privacyNotice:
      "Privacy-safe projection: no raw attachment bytes, addresses, provider payloads, or financial values.",
    reviewCampaign: "Review scheduled campaign",
    revision: "Revision",
    safeReference: "Safe reference",
    scope: "Scope",
    state: "State",
    supportTickets: "Support tickets",
    supportTicketsDescription: "Triage tickets with masked customer context.",
    title: "Title",
    updated: "Updated",
  },
} as const;

const contentLabels = {
  ar: {
    categories: "التصنيفات الافتراضية",
    tips: "نصائح مالية",
    faqs: "الأسئلة الشائعة",
    onboarding: "التهيئة",
    "help-center": "مركز المساعدة",
    announcements: "الإعلانات",
  },
  en: {
    categories: "Default categories",
    tips: "Financial tips",
    faqs: "FAQs",
    onboarding: "Onboarding",
    "help-center": "Help center",
    announcements: "Announcements",
  },
} as const;

function PageState<T>({
  query,
  permission,
  children,
}: {
  query: QueryLike<T>;
  permission: string;
  children: (data: T) => React.ReactNode;
}) {
  return (
    <RegionState
      isPending={query.isPending}
      isError={query.isError}
      error={query.error ? { code: query.error.message } : undefined}
      region={
        "region" in (query.data ?? {})
          ? (query.data as { region?: CommunicationPage["region"] }).region
          : undefined
      }
      permission={permission}
      onRetry={query.refetch}
    >
      {query.data ? children(query.data) : null}
    </RegionState>
  );
}

function RecordTable({
  items,
  detailBase,
}: {
  items: CommunicationRecord[];
  detailBase?: string;
}) {
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <div className="table-card">
      <div className="desktop-table">
        <table className="data-table">
          <thead>
            <tr>
              <th>{c.id}</th>
              <th>{c.title}</th>
              <th>{c.state}</th>
              <th>{c.scope}</th>
              <th>{c.safeReference}</th>
              <th>{c.updated}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <td>
                  <bdi className="ltr">{item.id}</bdi>
                </td>
                <td>
                  {detailBase ? (
                    <Link href={`${detailBase}/${item.id}`}>
                      <SafeText text={item.title} />
                    </Link>
                  ) : (
                    <SafeText text={item.title} />
                  )}
                </td>
                <td>
                  <span className={`badge status-${item.state}`}>
                    {getStatusLabel(locale, item.state)}
                  </span>
                </td>
                <td>
                  {item.platform} · {item.locale}
                </td>
                <td>
                  {item.maskedReference
                    ? `${item.maskedReference.id} · ${item.maskedReference.safeContext}`
                    : "aggregate only"}
                </td>
                <td>
                  <bdi className="ltr">{item.updatedAt ?? "—"}</bdi>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mobile-cards">
        {items.map((item) => (
          <article className="mobile-data-card" key={item.id}>
            <div className="mobile-data-head">
              <bdi className="ltr">{item.id}</bdi>
              <span>{getStatusLabel(locale, item.state)}</span>
            </div>
            <strong>
              <SafeText text={item.title} />
            </strong>
            {item.subtitle && (
              <p>
                <SafeText text={item.subtitle} />
              </p>
            )}
            <small>
              {item.platform} · {item.locale}
            </small>
          </article>
        ))}
      </div>
    </div>
  );
}

function Detail({
  item,
  action,
}: {
  item: CommunicationDetail;
  action?: React.ReactNode;
}) {
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <div className="page">
      <PageHeader
        eyebrow={item.id}
        title={item.title}
        description={item.subtitle ?? c.detailDescription}
        actions={action}
      />
      <div className="privacy-notice">{c.privacyNotice}</div>
      <section className="table-card" aria-label={c.detail}>
        <p>
          <SafeText text={item.body} />
        </p>
        <dl className="detail-grid">
          <div>
            <dt>{c.state}</dt>
            <dd>{getStatusLabel(locale, item.state)}</dd>
          </div>
          <div>
            <dt>{c.revision}</dt>
            <dd>{item.revision}</dd>
          </div>
          <div>
            <dt>{c.platform}</dt>
            <dd>{item.platform}</dd>
          </div>
          <div>
            <dt>{c.locale}</dt>
            <dd>{item.locale}</dd>
          </div>
        </dl>
        {item.attachments.length > 0 && (
          <ul>
            {item.attachments.map((attachment) => (
              <li key={attachment.id}>
                {attachment.filename} · {attachment.mediaType} ·{" "}
                {attachment.declaredSizeBytes} bytes
              </li>
            ))}
          </ul>
        )}
        {item.auditTrail.map((audit) => (
          <p className="ltr" key={audit.reference}>
            {audit.reference} · {audit.action} · {audit.at}
          </p>
        ))}
      </section>
    </div>
  );
}

function ListShell({
  title,
  description,
  query,
  permission,
  detailBase,
}: {
  title: string;
  description: string;
  query: QueryLike<CommunicationPage>;
  permission: string;
  detailBase?: string;
}) {
  const { locale } = useLocale();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<OperationalFilterState>({
    search: "",
    platform: "all",
  });
  return (
    <div className="page">
      <PageHeader title={title} description={description} />
      <OperationalFilters
        filters={filters}
        labels={{
          search: locale === "ar" ? "بحث" : "Search",
          platform: copy[locale].platform,
          status: copy[locale].state,
        }}
        onChange={(nextFilters) => {
          setFilters({
            search: nextFilters.search ?? "",
            platform: nextFilters.platform ?? "all",
          });
          setSearch(nextFilters.search ?? "");
        }}
      />
      <PageState query={query} permission={permission}>
        {(page) => (
          <RecordTable
            items={page.items.filter((item) =>
              item.title.toLowerCase().includes(search.toLowerCase()),
            )}
            detailBase={detailBase}
          />
        )}
      </PageState>
    </div>
  );
}

export function SupportOverviewRoute() {
  const query = useSupportOverview({});
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <div className="page">
      <PageState query={query} permission="support.overview.read">
        {(data) => (
          <>
            <PageHeader
              title={data.title}
              description={data.description}
              actions={
                <Link className="button" href="/admin/support/tickets">
                  {c.openTickets}
                </Link>
              }
            />
            <div className="metrics-grid">
              {data.metrics.map(
                (metric: CommunicationOverview["metrics"][number]) => (
                  <MetricCard
                    key={metric.key}
                    metric={{
                      label: metric.label,
                      value: String(metric.value),
                      context: metric.denominator,
                    }}
                  />
                ),
              )}
            </div>
            <RecordTable
              items={data.items}
              detailBase="/admin/support/tickets"
            />
          </>
        )}
      </PageState>
    </div>
  );
}

export function SupportTicketsRoute() {
  const query = useSupportTickets({ page: 1, pageSize: "25" });
  const { locale } = useLocale();
  const pageQuery = {
    ...query,
    data: query.data
      ? {
          ...query.data,
          items: query.data.tickets,
          region: { availability: "available" as const },
        }
      : undefined,
  };
  return (
    <ListShell
      title={copy[locale].supportTickets}
      description={copy[locale].supportTicketsDescription}
      query={pageQuery}
      permission="support.tickets.read"
      detailBase="/admin/support/tickets"
    />
  );
}

export function SupportTicketDetailRoute({ ticketId }: { ticketId: string }) {
  const query = useSupportTicketDetail(ticketId);
  const mutation = useTicketAction();
  const { locale } = useLocale();
  return (
    <PageState query={query} permission="support.tickets.read">
      {(item) => (
        <Detail
          item={item}
          action={
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  ticketId,
                  action: {
                    action: "resolve",
                    expectedVersion: item.revision,
                    reason: "Resolved by support administrator",
                  },
                })
              }
            >
              {locale === "ar" ? "حل التذكرة" : "Resolve"}
            </button>
          }
        />
      )}
    </PageState>
  );
}

export function SupportCategoriesRoute() {
  const { locale } = useLocale();
  return (
    <ListShell
      title={locale === "ar" ? "تصنيفات الدعم" : "Support categories"}
      description={
        locale === "ar"
          ? "إدارة تصنيفات التوجيه وبدائل الإيقاف."
          : "Manage routing categories and retirement replacements."
      }
      query={useSupportCategories({})}
      permission="support.categories.manage"
      detailBase="/admin/support/categories"
    />
  );
}

export function FeedbackRoute() {
  const { locale } = useLocale();
  return (
    <ListShell
      title={locale === "ar" ? "نظرة عامة على الملاحظات" : "Feedback overview"}
      description={
        locale === "ar"
          ? "تصنيف الملاحظات وربطها بسجلات تشغيلية آمنة."
          : "Classify feedback and link it to safe operational records."
      }
      query={useFeedback({})}
      permission="feedback.read"
      detailBase="/admin/feedback"
    />
  );
}

export function FeedbackDetailRoute({ feedbackId }: { feedbackId: string }) {
  const query = useFeedbackDetail(feedbackId);
  const mutation = useFeedbackAction();
  const { locale } = useLocale();
  return (
    <PageState query={query} permission="feedback.read">
      {(item) => (
        <Detail
          item={item}
          action={
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  resourceId: feedbackId,
                  action: {
                    action: "review",
                    expectedVersion: item.revision,
                    reason: "Accepted for product review",
                  },
                })
              }
            >
              {locale === "ar" ? "مراجعة الملاحظة" : "Review feedback"}
            </button>
          }
        />
      )}
    </PageState>
  );
}

export function AbuseReportsRoute() {
  const { locale } = useLocale();
  return (
    <ListShell
      title={locale === "ar" ? "بلاغات الإساءة" : "Abuse reports"}
      description={
        locale === "ar"
          ? "ملخصات آمنة ومقيدة لمسؤول الأمن والمسؤول الأعلى."
          : "Restricted safe summaries for Security Administrator and Super Admin roles."
      }
      query={useAbuseReports({})}
      permission="feedback.abuse.manage"
    />
  );
}

export function ContentRoute({ collection }: { collection: string }) {
  const { locale } = useLocale();
  return (
    <ListShell
      title={
        contentLabels[locale][
          collection as keyof (typeof contentLabels)[typeof locale]
        ] ?? collection
      }
      description={
        locale === "ar"
          ? "محتوى منظم ثنائي اللغة مع معاينة آمنة وتحكم في دورة الحياة."
          : "Bilingual structured content with safe preview and lifecycle controls."
      }
      query={useContent(collection, {})}
      permission="content.manage"
      detailBase={
        collection === "categories" ? "/admin/content/categories" : undefined
      }
    />
  );
}

export function ContentDetailRoute({
  collection,
  itemId,
}: {
  collection: string;
  itemId: string;
}) {
  const query = useContentItem(collection, itemId);
  const mutation = useContentAction(collection);
  const { locale } = useLocale();
  return (
    <PageState query={query} permission="content.manage">
      {(item) => (
        <Detail
          item={item}
          action={
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  resourceId: itemId,
                  action: {
                    action: "publish",
                    expectedVersion: item.revision,
                    reason: "Approved for immediate publication",
                  },
                })
              }
            >
              {locale === "ar" ? "نشر" : "Publish"}
            </button>
          }
        />
      )}
    </PageState>
  );
}

export function TemplateRoute({
  channel,
}: {
  channel: "email" | "push" | "transactional";
}) {
  const templates = useTemplates({ channel }, channel !== "transactional");
  const transactional = useTransactionalTemplates(
    {},
    channel === "transactional",
  );
  const query = channel === "transactional" ? transactional : templates;
  const { locale } = useLocale();
  return (
    <ListShell
      title={
        channel === "email"
          ? locale === "ar"
            ? "قوالب البريد"
            : "Email templates"
          : channel === "push"
            ? locale === "ar"
              ? "قوالب الإشعارات"
              : "Push templates"
            : locale === "ar"
              ? "القوالب التشغيلية"
              : "Transactional templates"
      }
      description={
        locale === "ar"
          ? "معاينة القوالب بقوائم متغيرات مسموحة وإجراءات دورة حياة آمنة."
          : "Preview templates with placeholder allowlists and safe lifecycle actions."
      }
      query={query}
      permission={
        channel === "transactional"
          ? "notifications.read"
          : "communications.templates.manage"
      }
    />
  );
}

export function NotificationsOverviewRoute() {
  const query = useNotificationOverview({});
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <div className="page">
      <PageState query={query} permission="notifications.read">
        {(data) => (
          <>
            <PageHeader
              title={data.title}
              description={data.description}
              actions={
                <Link
                  className="button"
                  href="/admin/notifications/campaigns/new"
                >
                  {c.newCampaign}
                </Link>
              }
            />
            <div className="metrics-grid">
              {data.metrics.map(
                (metric: CommunicationOverview["metrics"][number]) => (
                  <MetricCard
                    key={metric.key}
                    metric={{
                      label: metric.label,
                      value: String(metric.value),
                      context: metric.denominator,
                    }}
                  />
                ),
              )}
            </div>
            <RecordTable
              items={data.items}
              detailBase="/admin/notifications/campaigns"
            />
          </>
        )}
      </PageState>
    </div>
  );
}

export function CampaignsRoute() {
  const { locale } = useLocale();
  return (
    <ListShell
      title={copy[locale].campaigns}
      description={copy[locale].campaignsDescription}
      query={useCampaigns({})}
      permission="notifications.campaigns.manage"
      detailBase="/admin/notifications/campaigns"
    />
  );
}

export function CampaignDetailRoute({ campaignId }: { campaignId: string }) {
  const query = useCampaignDetail(campaignId);
  const mutation = useCampaignAction();
  const { locale } = useLocale();
  return (
    <PageState query={query} permission="notifications.campaigns.manage">
      {(item) => (
        <Detail
          item={item}
          action={
            <button
              className="button primary"
              disabled={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  resourceId: campaignId,
                  action: {
                    action: "approve",
                    expectedVersion: item.revision,
                    reason: "Campaign reviewed and approved",
                  },
                })
              }
            >
              {locale === "ar" ? "اعتماد" : "Approve"}
            </button>
          }
        />
      )}
    </PageState>
  );
}

export function CampaignNewRoute() {
  const preview = useAudiencePreview({
    channel: "push",
    platform: "all",
    locale: "both",
  });
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <div className="page">
      <PageHeader
        title={c.newCampaign}
        description={c.campaignNewDescription}
      />
      <PageState query={preview} permission="notifications.audience.preview">
        {(data) => (
          <section className="table-card" aria-label={c.audiencePreview}>
            <h2>{c.audiencePreview}</h2>
            <p>
              {c.eligible}: {data.eligibleCount}; {c.optedOut}:{" "}
              {data.optedOutCount}; excluded: {data.excludedCount}
            </p>
            <Link
              className="button primary"
              href="/admin/notifications/campaigns/CMP-1001"
            >
              {c.reviewCampaign}
            </Link>
          </section>
        )}
      </PageState>
    </div>
  );
}

export function DeliveryLogsRoute() {
  const { locale } = useLocale();
  return (
    <ListShell
      title={copy[locale].deliveryLogs}
      description={copy[locale].deliveryLogsDescription}
      query={useDeliveryLogs({})}
      permission="notifications.read"
    />
  );
}
