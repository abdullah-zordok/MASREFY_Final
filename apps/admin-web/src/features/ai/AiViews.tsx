"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ConfirmDialog, PageHeader } from "@/components/admin/ui";
import type {
  AiOperationalActionRequest,
  AiModelSummary,
  AiListQuery,
  AiOperationalRecord,
  AiOperationalResource,
  AiPromptDetail,
  AiProviderDetail,
  AiProviderSummary,
} from "./contracts";
import { safeAiIdSchema } from "./contracts";
import { useAiLockedAction, useAiModels, useAiOperational, useAiPrompt, useAiProvider, useAiProviders } from "./hooks";
import { aiRepository } from "./repository";

const operationalHeadings: Record<AiOperationalResource, string> = {
  prompts: "إصدارات المطالبات",
  usage: "استخدام الذكاء الاصطناعي",
  failures: "إخفاقات الذكاء الاصطناعي",
  reports: "تقارير الاستجابات",
  "safety-rules": "قواعد السلامة",
};

const aiFeatures: NonNullable<AiListQuery["feature"]>[] = [
  "receipt_analysis", "screenshot_analysis", "voice_parsing", "categorization",
  "financial_assistant", "spending_insights", "budget_suggestions",
  "behavior_analysis", "report_explanation",
];

export function AiProviderListView({ providers, filters, pagination }: { providers: AiProviderSummary[]; filters?: ReactNode; pagination?: ReactNode }) {
  return (
    <div className="page">
      <div className="page-header-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
        <PageHeader title="مزودو الذكاء الاصطناعي" description="إدارة وتتبع مزودي خدمات الذكاء الاصطناعي وتحليل أداء وصحة الخدمات." />
        {filters && <div className="toolbar-filters">{filters}</div>}
      </div>
      {providers.length === 0 && <div className="state-box" role="status">لا يوجد مزودون مطابقون.</div>}
      <div className="table-card">
        <div className="desktop-table">
          <table className="data-table">
            <thead>
              <tr><th>المعرف</th><th>المزود</th><th>الصحة</th><th>زمن الاستجابة</th><th>التكلفة التقديرية</th></tr>
            </thead>
            <tbody>
              {providers.map((provider) => (
                <tr key={provider.id}>
                  <td><bdi className="ltr">{provider.id}</bdi></td>
                  <td><Link href={`/admin/ai/providers/${provider.id}`}>{provider.name}</Link></td>
                  <td>{"health" in provider ? provider.health : "cost-only"}</td>
                  <td>{"latencyMs" in provider ? `${provider.latencyMs} ms` : "—"}</td>
                  <td>{"estimatedCost" in provider ? `${provider.estimatedCost.amount} ${provider.estimatedCost.currency}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-cards" aria-label="مزودو الذكاء الاصطناعي">
          {providers.map((provider) => (
            <article className="mobile-data-card" key={provider.id}>
              <div className="mobile-data-head">
                <bdi className="ltr">{provider.id}</bdi>
                <span className="badge severity-info">{"health" in provider ? provider.health : "cost-only"}</span>
              </div>
              <strong>{provider.name}</strong>
              <div className="mobile-data-meta">
                <span><small>زمن الاستجابة</small>{"latencyMs" in provider ? `${provider.latencyMs} ms` : "—"}</span>
                <span><small>التكلفة التقديرية</small>{"estimatedCost" in provider ? `${provider.estimatedCost.amount} ${provider.estimatedCost.currency}` : "—"}</span>
              </div>
            </article>
          ))}
        </div>
        {pagination}
      </div>
    </div>
  );
}

export function AiProviderDetailView({ provider, actions }: { provider: AiProviderDetail; actions?: ReactNode }) {
  return (
    <div className="page">
      <h1 tabIndex={-1}>{provider.name}</h1>
      {provider.accessLevel === "full" ? <><p>feature/locale fallback</p>
      <ul>
        {provider.fallbackRoutes.map((route) => (
          <li key={`${route.feature}:${route.locale}:${route.priority}`}>
            {route.feature} {route.locale} {route.providerId} {route.modelId}
          </li>
        ))}
      </ul></> : <p>{provider.accessLevel === "context" ? "عرض حالة المزود فقط." : "عرض التكلفة الإجمالية فقط."}</p>}
      {actions}
    </div>
  );
}

export function AiModelListView({ models, actions, filters, pagination }: { models: AiModelSummary[]; actions?: ReactNode; filters?: ReactNode; pagination?: ReactNode }) {
  return (
    <div className="page">
      <div className="page-header-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
        <PageHeader title="AI Models" description="Manage AI models and configure their feature assignments." />
        {filters && <div className="toolbar-filters">{filters}</div>}
      </div>
      {models.length === 0 && <div className="state-box" role="status">لا توجد نماذج مطابقة.</div>}
      <ul>
        {models.map((model) => (
          <li key={model.id}>
            {model.id} {model.name} {model.accessLevel === "full" ? model.assignments.map((assignment) => assignment.feature).join(", ") : "cost-only"} {model.inputCost.currency}
          </li>
        ))}
      </ul>
      {actions}
      {pagination}
    </div>
  );
}

export function AiProviderListRoute() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const providers = useAiProviders({ search: search || undefined, status: status || undefined, page, pageSize: 25 });
  if (providers.isPending) return <div className="page"><div className="state-box">Loading AI providers...</div></div>;
  if (providers.isError) return <div className="page"><div className="state-box error" role="alert">تعذر تحميل المزودين.<button className="button" onClick={() => providers.refetch()}>إعادة المحاولة</button></div></div>;
  return <AiProviderListView providers={providers.data.items} filters={<><label>بحث المزودين<input className="input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={120} /></label><label>حالة المزود<input className="input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} maxLength={40} /></label></>} pagination={<ListPagination page={page} totalPages={providers.data.pagination.totalPages} onPage={setPage} />} />;
}

export function AiProviderDetailRoute({ providerId }: { providerId: string }) {
  const provider = useAiProvider(providerId);
  if (provider.isPending) return <div className="page"><div className="state-box">Loading AI provider...</div></div>;
  if (provider.isError) return <div className="page"><div className="state-box error" role="alert">تعذر تحميل المزود.<button className="button" onClick={() => provider.refetch()}>إعادة المحاولة</button></div></div>;
  const data = provider.data;
  if (data.accessLevel !== "full") return <AiProviderDetailView provider={data} />;
  return <AiProviderDetailView provider={data} actions={<ConfigurationActions>{data.actions.map((action) => <ProviderActionButton key={action} provider={data} action={action} />)}</ConfigurationActions>} />;
}

export function AiModelListRoute() {
  const [search, setSearch] = useState("");
  const [providerId, setProviderId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const models = useAiModels({
    search: search || undefined,
    providerId: safeAiIdSchema.safeParse(providerId).success ? providerId : undefined,
    status: status || undefined,
    page,
    pageSize: 25,
  });
  if (models.isPending) return <div className="page"><div className="state-box">Loading AI models...</div></div>;
  if (models.isError) return <div className="page"><div className="state-box error" role="alert">تعذر تحميل النماذج.<button className="button" onClick={() => models.refetch()}>إعادة المحاولة</button></div></div>;
  return <AiModelListView models={models.data.items} filters={<><label>بحث النماذج<input className="input" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={120} /></label><label>معرف المزود<input className="input ltr" value={providerId} onChange={(event) => { setProviderId(event.target.value); setPage(1); }} maxLength={48} /></label><label>حالة النموذج<input className="input" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} maxLength={40} /></label></>} pagination={<ListPagination page={page} totalPages={models.data.pagination.totalPages} onPage={setPage} />} actions={<ConfigurationActions>{models.data.items.filter((model) => model.accessLevel === "full").map((model) => model.actions.map((action) => <AiActionButton key={`${model.id}:${action}`} resource="models" record={model} action={action} />))}</ConfigurationActions>} />;
}

function ListPagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (page: number) => void }) {
  return (
    <nav className="pagination" aria-label="ترقيم الصفحات">
      <button className="button" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))}>السابق</button>
      <span>الصفحة {page} من {Math.max(1, totalPages)}</span>
      <button className="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>التالي</button>
    </nav>
  );
}

export function AiOperationalListView({
  resource,
  records,
  filters,
}: {
  resource: AiOperationalResource;
  records: AiOperationalRecord[];
  filters?: ReactNode;
}) {
  return (
    <div className="page">
      <h1 tabIndex={-1}>{operationalHeadings[resource]}</h1>
      <p className="privacy-note">بيانات وصفية آمنة فقط — لا تُعرض مطالبات أو استجابات خام.</p>
      {filters}
      {records.length === 0 ? (
        <div className="state-box" role="status">لا توجد سجلات مطابقة.</div>
      ) : (
        <div className="table-card">
          <div className="desktop-table">
            <table className="data-table">
              <thead><tr><th>المعرّف</th><th>العنوان</th><th>الميزة</th><th>الحالة</th><th>التفاصيل الآمنة</th><th>آخر تحديث</th></tr></thead>
              <tbody>{records.map((record) => (
                <tr key={record.id}>
                  <td><bdi className="ltr">{record.id}</bdi></td>
                  <td>{resource === "prompts" ? <Link href={`/admin/ai/prompts/${record.id}`}>{record.title}</Link> : record.title}</td>
                  <td>{record.feature}</td>
                  <td>{record.status}{record.severity ? ` — ${record.severity}` : ""}</td>
                  <td><OperationalDetails record={record} /></td>
                  <td><bdi className="ltr">{record.updatedAt}</bdi></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {records.map((record) => (
              <article className="mobile-data-card" key={record.id}>
                <div className="mobile-data-head"><bdi className="ltr">{record.id}</bdi><span>{record.status}</span></div>
                <strong>{record.title}</strong>
                <p>{record.feature}{record.severity ? ` — ${record.severity}` : ""}</p>
                <OperationalDetails record={record} />
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OperationalDetails({ record }: { record: AiOperationalRecord }) {
  return (
    <span>
      {record.maskedUser && <>المستخدم <bdi>{record.maskedUser}</bdi> · </>}
      {record.providerId && <>المزود <bdi>{record.providerId}</bdi> · </>}
      {record.modelId && <>النموذج <bdi>{record.modelId}</bdi> · </>}
      {record.attemptCount !== undefined && <>المحاولات {record.attemptCount} · البدائل {record.fallbackCount ?? 0} · </>}
      {record.inputUnits !== undefined && <>الوحدات {record.inputUnits}/{record.outputUnits ?? 0} · </>}
      {record.estimatedCost && <>{record.estimatedCost.amount} <bdi>{record.estimatedCost.currency}</bdi> · </>}
      {record.safeErrorClass && <>{record.safeErrorClass} · <bdi>{record.correlationReference}</bdi></>}
      {record.sanitizedExcerpt && <><q>{record.sanitizedExcerpt}</q> — {record.omissionLabel}</>}
      {record.triggerCount !== undefined && <>مرات التشغيل {record.triggerCount} · الإصدار <bdi>{record.version}</bdi></>}
      {record.safetyDefinition && <> · {record.safetyDefinition.conditions[0]?.field} {record.safetyDefinition.conditions[0]?.operator} · {record.safetyDefinition.outcome}</>}
    </span>
  );
}

function ProviderActionButton({
  provider,
  action,
}: {
  provider: Extract<AiProviderDetail, { accessLevel: "full" }>;
  action: "activate" | "deactivate" | "update_fallback";
}) {
  const mutation = useAiLockedAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>{action}</button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "providers",
          id: provider.id,
          action,
          run: () => aiRepository.actOnProvider(provider.id, {
            action,
            fallbackRoutes: action === "update_fallback"
              ? provider.fallbackRoutes
                  .map((route) => ({ ...route, priority: provider.fallbackRoutes.length + 1 - route.priority }))
                  .sort((left, right) => left.priority - right.priority)
              : undefined,
            context: {
              reason,
              expectedState: provider.health,
              expectedRevision: provider.revision,
            },
          }),
        }, { onSuccess: () => setOpen(false) })}
        title={`تأكيد ${action}`}
        scope={provider.id}
        consequence="يطبّق التغيير على إعدادات المزود ويرفضه الخادم إذا أضعف مسارًا نشطًا."
        permission="ai.providers.manage"
        auditEvent="admin.ai.provider.action"
        pending={mutation.isPending}
        confirmDisabled={reason.trim().length < 3}
        outcomes={{ success: "تم التسجيل", failure: "تعذر التسجيل", conflict: "تغيرت الحالة" }}
      >
        <label>سبب القرار<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>
      </ConfirmDialog>
      {mutation.isError && <p role="alert">تعذر تسجيل القرار. حدّث البيانات وتحقق من الأهلية ثم أعد المحاولة.</p>}
    </>
  );
}

function ConfigurationActions({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="configuration-actions">{children}</div>
      <p className="mobile-configuration-notice" role="note">
        تتطلب تغييرات الإعدادات شاشة بعرض أكبر. تبقى بيانات المراقبة متاحة هنا.
      </p>
    </>
  );
}

function AiActionButton({
  resource,
  record,
  action,
}: {
  resource: Exclude<AiOperationalResource, "usage"> | "models";
  record: Pick<AiOperationalRecord, "id" | "status" | "revision"> | Extract<AiModelSummary, { accessLevel: "full" }>;
  action: AiOperationalActionRequest["action"];
}) {
  const mutation = useAiLockedAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const permission = resource === "models" ? "ai.models.manage" : `ai.${resource === "safety-rules" ? "safety" : resource}.manage`;
  const request: AiOperationalActionRequest = {
    action,
    context: {
      reason,
      expectedState: record.status,
      expectedRevision: record.revision,
    },
  };
  return (
    <>
      <button className="button" type="button" onClick={() => setOpen(true)}>{action}</button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource,
          id: record.id,
          action,
          run: () => resource === "models"
            ? aiRepository.actOnModel(record.id, request)
            : aiRepository.actOnOperational(resource, record.id, request),
        }, { onSuccess: () => {
          setOpen(false);
          requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector<HTMLElement>("main h1")?.focus()));
        } })}
        title={`تأكيد ${action}`}
        scope={record.id}
        consequence="يطبّق التغيير على إعدادات الذكاء الاصطناعي ويسجله في سجل التدقيق."
        permission={permission}
        auditEvent={`admin.ai.${resource}.action`}
        pending={mutation.isPending}
        confirmDisabled={reason.trim().length < 3}
        outcomes={{ success: "تم التسجيل", failure: "تعذر التسجيل", conflict: "تغيرت الحالة" }}
      >
        <label>سبب القرار<input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} required /></label>
      </ConfirmDialog>
      {mutation.isError && <p role="alert">تعذر تسجيل القرار. حدّث البيانات وتحقق من الأهلية ثم أعد المحاولة.</p>}
    </>
  );
}

export function AiPromptDetailView({ prompt }: { prompt: AiPromptDetail }) {
  return (
    <div className="page">
      <h1 tabIndex={-1}>{prompt.title}</h1>
      <p className="privacy-note">معاينة خيالية منقحة، معروضة كنص عادي فقط.</p>
      <section className="table-card" aria-labelledby="prompt-preview">
        <h2 id="prompt-preview">المعاينة المنقحة</h2>
        <pre className="json-preview">{prompt.sanitizedPreview}</pre>
      </section>
      <section className="table-card">
        <h2>المتغيرات وقواعد التحقق</h2>
        <ul>{prompt.variables.map((variable) => <li key={variable}><bdi className="ltr">{variable}</bdi></li>)}</ul>
        <ul>{prompt.validationRules.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </section>
      <section className="table-card">
        <h2>الاختبارات الخيالية والسجل الثابت</h2>
        <ul>{prompt.fictionalTests.map((item) => <li key={item.name}>{item.name}: {item.passed ? "ناجح" : "فاشل"}</li>)}</ul>
        <ol>{prompt.history.map((item) => <li key={item.version}>الإصدار <bdi>{item.version}</bdi> — {item.status} — ثابت</li>)}</ol>
      </section>
    </div>
  );
}

export function AiOperationalListRoute({ resource }: { resource: AiOperationalResource }) {
  const [search, setSearch] = useState("");
  const [platform, setPlatform] = useState<"all" | "ios" | "android" | "unknown">("all");
  const [status, setStatus] = useState("");
  const [feature, setFeature] = useState<AiListQuery["feature"]>();
  const [providerId, setProviderId] = useState("");
  const [modelId, setModelId] = useState("");
  const [plan, setPlan] = useState<AiListQuery["plan"]>();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      setSearch(params.get("search") ?? "");
      const savedPlatform = params.get("platform");
      if (["all", "ios", "android", "unknown"].includes(savedPlatform ?? "")) {
        setPlatform(savedPlatform as typeof platform);
      }
      setStatus(params.get("status") ?? "");
      const savedFeature = params.get("feature");
      if (aiFeatures.includes(savedFeature as NonNullable<AiListQuery["feature"]>)) {
        setFeature(savedFeature as NonNullable<AiListQuery["feature"]>);
      }
      setProviderId(params.get("providerId") ?? "");
      setModelId(params.get("modelId") ?? "");
      const savedPlan = params.get("plan");
      if (["free", "basic", "premium"].includes(savedPlan ?? "")) {
        setPlan(savedPlan as NonNullable<AiListQuery["plan"]>);
      }
      setDateFrom(params.get("dateFrom") ?? "");
      setDateTo(params.get("dateTo") ?? "");
      setPage(Math.max(1, Number(params.get("page")) || 1));
      setUrlReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    if (!urlReady) return;
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (platform !== "all") params.set("platform", platform);
    if (status) params.set("status", status);
    if (feature) params.set("feature", feature);
    if (providerId) params.set("providerId", providerId);
    if (modelId) params.set("modelId", modelId);
    if (plan) params.set("plan", plan);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (page > 1) params.set("page", String(page));
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
  }, [dateFrom, dateTo, feature, modelId, page, plan, platform, providerId, search, status, urlReady]);
  const records = useAiOperational(resource, {
    page,
    pageSize: 25,
    search: search || undefined,
    platform,
    status: status || undefined,
    feature,
    providerId: safeAiIdSchema.safeParse(providerId).success ? providerId : undefined,
    modelId: safeAiIdSchema.safeParse(modelId).success ? modelId : undefined,
    plan,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    sort: "updatedAt",
    order: "desc",
  });
  if (records.isPending) return <div className="page"><div className="state-box" role="status">جارٍ التحميل...</div></div>;
  if (records.isError) return <div className="page"><div className="state-box error" role="alert">تعذر تحميل البيانات.<button className="button" onClick={() => records.refetch()}>إعادة المحاولة</button></div></div>;
  return (
    <>
      <AiOperationalListView
        resource={resource}
        records={records.data.items}
        filters={(
          <div className="filter-bar" aria-label="عوامل تصفية الذكاء الاصطناعي">
            <label>بحث<input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} maxLength={120} /></label>
            <label>المنصة<select value={platform} onChange={(event) => { setPlatform(event.target.value as typeof platform); setPage(1); }}>
              <option value="all">كل المنصات</option><option value="ios">iOS</option><option value="android">Android</option><option value="unknown">غير منسوب</option>
            </select></label>
            <label>الحالة<input value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} maxLength={40} /></label>
            <label>الميزة<select value={feature ?? ""} onChange={(event) => { setFeature((event.target.value || undefined) as AiListQuery["feature"]); setPage(1); }}>
              <option value="">كل الميزات</option>{aiFeatures.map((item) => <option key={item} value={item}>{item}</option>)}
            </select></label>
            <label>المزود<input className="ltr" value={providerId} onChange={(event) => { setProviderId(event.target.value); setPage(1); }} maxLength={48} /></label>
            <label>النموذج<input className="ltr" value={modelId} onChange={(event) => { setModelId(event.target.value); setPage(1); }} maxLength={48} /></label>
            {resource === "usage" && <label>الخطة<select value={plan ?? ""} onChange={(event) => { setPlan((event.target.value || undefined) as AiListQuery["plan"]); setPage(1); }}>
              <option value="">كل الخطط</option><option value="free">free</option><option value="basic">basic</option><option value="premium">premium</option>
            </select></label>}
            <label>من تاريخ<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} /></label>
            <label>إلى تاريخ<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} /></label>
          </div>
        )}
      />
      {records.data.region.availability === "partial" && <p className="state-box state-warning" role="status">{records.data.region.message}</p>}
      <ListPagination page={records.data.pagination.page} totalPages={records.data.pagination.totalPages} onPage={setPage} />
      {resource !== "usage" && (
        <ConfigurationActions>
          {records.data.items.map((record) => record.actions.map((action) => (
            <AiActionButton
              key={`${record.id}:${action}`}
              resource={resource}
              record={record}
              action={action as AiOperationalActionRequest["action"]}
            />
          )))}
        </ConfigurationActions>
      )}
    </>
  );
}

export function AiPromptDetailRoute({ promptId }: { promptId: string }) {
  const prompt = useAiPrompt(promptId);
  if (prompt.isPending) return <div className="page"><div className="state-box" role="status">جارٍ التحميل...</div></div>;
  if (prompt.isError) return <div className="page"><div className="state-box error" role="alert">تعذر تحميل إصدار المطالبة.<button className="button" onClick={() => prompt.refetch()}>إعادة المحاولة</button></div></div>;
  return <AiPromptDetailView prompt={prompt.data} />;
}
