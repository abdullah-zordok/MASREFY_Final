"use client";

import { useState } from "react";
import { AccessDeniedState, ErrorState, LoadingState, PageHeader, SuccessState } from "@/components/admin/ui";
import { mocksAllowed } from "@/core/api/client";
import { useLocale } from "@/core/localization/provider";
import type { FeatureFlag, Maintenance, SettingsGroup, SettingsGroupName } from "./contracts";
import { useFeatureFlags, useMaintenance, useSettingsGroup, useUpdateFeatureFlag, useUpdateMaintenance, useUpdateSettingsGroup } from "./hooks";

function asStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
}

const copy = {
  ar: {
    cancel: "إلغاء",
    changeReason: "سبب التغيير",
    currentValues: "القيم الحالية",
    defaultLanguage: "اللغة الافتراضية",
    description: "تحديث إعداد تشغيلي مسموح به مع النسخة المتوقعة.",
    featureFlags: "أعلام الميزات",
    featureFlagsDescription: "أعلام تجريبية بجمهور محدد؛ الأعلام المنتهية للقراءة فقط.",
    generalSettings: "الإعدادات العامة",
    generalSettingsHelp: "قيم الإعدادات العامة الحالية.",
    group: "المجموعة",
    maintenance: "الصيانة",
    maintenanceDescription: "انتقالات صيانة صريحة ومدققة فقط.",
    moveTo: "نقل إلى",
    platformName: "اسم المنصة",
    rawConfiguration: "الإعداد الخام",
    reason: "السبب",
    reasonHelp: "مطلوب لطلب تحديث الإعدادات.",
    rollout: "النشر",
    save: "حفظ الحقول المتغيرة",
    saved: "تم حفظ الإعدادات بشكل ذري.",
    supportUrl: "رابط الدعم",
    timezone: "المنطقة الزمنية",
    updateRollout: "تحديث النشر",
    version: "النسخة",
    readOnlyEnded: "العلم المنتهي للقراءة فقط",
    titles: {
      ai: "إعدادات الذكاء الاصطناعي",
      general: "إعدادات النظام",
      imports: "إعدادات الاستيراد",
      mobile: "إعدادات الجوال",
      security: "إعدادات الأمن",
      subscriptions: "إعدادات الاشتراكات",
    },
  },
  en: {
    cancel: "Cancel",
    changeReason: "Change reason",
    currentValues: "Current values",
    defaultLanguage: "Default Language",
    description: "Update one allowlisted operational setting with its expected version.",
    featureFlags: "Feature Flags",
    featureFlagsDescription: "Bounded feature flags; retired flags are read-only.",
    generalSettings: "General settings",
    generalSettingsHelp: "Current general configuration values.",
    group: "Group",
    maintenance: "Maintenance",
    maintenanceDescription: "Explicit audited maintenance transitions only.",
    moveTo: "Move to",
    platformName: "Platform Name",
    rawConfiguration: "Raw configuration",
    reason: "Reason",
    reasonHelp: "Required for the settings update request.",
    rollout: "Rollout",
    save: "Save changed fields",
    saved: "Settings saved atomically.",
    supportUrl: "Support URL",
    timezone: "Timezone",
    updateRollout: "Update rollout",
    version: "Version",
    readOnlyEnded: "Ended flag read-only",
    titles: {
      ai: "AI Settings",
      general: "System Settings",
      imports: "Import Settings",
      mobile: "Mobile Settings",
      security: "Security Settings",
      subscriptions: "Subscription Settings",
    },
  },
} as const;

function SettingsForm({
  group,
  title,
  changeKey,
  changeValue,
}: {
  group: SettingsGroupName;
  title: string;
  changeKey: string;
  changeValue: string | number | boolean | string[] | number[];
}) {
  const { locale } = useLocale();
  const c = copy[locale];
  const query = useSettingsGroup(group);
  const update = useUpdateSettingsGroup(group);
  const payload = query.data as (SettingsGroup & { operationsSetting?: boolean }) | undefined;
  const [reason, setReason] = useState("Update settings after governance review.");
  if (query.isPending) return <LoadingState />;
  if (query.isError) return asStatus(query.error) === 403 ? <AccessDeniedState permission={`settings.${group}.read`} /> : <ErrorState />;
  if (!payload) return <ErrorState />;
  if (payload.operationsSetting) {
    const bounds = { general: [30, 365], mobile: [24, 720], imports: [100, 10000], ai: [5, 5] }[group as "general" | "mobile" | "imports" | "ai"];
    const operationsValue = Number((payload.values as Record<string, unknown>).value);
    return (
      <section className="admin-page">
        <PageHeader title={title} description={c.description} />
        <dl className="settings-list">
          <div><dt>{c.version}</dt><dd className="numbers">{payload.version}</dd></div>
          <div><dt>{c.currentValues}</dt><dd><pre>{JSON.stringify(payload.values, null, 2)}</pre></dd></div>
        </dl>
        <form onSubmit={(event) => {
          event.preventDefault();
          const value = Number(new FormData(event.currentTarget).get("value"));
          update.mutate({ expectedVersion: payload.version, changes: { value }, reason, submissionKey: `SUB-OPERATIONS-${group.toUpperCase()}` });
        }}>
          <label>{c.currentValues}<input className="input numbers" name="value" type="number" min={bounds?.[0]} max={bounds?.[1]} defaultValue={operationsValue} readOnly={group === "ai"} /></label>
          <label>{c.reason}<textarea aria-label={c.changeReason} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          <button className="button primary" disabled={update.isPending}>{c.save}</button>
        </form>
        {update.isSuccess && <SuccessState message={c.saved} />}
        {update.isError && <ErrorState />}
      </section>
    );
  }
  if (payload.group === "general") {
    return (
      <section className="admin-page">
        <PageHeader title={title} description={c.description} />
        <form className="table-card settings-editor-card" onSubmit={(event) => {
          event.preventDefault();
          update.mutate({
            expectedVersion: payload.version,
            changes: { [changeKey]: changeValue },
            reason,
            submissionKey: `SUB-DEMO-SETTINGS-${group.toUpperCase()}`,
          });
        }}>
          <section className="settings-meta-strip" aria-label={c.currentValues}>
            <div><span>{c.group}</span><strong className="ltr">{payload.group}</strong></div>
            <div><span>{c.version}</span><strong className="numbers">{payload.version}</strong></div>
          </section>

          <section className="settings-editor-section" aria-labelledby="general-settings-title">
            <div className="settings-section-head">
              <h2 id="general-settings-title">{c.generalSettings}</h2>
              <p><span dir="auto">{c.generalSettingsHelp}</span></p>
            </div>
            <div className="settings-field-grid">
              <label>{c.platformName}<input className="input" aria-label={c.platformName} readOnly value={payload.values.platformName} /></label>
              <label>{c.defaultLanguage}<select className="select ltr" aria-label={c.defaultLanguage} disabled value={payload.values.defaultLocale}><option value="ar">ar</option><option value="en">en</option></select></label>
              <label>{c.timezone}<input className="input ltr" aria-label={c.timezone} readOnly value={payload.values.timezone} /></label>
              <label>{c.supportUrl}<input className="input ltr" aria-label={c.supportUrl} readOnly value={payload.values.supportUrl} /></label>
            </div>
            <details className="settings-raw-preview">
              <summary>{c.rawConfiguration}</summary>
              <pre>{JSON.stringify(payload.values, null, 2)}</pre>
            </details>
          </section>

          <section className="settings-editor-section" aria-labelledby="settings-reason-title">
            <div className="settings-section-head">
              <h2 id="settings-reason-title">{c.changeReason}</h2>
              <p><span dir="auto">{c.reasonHelp}</span></p>
            </div>
            <label>{c.reason}<textarea className="input" dir="auto" aria-label={c.changeReason} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          </section>

          <div className="settings-action-footer">
            <div>
              {update.isSuccess && <SuccessState message={c.saved} />}
              {update.isError && <ErrorState />}
            </div>
            <div className="settings-action-buttons">
              <button className="button secondary" type="button" onClick={() => setReason("Update settings after governance review.")}>{c.cancel}</button>
              <button className="button primary" disabled={update.isPending}>{c.save}</button>
            </div>
          </div>
        </form>
      </section>
    );
  }
  return (
    <section className="admin-page">
      <PageHeader title={title} description={c.description} />
      <dl className="settings-list">
        <div><dt>{c.group}</dt><dd>{payload.group}</dd></div>
        <div><dt>{c.version}</dt><dd className="numbers">{payload.version}</dd></div>
        <div><dt>{c.currentValues}</dt><dd><pre>{JSON.stringify(payload.values, null, 2)}</pre></dd></div>
      </dl>
      <form onSubmit={(event) => {
        event.preventDefault();
        update.mutate({
          expectedVersion: payload.version,
          changes: { [changeKey]: changeValue },
          reason,
          submissionKey: `SUB-DEMO-SETTINGS-${group.toUpperCase()}`,
        });
      }}>
        <label>{c.reason}<textarea aria-label={c.changeReason} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <button className="button primary" disabled={update.isPending}>{c.save}</button>
        <button className="button secondary" type="button" onClick={() => setReason("Update settings after governance review.")}>{c.cancel}</button>
      </form>
      {update.isSuccess && <SuccessState message={c.saved} />}
      {update.isError && <ErrorState />}
    </section>
  );
}

export function SettingsOverviewView() {
  const { locale } = useLocale();
  return <SettingsForm group="general" title={copy[locale].titles.general} changeKey="platformName" changeValue="Masarifi Admin Portal" />;
}

export function MobileSettingsView() {
  const { locale } = useLocale();
  return <SettingsForm group="mobile" title={copy[locale].titles.mobile} changeKey="forceUpdate" changeValue />;
}

export function ImportSettingsView() {
  const { locale } = useLocale();
  return <SettingsForm group="imports" title={copy[locale].titles.imports} changeKey="maxFileMb" changeValue={25} />;
}

export function AiSettingsView() {
  const { locale } = useLocale();
  return <SettingsForm group="ai" title={copy[locale].titles.ai} changeKey="dailyLimit" changeValue={6000} />;
}

export function SubscriptionSettingsView() {
  const { locale } = useLocale();
  if (mocksAllowed() && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true")
    return <SettingsForm group="subscriptions" title={copy[locale].titles.subscriptions} changeKey="retryDays" changeValue={[1, 4, 8]} />;
  return (
    <section className="admin-page">
      <PageHeader
        title={locale === "ar" ? "الإصدار المجاني" : "Free-only release"}
        description={locale === "ar" ? "الفوترة والاشتراكات غير متاحة في هذا الإصدار. النسخة غير متاحة." : "Billing and subscriptions are unavailable in this release. No mutable configuration is exposed."}
      />
    </section>
  );
}

export function SecuritySettingsView() {
  const { locale } = useLocale();
  if (mocksAllowed() && process.env.NEXT_PUBLIC_ENABLE_MOCKS === "true")
    return <SettingsForm group="security" title={copy[locale].titles.security} changeKey="sessionMinutes" changeValue={90} />;
  return <section className="admin-page"><PageHeader title={copy[locale].titles.security} description={locale === "ar" ? "ضوابط الأمن ليست أعلام ميزات أو إعدادات تشغيلية قابلة للتغيير في هذه النسخة." : "Security controls are not mutable feature flags or operational settings in this release."} /></section>;
}

export function FeatureFlagsSettingsView() {
  const query = useFeatureFlags({ role: "super-admin", page: 1, pageSize: 25 });
  const payload = query.data as { items: FeatureFlag[] } | undefined;
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <section className="admin-page">
      <PageHeader title={c.featureFlags} description={c.featureFlagsDescription} />
      {query.isPending && <LoadingState />}
      {query.isError && (asStatus(query.error) === 403 ? <AccessDeniedState permission="settings.flags.read" /> : <ErrorState />)}
      {payload?.items.map((flag) => <FeatureFlagCard flag={flag} key={flag.id} />)}
    </section>
  );
}

export function MaintenanceSettingsView() {
  const query = useMaintenance();
  const update = useUpdateMaintenance();
  const maintenance = query.data as Maintenance | undefined;
  const { locale } = useLocale();
  const c = copy[locale];
  if (query.isPending) return <LoadingState />;
  if (query.isError) return asStatus(query.error) === 403 ? <AccessDeniedState permission="settings.maintenance.read" /> : <ErrorState />;
  if (!maintenance) return <ErrorState />;
  const nextState = maintenance.state === "off" ? "scheduled" : maintenance.state === "scheduled" ? "active" : "off";
  return (
    <section className="admin-page">
      <PageHeader title={c.maintenance} description={c.maintenanceDescription} />
      <article className="metric-card">
        <h2>{maintenance.state}</h2>
        <p>{maintenance.message[locale]}</p>
        <p>{c.version} <span className="numbers">{maintenance.version}</span></p>
      </article>
      <button className="button primary" disabled={update.isPending} onClick={() => update.mutate({
        nextState,
        message: { ar: `Maintenance ${nextState}`, en: `Maintenance ${nextState}` },
        startsAt: nextState === "scheduled" ? new Date(Date.now() + 300_000).toISOString() : null,
        endsAt: nextState === "scheduled" ? new Date(Date.now() + 3_900_000).toISOString() : null,
        expectedVersion: maintenance.version,
        reason: "Update maintenance state after operator confirmation.",
        submissionKey: "SUB-DEMO-UI-MAINTENANCE",
      })}>{c.moveTo} {nextState}</button>
      {update.isSuccess && <SuccessState message="Maintenance updated safely." />}
      {update.isError && <ErrorState />}
    </section>
  );
}

function FeatureFlagCard({ flag }: { flag: FeatureFlag }) {
  const update = useUpdateFeatureFlag(flag.id);
  const { locale } = useLocale();
  const c = copy[locale];
  return (
    <article className="metric-card">
      <h2>{flag.label[locale]}</h2>
      <p>{flag.platform} · {flag.audience} · {flag.status}</p>
      <p>{c.rollout} <span className="numbers">{flag.rolloutPercent}%</span> · {c.version} <span className="numbers">{flag.version}</span></p>
      <button className="button" disabled={flag.status === "ended" || update.isPending} onClick={() => update.mutate({
        audience: "all_customers",
        rolloutPercent: flag.rolloutPercent === 100 ? 0 : 100,
        expectedVersion: flag.version,
        reason: "Update fixed audience rollout after governance review.",
        submissionKey: `SUB-DEMO-UI-FLAG-${flag.id}`,
      })}>{flag.status === "ended" ? c.readOnlyEnded : c.updateRollout}</button>
      {update.isSuccess && <SuccessState message="Feature flag updated safely." />}
      {update.isError && <ErrorState />}
    </article>
  );
}
