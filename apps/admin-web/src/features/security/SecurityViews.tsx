"use client";

import { useState } from "react";
import { ConfirmDialog, ErrorState, LoadingState, PageHeader } from "@/components/admin/ui";
import { getActionLabel, getPlatformLabel, getSeverityLabel, getStatusLabel } from "@/core/localization/display-labels";
import { useLocale } from "@/core/localization/provider";
import {
  useSecurityAction,
  useSecurityIncident,
  useSecurityList,
  useSecurityOverview,
} from "./hooks";
import { securityRepository } from "./repository";
import type { ActionResult, AuthenticationEvent, IncidentDetail, OperationsIncidentMutationResult, SuspiciousActivity, SupportAccessGrant } from "./contracts";

const defaultContext = (state: string, revision: number) => ({
  expectedState: state,
  expectedRevision: revision,
  reason: "Admin security review",
  confirmationToken: "CONFIRM-SPEC-008" as const,
});

const securityCopy = {
  ar: {
    records: "سجلات",
    empty: "لا توجد سجلات مطابقة للمرحلة 7.",
    authList: "قائمة أحداث المصادقة",
    suspiciousList: "قائمة النشاط المشبوه",
    event: "الحدث",
    actor: "الفاعل",
    risk: "المخاطر",
    result: "النتيجة",
    platform: "المنصة",
    time: "الوقت",
    activity: "النشاط",
    severity: "الشدة",
    status: "الحالة",
    signals: "الإشارات",
    incident: "الحادث",
    action: "الإجراء",
    overviewTitle: "مركز الأمن",
    overviewDescription: "مراقبة أمنية عربية أولا باستخدام أدلة mock مقنعة فقط.",
    authenticationTitle: "أحداث المصادقة",
    authenticationDescription: "أدلة مصادقة مفلترة دون IP خام أو رموز أو معرفات أجهزة.",
    suspiciousTitle: "النشاط المشبوه",
    suspiciousDescription: "مراجعة النشاط عالي المخاطر بإشارات محدودة وإجراءات mock فقط.",
    adminTitle: "أمن الإدارة",
    adminDescription: "وضع الإداريين دون بيانات اعتماد أو أسرار أو معرفات جلسات.",
    permissionTitle: "تغييرات الصلاحيات",
    permissionDescription: "سجل صلاحيات للقراءة فقط. تعديل الأدوار ضمن Spec 010.",
    supportTitle: "وصول الدعم النشط",
    supportDescription: "إنهاء وصول دعم مؤقت نشط بتأكيد صريح.",
    events: "الأحداث",
    admins: "الإداريون",
    changes: "التغييرات",
    expires: "ينتهي",
    endAccess: "إنهاء الوصول",
    confirmSuspicious: "تأكيد إجراء النشاط المشبوه",
    suspiciousConsequence: "يحدث حالة mock حتمية فقط؛ ويظل تفويض الخلفية مطلوبا لاحقا.",
    confirmSupport: "تأكيد إلغاء وصول الدعم",
    supportConsequence: "يلغي وصول mock حتمي فقط ويعلن مرجع تدقيق مخطط.",
    securityMetrics: {
      "failed-logins": "تسجيلات دخول فاشلة",
      "suspicious-sessions": "جلسات مشبوهة",
      "locked-accounts": "حسابات مقفلة",
      "support-access": "وصول دعم نشط",
      "critical-events": "أحداث حرجة",
    },
  },
  en: {
    records: "records",
    empty: "No matching Phase 7 records.",
    authList: "Authentication event list",
    suspiciousList: "Suspicious activity list",
    event: "Event",
    actor: "Actor",
    risk: "Risk",
    result: "Result",
    platform: "Platform",
    time: "Time",
    activity: "Activity",
    severity: "Severity",
    status: "Status",
    signals: "Signals",
    incident: "Incident",
    action: "Action",
    overviewTitle: "Security Center",
    overviewDescription: "Arabic-first security monitoring with sanitized mock evidence only.",
    authenticationTitle: "Authentication Events",
    authenticationDescription: "Filtered authentication evidence without raw IP, token, or device identifiers.",
    suspiciousTitle: "Suspicious Activity",
    suspiciousDescription: "Review high-risk activity with bounded signals and mock-only actions.",
    adminTitle: "Admin Security",
    adminDescription: "Administrator posture without credentials, secrets, or session identifiers.",
    permissionTitle: "Permission Changes",
    permissionDescription: "Read-only permission history. Role editing belongs to Spec 010.",
    supportTitle: "Active Support Access",
    supportDescription: "End active temporary support access with explicit confirmation.",
    events: "Events",
    admins: "Admins",
    changes: "Changes",
    expires: "expires",
    endAccess: "End Access",
    confirmSuspicious: "Confirm suspicious activity action",
    suspiciousConsequence: "Updates deterministic mock state only; future backend authorization remains required.",
    confirmSupport: "Confirm support access revocation",
    supportConsequence: "Revokes deterministic mock access only and announces a planned audit reference.",
    securityMetrics: {
      "failed-logins": "Failed logins",
      "suspicious-sessions": "Suspicious sessions",
      "locked-accounts": "Locked accounts",
      "support-access": "Active support access",
      "critical-events": "Critical events",
    },
  },
} as const;

function labelKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function statusText(locale: "ar" | "en", value: string) {
  return getStatusLabel(locale, labelKey(value));
}

function metricText(locale: "ar" | "en", key: string, fallback: string) {
  return securityCopy[locale].securityMetrics[key as keyof typeof securityCopy.ar.securityMetrics] ?? fallback;
}

function Id({ value }: { value: string }) {
  return <bdi className="ltr">{value}</bdi>;
}

function Badge({ value, tone = "neutral" }: { value: string; tone?: "success" | "warning" | "danger" | "info" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{value}</span>;
}

function FieldList({ rows }: { rows: Array<[string, React.ReactNode]> }) {
  return <dl className="confirmation-details">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>;
}

function riskTone(risk: string): "success" | "warning" | "danger" | "info" {
  return risk === "critical" || risk === "high" ? "danger" : risk === "medium" ? "warning" : risk === "low" ? "success" : "info";
}

function resultTone(result: string): "success" | "warning" | "danger" {
  return result === "success" ? "success" : result === "blocked" ? "warning" : "danger";
}

function stateTone(state: string): "success" | "warning" | "danger" | "info" {
  return state === "Resolved" || state === "Dismissed" ? "success" : state === "Escalated" ? "danger" : state === "Investigating" ? "warning" : "info";
}

function SimpleList({ resource, title }: { resource: string; title: string }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const query = useSecurityList(resource, { page: 1, pageSize: 25 });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState />;
  const items = query.data.items;
  return (
    <section className="table-card ops-table-card" aria-labelledby={`${resource}-title`}>
      <div className="card-heading ops-card-heading">
        <div>
          <h2 id={`${resource}-title`}>{title}</h2>
          <p>{query.data.pagination.totalItems} {copy.records}</p>
        </div>
      </div>
      {items.length === 0 ? <p role="status">{copy.empty}</p> : (
        resource === "authentication"
          ? <AuthenticationTable items={items as AuthenticationEvent[]} />
          : resource === "suspicious"
            ? <SuspiciousTable items={items as SuspiciousActivity[]} />
            : <div className="mobile-cards ops-mobile-cards always-visible">{items.map((item) => <RecordCard key={String((item as Record<string, unknown>).id)} item={item as Record<string, unknown>} />)}</div>
      )}
    </section>
  );
}

function RecordCard({ item }: { item: Record<string, unknown> }) {
  const { locale } = useLocale();
  const id = String(item.id);
  const state = "state" in item ? String(item.state) : "result" in item ? String(item.result) : "";
  const title = "label" in item ? String(item.label) : "eventType" in item ? String(item.eventType) : "roleSummary" in item ? String(item.roleSummary) : id;
  return (
    <article className="mobile-data-card">
      <div className="mobile-data-head"><Id value={id} />{state && <Badge value={statusText(locale, state)} tone="info" />}</div>
      <strong>{title}</strong>
      <p>{statusText(locale, String(item.risk ?? item.twoFactorState ?? item.result ?? "safe projection"))}</p>
    </article>
  );
}

function AuthenticationTable({ items }: { items: AuthenticationEvent[] }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  return (
    <>
      <div className="desktop-table">
        <table className="data-table ops-data-table">
          <caption>{copy.authList}</caption>
          <thead><tr><th>{copy.event}</th><th>{copy.actor}</th><th>{copy.risk}</th><th>{copy.result}</th><th>{copy.platform}</th><th>{copy.time}</th></tr></thead>
          <tbody>{items.map((event) => (
            <tr key={event.id}>
              <td><strong>{event.eventType}</strong><small><Id value={event.id} /> · <Id value={event.correlationId} /></small></td>
              <td>{event.actor.label}<small>{event.actorType} · {event.broadRegion}</small></td>
              <td><Badge value={getSeverityLabel(locale, event.risk)} tone={riskTone(event.risk)} /></td>
              <td><Badge value={getStatusLabel(locale, event.result)} tone={resultTone(event.result)} /></td>
              <td><span>{getPlatformLabel(locale, event.platform)}</span></td>
              <td><Id value={event.occurredAt} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobile-cards ops-mobile-cards">{items.map((event) => (
        <article className="mobile-data-card" key={event.id}>
          <div className="mobile-data-head"><Id value={event.id} /><Badge value={getStatusLabel(locale, event.result)} tone={resultTone(event.result)} /></div>
          <strong>{event.eventType}</strong>
          <p>{event.actor.label} · {event.broadRegion}</p>
          <div className="mobile-data-meta"><div><small>{copy.risk}</small><Badge value={getSeverityLabel(locale, event.risk)} tone={riskTone(event.risk)} /></div><div><small>{copy.time}</small><Id value={event.occurredAt} /></div></div>
        </article>
      ))}</div>
    </>
  );
}

function SuspiciousTable({ items, actions = false }: { items: SuspiciousActivity[]; actions?: boolean }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  return (
    <>
      <div className="desktop-table">
        <table className="data-table ops-data-table">
          <caption>{copy.suspiciousList}</caption>
          <thead><tr><th>{copy.activity}</th><th>{copy.actor}</th><th>{copy.severity}</th><th>{copy.status}</th><th>{copy.signals}</th><th>{copy.incident}</th>{actions && <th>{copy.action}</th>}</tr></thead>
          <tbody>{items.map((activity) => (
            <tr key={activity.id}>
              <td><strong>{activity.label}</strong><small><Id value={activity.id} /></small></td>
              <td>{activity.actor.label}<small>{activity.platform}</small></td>
              <td><Badge value={`${getSeverityLabel(locale, activity.risk)} · ${activity.riskScore}`} tone={riskTone(activity.risk)} /></td>
              <td><Badge value={statusText(locale, activity.state)} tone={stateTone(activity.state)} /></td>
              <td>{activity.signals.join(" · ")}</td>
              <td>{activity.incident ? <Id value={activity.incident.id} /> : "-"}</td>
              {actions && <td><SuspiciousActionButton activity={activity} /></td>}
            </tr>
          ))}</tbody>
        </table>
      </div>
      <div className="mobile-cards ops-mobile-cards">{items.map((activity) => <SuspiciousCard key={activity.id} activity={activity} />)}</div>
    </>
  );
}

export function SecurityOverviewRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const overview = useSecurityOverview({ platform: "all", period: "30d" });
  return (
    <div className="page">
      <PageHeader title={copy.overviewTitle} eyebrow="Spec 008" description={copy.overviewDescription} />
      {overview.isPending ? <LoadingState /> : overview.isError ? <ErrorState /> : (
        <section className="metrics-grid security-metrics-grid">
          {overview.data.metrics.map((metric) => (
            <article className={`metric-card tone-${metric.key === "support-access" ? "info" : metric.key === "suspicious-sessions" ? "warning" : "danger"}`} key={metric.key}>
              <span>{metricText(locale, metric.key, metric.label)}</span>
              <strong className="metric-value numbers">{metric.value}</strong>
              <small>{metric.entitySemantic} · {metric.unit}</small>
            </article>
          ))}
        </section>
      )}
      <SimpleList resource="authentication" title={copy.authenticationTitle} />
      <SimpleList resource="suspicious" title={copy.suspiciousTitle} />
    </div>
  );
}

export function AuthenticationEventsRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  return <div className="page"><PageHeader title={copy.authenticationTitle} description={copy.authenticationDescription} /><SimpleList resource="authentication" title={copy.events} /></div>;
}

export function SuspiciousActivityRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const query = useSecurityList("suspicious", { page: 1, pageSize: 25 });
  return (
    <div className="page">
      <PageHeader title={copy.suspiciousTitle} description={copy.suspiciousDescription} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState /> : (
        <section className="table-card ops-table-card"><SuspiciousTable actions items={query.data.items as SuspiciousActivity[]} /></section>
      )}
    </div>
  );
}

function SuspiciousActionButton({ activity }: { activity: SuspiciousActivity }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const mutation = useSecurityAction();
  const [open, setOpen] = useState(false);
  const action = activity.state === "New" ? "assign_reviewer" : activity.allowedActions[0];
  if (!action) return null;
  return (
    <>
      <button className="button" onClick={() => setOpen(true)}>{getActionLabel(locale, action)}</button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "suspicious",
          id: activity.id,
          action,
          run: () => securityRepository.actOnSuspiciousActivity(activity.id, {
            action,
            incidentId: activity.incident?.id,
            context: defaultContext(activity.state, activity.revision),
          }),
        }, { onSuccess: () => setOpen(false) })}
        title={copy.confirmSuspicious}
        scope={activity.id}
        consequence={copy.suspiciousConsequence}
        permission="security.incidents.manage"
        auditEvent="security.suspicious_activity.updated"
        pending={mutation.isPending}
        outcomes={{ success: "updated", failure: "failed", conflict: "conflict" }}
      />
    </>
  );
}

function SuspiciousCard({ activity }: { activity: SuspiciousActivity }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const mutation = useSecurityAction();
  const [open, setOpen] = useState(false);
  const action = activity.state === "New" ? "assign_reviewer" : activity.allowedActions[0];
  return (
    <article className="mobile-data-card">
      <div className="mobile-data-head"><Id value={activity.id} /><Badge value={statusText(locale, activity.state)} tone={stateTone(activity.state)} /></div>
      <strong>{activity.label}</strong>
      <p>{activity.signals.join(" · ")}</p>
      <div className="mobile-data-meta"><div><small>{copy.risk}</small><Badge value={`${getSeverityLabel(locale, activity.risk)} · ${activity.riskScore}`} tone={riskTone(activity.risk)} /></div><div><small>{copy.actor}</small><strong>{activity.actor.label}</strong></div></div>
      {action && <button className="button" onClick={() => setOpen(true)}>{getActionLabel(locale, action)}</button>}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "suspicious",
          id: activity.id,
          action,
          run: () => securityRepository.actOnSuspiciousActivity(activity.id, {
            action,
            incidentId: activity.incident?.id,
            context: defaultContext(activity.state, activity.revision),
          }),
        }, { onSuccess: () => setOpen(false) })}
        title={copy.confirmSuspicious}
        scope={activity.id}
        consequence={copy.suspiciousConsequence}
        permission="security.incidents.manage"
        auditEvent="security.suspicious_activity.updated"
        pending={mutation.isPending}
        outcomes={{ success: "updated", failure: "failed", conflict: "conflict" }}
      />
    </article>
  );
}

export function AdminSecurityRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  return <div className="page"><PageHeader title={copy.adminTitle} description={copy.adminDescription} /><SimpleList resource="admins" title={copy.admins} /></div>;
}

export function PermissionChangesRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  return <div className="page"><PageHeader title={copy.permissionTitle} description={copy.permissionDescription} /><SimpleList resource="permissions" title={copy.changes} /></div>;
}

export function SupportAccessRoute() {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const query = useSecurityList("supportAccess", { page: 1, pageSize: 25 });
  return (
    <div className="page">
      <PageHeader title={copy.supportTitle} description={copy.supportDescription} />
      {query.isPending ? <LoadingState /> : query.isError ? <ErrorState /> : (
        <div className="phase7-cards">
          {(query.data.items as SupportAccessGrant[]).map((grant) => <SupportAccessCard key={grant.id} grant={grant} />)}
        </div>
      )}
    </div>
  );
}

function SupportAccessCard({ grant }: { grant: SupportAccessGrant }) {
  const { locale } = useLocale();
  const copy = securityCopy[locale];
  const mutation = useSecurityAction();
  const [open, setOpen] = useState(false);
  return (
    <article className="mobile-data-card">
      <div className="mobile-data-head"><Id value={grant.id} /><span>{getStatusLabel(locale, grant.state)}</span></div>
      <strong>{grant.agent.label} · {grant.customer.label}</strong>
      <p>{grant.scopes.join(" · ")} · {copy.expires} <Id value={grant.expiresAt} /></p>
      {grant.state === "active" && <button className="button" onClick={() => setOpen(true)}>{copy.endAccess}</button>}
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => mutation.mutate({
          resource: "support-access",
          id: grant.id,
          action: "revoke",
          run: () => securityRepository.revokeSupportAccess(grant.id, { context: defaultContext(grant.state, grant.revision) }),
        }, { onSuccess: () => setOpen(false) })}
        title={copy.confirmSupport}
        scope={grant.id}
        consequence={copy.supportConsequence}
        permission="security.support_access.revoke"
        auditEvent="security.support_access.revoked"
        pending={mutation.isPending}
        outcomes={{ success: "revoked", failure: "failed", conflict: "conflict" }}
      />
    </article>
  );
}

export function IncidentDetailRoute({ incidentId }: { incidentId: string }) {
  const incident = useSecurityIncident(incidentId);
  const mutation = useSecurityAction();
  const [result, setResult] = useState<ActionResult | OperationsIncidentMutationResult | null>(null);
  if (incident.isPending) return <div className="page"><LoadingState /></div>;
  if (incident.isError) return <div className="page"><ErrorState /></div>;
  const data: IncidentDetail = incident.data;
  const action = data.allowedActions[0];
  return (
    <div className="page">
      <PageHeader title={`Incident ${data.id}`} description="Sanitized incident detail and timeline." />
      <FieldList rows={[
        ["State", data.state],
        ["Severity", data.severity],
        ["Owner", data.owner?.label ?? data.assignedAdminId ?? "Unavailable"],
        ["Affected customers", data.affectedCustomerCount ?? "Unavailable"],
      ]} />
      <ol>{data.timeline.map((item) => <li key={`${item.at}:${item.label}`}><Id value={item.at} /> {item.label}</li>)}</ol>
      {action && <button className="button primary" onClick={() => mutation.mutate({
        resource: "incident",
        id: data.id,
        action,
        run: () => securityRepository.actOnSecurityIncident(data.id, { action, context: defaultContext(data.state, data.revision) }),
      }, { onSuccess: (value) => setResult(value as ActionResult | OperationsIncidentMutationResult) })}>{action}</button>}
      {result && <p role="status">{"auditReference" in result ? <>Audit reference <Id value={result.auditReference.eventId} /></> : <>Incident version {result.version}</>}</p>}
    </div>
  );
}
