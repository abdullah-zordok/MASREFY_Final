"use client";

import Link from "next/link";
import { useState } from "react";
import { AccessDeniedState, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader, SuccessState } from "@/components/admin/ui";
import { getRoleLabel, getStatusLabel } from "@/core/localization/display-labels";
import type { Locale } from "@/core/localization/direction";
import { useLocale } from "@/core/localization/provider";
import type { AccessAdmin, AccessAdminDetail, AccessPermission, AccessRole, AdminListResponse, AdminUserDetail, AdminUserSummary, GovernanceRole } from "./contracts";
import { inviteAdminRequestSchema, reasonSchema, roleCreateRequestSchema } from "./contracts";
import {
  useAdminUser,
  useAdminUsers,
  useAssignAdminRoles,
  useCreateRole,
  useDisableAdmin,
  useInviteAdmin,
  usePermissionMatrix,
  useRevokeAdminSessions,
  useRole,
  useRoles,
  useUpdateRole,
} from "./hooks";

function asStatus(error: unknown) {
  return typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
}

function Badge({ value, tone = "neutral" }: { value: string; tone?: "success" | "warning" | "danger" | "info" | "bronze" | "neutral" }) {
  return <span className={`badge badge-${tone}`}>{value}</span>;
}

function adminStatusTone(status: string): "success" | "danger" | "info" {
  return status === "active" ? "success" : status === "disabled" ? "danger" : "info";
}

function roleTone(role: string): "bronze" | "warning" | "info" | "neutral" {
  return role === "super-admin" ? "bronze" : role === "security-administrator" ? "warning" : role === "support-agent" ? "info" : "neutral";
}

const copy = {
  ar: {
    activeSessions: "الجلسات النشطة",
    activateRole: "تفعيل الدور",
    admin: "المسؤول",
    adminActions: "إجراءات الإدارة",
    adminList: "قائمة المسؤولين",
    adminNotFound: "لم يتم العثور على المسؤول",
    adminTeamDescription: "مسؤولون تجريبيون وجلسات آمنة ودعوات معلقة.",
    adminTeamTitle: "فريق الإدارة",
    administrators: "مسؤول",
    approval: "الموافقة",
    assignRole: "إسناد الدور",
    assignSecurityRole: "إسناد دور الأمن",
    assignedRoles: "الأدوار المسندة",
    assignments: "الإسنادات",
    confirmationReason: "سبب التأكيد",
    createInvitation: "إنشاء دعوة معلقة",
    createInvitationPending: "جاري إنشاء الدعوة...",
    createRole: "إنشاء الدور",
    customRoleDescription: "يمكن تحديث الأدوار المخصصة أو تعطيلها؛ الحذف غير متاح.",
    department: "القسم",
    description: "الوصف",
    disableAdmin: "تعطيل المسؤول",
    disableRole: "تعطيل الدور",
    editRole: "تعديل الدور",
    email: "البريد الإلكتروني",
    arabicName: "الاسم العربي",
    englishName: "الاسم الإنجليزي",
    expiryDays: "أيام الانتهاء",
    governanceApproval: "موافقة الحوكمة",
    inviteAdminDescription: "ينشئ دعوة تجريبية معلقة فقط؛ لا يتم إرسال بريد.",
    inviteAdminTitle: "دعوة مسؤول",
    inviteCreated: "تم إنشاء الدعوة المعلقة بأمان.",
    kind: "النوع",
    message: "الرسالة",
    name: "الاسم",
    newRole: "دور جديد",
    newRoleDescription: "أنشئ دورا مخصصا نشطا بصلاحية واحدة على الأقل.",
    noAdmins: "لا يوجد مسؤولون",
    permissions: "الصلاحيات",
    permissionKeys: "مفاتيح الصلاحيات",
    permissionMatrix: "مصفوفة الصلاحيات",
    permissionMatrixDescription: "مصفوفة للقراءة فقط من مخزون الصلاحيات الواحد.",
    reason: "السبب",
    revokeSessions: "إلغاء الجلسات",
    role: "الدور",
    roleId: "معرف الدور",
    roleKey: "مفتاح الدور",
    roleList: "قائمة الأدوار",
    roleNotFound: "لم يتم العثور على الدور",
    roles: "أدوار",
    rolesTitle: "الأدوار والصلاحيات",
    rolesDescription: "أدوار النظام ثابتة، ويمكن إدارة الأدوار المخصصة بأمان.",
    searchAdmins: "بحث المسؤولين",
    searchAdminsPlaceholder: "الاسم أو البريد المقنع أو القسم",
    searchRoles: "بحث الأدوار",
    searchRolesPlaceholder: "اسم الدور أو الصلاحية",
    selectedPermissions: "الصلاحيات المختارة",
    status: "الحالة",
    validationInvite: "أدخل بريدا صحيحا، واسما من 1 إلى 120 حرفا، وانتهاء من 1 إلى 30 يوما.",
    validationReason: "يجب أن يكون السبب من 10 إلى 500 حرف آمن.",
    validationRole: "استخدم مفتاح kebab-case، وأسماء ثنائية اللغة، ووصفا وسببا وصلاحية واحدة معروفة على الأقل.",
    version: "النسخة",
  },
  en: {
    activeSessions: "Active sessions",
    activateRole: "Activate role",
    admin: "Admin",
    adminActions: "Administrative actions",
    adminList: "Admin list",
    adminNotFound: "Admin not found",
    adminTeamDescription: "Fictional admin users, safe sessions, and pending invitations.",
    adminTeamTitle: "Admin Team",
    administrators: "administrators",
    approval: "Approval",
    assignRole: "Assign role",
    assignSecurityRole: "Assign Security role",
    assignedRoles: "Assigned roles",
    assignments: "Assignments",
    confirmationReason: "Confirmation reason",
    createInvitation: "Create pending invitation",
    createInvitationPending: "Creating pending invitation...",
    createRole: "Create role",
    customRoleDescription: "Custom roles can be updated or disabled; delete is not available.",
    department: "Department",
    description: "Description",
    disableAdmin: "Disable admin",
    disableRole: "Disable role",
    editRole: "Edit role",
    email: "Email",
    arabicName: "Arabic name",
    englishName: "English name",
    expiryDays: "Expiry days",
    governanceApproval: "Governance approval",
    inviteAdminDescription: "Creates a pending mock invitation only; no email is sent.",
    inviteAdminTitle: "Invite Admin",
    inviteCreated: "Pending invitation created safely.",
    kind: "Kind",
    message: "Message",
    name: "Name",
    newRole: "New Role",
    newRoleDescription: "Create an active custom role with at least one permission.",
    noAdmins: "No admins found",
    permissions: "Permissions",
    permissionKeys: "Permission keys",
    permissionMatrix: "Permission Matrix",
    permissionMatrixDescription: "Read-only matrix sourced from the single permission inventory.",
    reason: "Reason",
    revokeSessions: "Revoke sessions",
    role: "Role",
    roleId: "Role ID",
    roleKey: "Role key",
    roleList: "Role list",
    roleNotFound: "Role not found",
    roles: "roles",
    rolesTitle: "Roles and Permissions",
    rolesDescription: "System roles are immutable; custom roles can be maintained safely.",
    searchAdmins: "Search admins",
    searchAdminsPlaceholder: "Name, masked email, department",
    searchRoles: "Search roles",
    searchRolesPlaceholder: "Role name or permission",
    selectedPermissions: "Selected permissions",
    status: "Status",
    validationInvite: "Enter a valid email, 1-120 character name, and 1-30 day expiry.",
    validationReason: "Reason must be 10-500 safe characters.",
    validationRole: "Use a kebab-case key, bilingual names, description, reason, and at least one known permission.",
    version: "Version",
  },
} as const;

type GovernanceCopy = (typeof copy)[Locale];
type DisplayRole = GovernanceRole | AccessRole;
type DisplayAdmin = AdminUserSummary | AccessAdmin;

const roleName = (role: DisplayRole, locale: Locale) => typeof role.name === "string" ? role.name : role.name[locale];
const roleKind = (role: DisplayRole) => "systemRole" in role ? (role.systemRole ? "system" : "custom") : role.kind;
const roleStatus = (role: DisplayRole) => "enabled" in role ? (role.enabled ? "active" : "disabled") : role.status;
const adminName = (admin: DisplayAdmin) => admin.displayName ?? admin.id;
const adminEmail = (admin: DisplayAdmin) => ("emailMasked" in admin ? admin.emailMasked : admin.maskedEmail) ?? "Unavailable";
const adminRoleKeys = (admin: DisplayAdmin) => "roleKeys" in admin ? admin.roleKeys : admin.roleSummaries.map((role) => role.key);

function AdminRows({ admins, c, locale }: { admins: DisplayAdmin[]; c: GovernanceCopy; locale: Locale }) {
  return (
    <tbody>
      {admins.map((admin) => (
        <tr key={admin.id}>
          <td><div className="user-cell governance-user-cell"><div className="avatar">{adminName(admin).slice(0, 2)}</div><div><Link className="table-link" href={`/admin/admin-team/${admin.id}`}>{adminName(admin)}</Link><small className="ltr">{adminEmail(admin)}</small></div></div></td>
          <td><div className="governance-badge-stack">{adminRoleKeys(admin).map((role) => <Badge key={role} value={getRoleLabel(locale, role)} tone={roleTone(role)} />)}</div></td>
          <td><Badge value={getStatusLabel(locale, admin.status)} tone={adminStatusTone(admin.status)} /><span className="sr-only">{c.status} {admin.status}</span></td>
          <td>{admin.department ?? "Unavailable"}</td>
          <td className="numbers">{admin.activeSessionCount}</td>
        </tr>
      ))}
    </tbody>
  );
}

function AdminMobileCards({ admins, c, locale }: { admins: DisplayAdmin[]; c: GovernanceCopy; locale: Locale }) {
  return (
    <div className="mobile-cards ops-mobile-cards">
      {admins.map((admin) => (
        <article className="mobile-data-card" key={admin.id}>
          <div className="mobile-data-head">
            <div className="governance-mobile-title"><Link href={`/admin/admin-team/${admin.id}`}><strong>{adminName(admin)}</strong></Link><small className="ltr">{adminEmail(admin)}</small></div>
            <Badge value={getStatusLabel(locale, admin.status)} tone={adminStatusTone(admin.status)} />
          </div>
          <div className="mobile-data-meta">
                <div><small>{c.roles}</small><strong className="governance-badge-stack">{adminRoleKeys(admin).map((role) => <Badge key={role} value={getRoleLabel(locale, role)} tone={roleTone(role)} />)}</strong></div>
                <div><small>{c.department}</small><strong>{admin.department ?? "Unavailable"}</strong></div>
            <div><small>{c.activeSessions}</small><strong className="numbers">{admin.activeSessionCount}</strong></div>
          </div>
        </article>
      ))}
    </div>
  );
}

export function AdminTeamView() {
  const [search, setSearch] = useState("");
  const { locale } = useLocale();
  const c = copy[locale];
  const query = useAdminUsers({ role: "super-admin", page: 1, pageSize: 25, search: search || undefined });
  const payload = query.data as (AdminListResponse & { items: DisplayAdmin[] }) | undefined;

  return (
    <section className="admin-page">
      <PageHeader
        title={c.adminTeamTitle}
        description={c.adminTeamDescription}
        actions={<Link className="button primary" href="/admin/admin-team/invite">{c.inviteAdminTitle}</Link>}
      />
      <div className="toolbar governance-toolbar">
        <div className="toolbar-filters">
          <label className="search-input">
            <span className="sr-only">{c.searchAdmins}</span>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.searchAdminsPlaceholder} />
          </label>
        </div>
      </div>
      {query.isPending && <LoadingState />}
      {query.isError && (asStatus(query.error) === 403 ? <AccessDeniedState permission="admin-team.read" /> : <ErrorState />)}
      {payload?.items.length === 0 && <EmptyState title={c.noAdmins} />}
      {payload && payload.items.length > 0 && (
        <section className="table-card governance-table-card" aria-labelledby="admin-team-list-title">
          <div className="card-heading ops-card-heading"><div><h2 id="admin-team-list-title">{c.adminList}</h2><p>{payload.total} {c.administrators}</p></div></div>
          <div className="desktop-table"><table className="data-table governance-data-table">
            <caption>{c.adminList}</caption>
            <thead><tr><th>{c.admin}</th><th>{c.roles}</th><th>{c.status}</th><th>{c.department}</th><th>{c.activeSessions}</th></tr></thead>
            <AdminRows admins={payload.items} c={c} locale={locale} />
          </table></div>
          <AdminMobileCards admins={payload.items} c={c} locale={locale} />
        </section>
      )}
    </section>
  );
}

export function InviteAdminView() {
  const invite = useInviteAdmin();
  const { locale } = useLocale();
  const c = copy[locale];
  const [form, setForm] = useState({
    email: "",
    name: "",
    roleId: "ROLE-DEMO-SUPPORT",
    department: "Support",
    expiryDays: "7",
    message: "",
  });
  const parsed = inviteAdminRequestSchema.safeParse({
    ...form,
    expiryDays: Number(form.expiryDays),
    message: form.message || undefined,
    submissionKey: "SUB-DEMO-UI-INVITE",
  });

  return (
    <section className="admin-page">
      <PageHeader title={c.inviteAdminTitle} description={c.inviteAdminDescription} />
      <form className="table-card invite-admin-form" onSubmit={(event) => {
        event.preventDefault();
        if (parsed.success) invite.mutate(parsed.data);
      }}>
        <div className="invite-admin-grid">
          <label>{c.email}<input className="input ltr" aria-label={c.email} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value.trim().toLowerCase() })} /></label>
          <label>{c.name}<input className="input" aria-label={c.name} value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>{c.role}<select className="select" aria-label={c.role} value={form.roleId} onChange={(event) => setForm({ ...form, roleId: event.target.value })}><option value="ROLE-DEMO-SUPPORT">{getRoleLabel(locale, "support-agent")}</option><option value="ROLE-DEMO-SECURITY">{getRoleLabel(locale, "security-administrator")}</option></select></label>
          <label>{c.department}<input className="input" aria-label={c.department} value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} /></label>
          <label>{c.expiryDays}<input className="input numbers" aria-label={c.expiryDays} type="number" min={1} max={30} value={form.expiryDays} onChange={(event) => setForm({ ...form, expiryDays: event.target.value })} /></label>
          <label className="invite-message-field">{c.message}<textarea className="input" aria-label={c.message} maxLength={1000} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} /></label>
        </div>
        <div className="invite-admin-footer">
          {!parsed.success && <p role="alert">{c.validationInvite}</p>}
          <button className="button primary" disabled={!parsed.success || invite.isPending}>{invite.isPending ? c.createInvitationPending : c.createInvitation}</button>
        </div>
      </form>
      {invite.isSuccess && <SuccessState message={c.inviteCreated} />}
      {invite.isError && <ErrorState />}
    </section>
  );
}

export function AdminProfileView({ adminId }: { adminId: string }) {
  const { locale } = useLocale();
  const c = copy[locale];
  const query = useAdminUser(adminId);
  const admin = query.data as AdminUserDetail | AccessAdminDetail | undefined;
  const assign = useAssignAdminRoles(adminId);
  const revoke = useRevokeAdminSessions(adminId);
  const disable = useDisableAdmin(adminId);
  const [dialog, setDialog] = useState<"assign" | "revoke" | "disable" | null>(null);
  const [reason, setReason] = useState("Approved governance action for mock admin review.");
  const reasonOk = reasonSchema.safeParse(reason).success;

  if (query.isPending) return <LoadingState />;
  if (query.isError) return asStatus(query.error) === 403 ? <AccessDeniedState permission="admin-team.read" /> : <ErrorState />;
  if (!admin) return <EmptyState title={c.adminNotFound} />;
  if ("roleKeys" in admin) return (
    <section className="admin-page">
      <PageHeader title={admin.displayName ?? admin.id} description={`${admin.emailMasked ?? "Unavailable"} - ${admin.department ?? "Unavailable"}`} />
      <section className="table-card admin-profile-card" aria-labelledby="admin-profile-title">
        <h2 id="admin-profile-title">{admin.displayName ?? admin.id}</h2>
        <dl className="role-detail-grid">
          <div><dt>{c.status}</dt><dd>{admin.status}</dd></div>
          <div><dt>{c.version}</dt><dd>{admin.version}</dd></div>
          <div><dt>{c.activeSessions}</dt><dd>{admin.activeSessionCount}</dd></div>
          <div><dt>{c.roles}</dt><dd>{admin.roleKeys.join(", ") || "Unavailable"}</dd></div>
          <div><dt>{locale === "ar" ? "الصلاحيات" : "Permissions"}</dt><dd>{admin.effectivePermissionKeys.join(", ") || "Unavailable"}</dd></div>
        </dl>
      </section>
    </section>
  );
  const revocable = admin.sessions.filter((session) => session.state === "active" && !session.isCurrentSession);

  return (
    <section className="admin-page">
      <PageHeader title={admin.displayName} description={`${admin.maskedEmail} - ${admin.department}`} />
      <section className="table-card admin-profile-card" aria-labelledby="admin-profile-title">
        <div className="admin-profile-head">
          <div>
            <h2 id="admin-profile-title">{admin.displayName}</h2>
            <p><span className="ltr">{admin.maskedEmail}</span><span>{admin.department}</span><span>{admin.profile.title}</span></p>
          </div>
          <Badge value={getStatusLabel(locale, admin.status)} tone={adminStatusTone(admin.status)} />
        </div>
        <div className="admin-profile-summary">
          <article className={`admin-summary-card tone-${adminStatusTone(admin.status)}`}><span>{c.status}</span><strong>{getStatusLabel(locale, admin.status)}</strong><small>{locale === "ar" ? "حالة الحساب" : "Account state"}</small></article>
          <article className="admin-summary-card tone-info"><span>{c.version}</span><strong className="numbers">{admin.version}</strong><small>{locale === "ar" ? "سجل الحوكمة" : "Governance record"}</small></article>
          <article className={admin.assignedTickets.openCount > 0 ? "admin-summary-card tone-warning" : "admin-summary-card"}><span>{locale === "ar" ? "التذاكر المفتوحة" : "Open tickets"}</span><strong className="numbers">{admin.assignedTickets.openCount}</strong><small>{admin.assignedTickets.references.length} {locale === "ar" ? "مراجع" : "references"}</small></article>
        </div>
      </section>

      <div className="admin-profile-grid">
        <section className="table-card admin-profile-section" aria-labelledby="admin-roles-title">
          <div className="card-heading ops-card-heading"><div><h2 id="admin-roles-title">{c.assignedRoles}</h2><p>{admin.roleSummaries.length} {c.roles}</p></div></div>
          <div className="admin-role-list">
            {admin.roleSummaries.map((role) => (
              <div className="admin-role-row" key={role.id}>
                <div><Link className="table-link" href={`/admin/roles/${role.id}`}>{getRoleLabel(locale, role.key)}</Link><small className="ltr">{role.key}</small></div>
                <Badge value={getRoleLabel(locale, role.key)} tone={roleTone(role.key)} />
              </div>
            ))}
          </div>
        </section>

        <section className="table-card admin-profile-section" aria-labelledby="admin-sessions-title">
          <div className="card-heading ops-card-heading"><div><h2 id="admin-sessions-title">{c.activeSessions}</h2><p><span className="numbers">{admin.activeSessionCount}</span> {c.activeSessions}</p></div></div>
          <div className="admin-session-list">
            {admin.sessions.map((session) => (
              <article className={`admin-session-row${session.isCurrentSession ? " is-current" : ""}`} key={session.id}>
                <div className="admin-session-head">
                  <div><strong>{session.deviceLabel}</strong><small>{session.broadRegion}</small></div>
                  <div className="governance-badge-stack">
                    <Badge value={getStatusLabel(locale, session.state)} tone={session.state === "active" ? "success" : "neutral"} />
                    <Badge value={getStatusLabel(locale, session.riskLabel)} tone={session.riskLabel === "high" ? "danger" : session.riskLabel === "medium" ? "warning" : "info"} />
                    {session.isCurrentSession && <Badge value={locale === "ar" ? "الجلسة الحالية محمية" : "current session protected"} />}
                  </div>
                </div>
                <dl>
                  <div><dt>{locale === "ar" ? "بدأت" : "Started"}</dt><dd className="numbers">{session.startedAt}</dd></div>
                  <div><dt>{locale === "ar" ? "آخر نشاط" : "Last activity"}</dt><dd className="numbers">{session.lastActivityAt}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        </section>
      </div>

      <section className="table-card admin-action-card" aria-labelledby="admin-actions-title">
        <div className="card-heading ops-card-heading"><div><h2 id="admin-actions-title">{c.adminActions}</h2><p>{locale === "ar" ? "يستخدم السبب لتأكيد تغييرات الأدوار والجلسات وتعطيل المسؤول." : "Reason is used for role, session, and disable confirmations."}</p></div></div>
        <div className="admin-action-body">
          <label>{c.confirmationReason}<textarea className="input" dir="auto" aria-label={c.confirmationReason} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {!reasonOk && <p role="alert">{c.validationReason}</p>}
          <div className="admin-action-buttons">
            <button className="button primary" disabled={admin.status !== "active"} onClick={() => setDialog("assign")}>{c.assignSecurityRole}</button>
            <button className="button warning" disabled={revocable.length === 0} onClick={() => setDialog("revoke")}>{c.revokeSessions}</button>
            <button className="button danger" disabled={admin.status !== "active"} onClick={() => setDialog("disable")}>{c.disableAdmin}</button>
          </div>
        </div>
      </section>
      {(assign.isSuccess || revoke.isSuccess || disable.isSuccess) && <SuccessState message="Admin governance action completed safely." />}
      {(assign.isError || revoke.isError || disable.isError) && <ErrorState />}
      <ConfirmDialog
        open={dialog === "assign"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          assign.mutate({ adminId, roleIds: ["ROLE-DEMO-SECURITY"], reason, expectedVersion: admin.version, submissionKey: "SUB-DEMO-UI-ASSIGN" });
          setDialog(null);
        }}
        title={c.assignRole}
        scope={admin.displayName}
        consequence={locale === "ar" ? "يستبدل الأدوار بدور مسؤول الأمن لهذا المسؤول التجريبي." : "Replaces roles with Security Administrator for this mock admin."}
        permission="admin-team.roles.assign"
        auditEvent="admin.roles.assigned"
        pending={assign.isPending}
        confirmDisabled={!reasonOk}
        outcomes={{ success: locale === "ar" ? "تم تحديث الأدوار" : "Roles updated", failure: locale === "ar" ? "فشل" : "Failed", conflict: locale === "ar" ? "تعارض" : "Conflict" }}
      />
      <ConfirmDialog
        open={dialog === "revoke"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          revoke.mutate({ adminId, sessionIds: revocable.map((session) => session.id), revokeAllEligible: false, reason, expectedVersion: admin.version, submissionKey: "SUB-DEMO-UI-REVOKE" });
          setDialog(null);
        }}
        title={c.revokeSessions}
        scope={admin.displayName}
        consequence={locale === "ar" ? "تظل الجلسة الحالية محمية؛ ويتم إلغاء الجلسات التجريبية المؤهلة." : "Current session remains protected; eligible mock sessions become revoked."}
        permission="admin-team.sessions.revoke"
        auditEvent="admin.sessions.revoked"
        pending={revoke.isPending}
        confirmDisabled={!reasonOk || revocable.length === 0}
        outcomes={{ success: locale === "ar" ? "تم إلغاء الجلسات" : "Sessions revoked", failure: locale === "ar" ? "فشل" : "Failed", conflict: locale === "ar" ? "تعارض" : "Conflict" }}
      />
      <ConfirmDialog
        open={dialog === "disable"}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          disable.mutate({
            adminId,
            reason,
            revokeEligibleSessions: true,
            replacementAdminId: admin.assignedTickets.openCount > 0 ? "ADM-DEMO-SUPPORT-03" : undefined,
            expectedStatus: "active",
            expectedVersion: admin.version,
            submissionKey: "SUB-DEMO-UI-DISABLE",
          });
          setDialog(null);
        }}
        title={c.disableAdmin}
        scope={admin.displayName}
        consequence={locale === "ar" ? "يصبح المسؤول معطلا ويتم إلغاء الجلسات المؤهلة." : "Admin becomes Disabled and eligible sessions are revoked."}
        permission="admin-team.disable"
        auditEvent="admin.disabled"
        pending={disable.isPending}
        confirmDisabled={!reasonOk}
        outcomes={{ success: locale === "ar" ? "تم تعطيل المسؤول" : "Admin disabled", failure: locale === "ar" ? "فشل" : "Failed", conflict: locale === "ar" ? "تعارض" : "Conflict" }}
      />
    </section>
  );
}

export function RolesView() {
  const [search, setSearch] = useState("");
  const { locale } = useLocale();
  const c = copy[locale];
  const query = useRoles({ role: "super-admin", page: 1, pageSize: 25, search: search || undefined });
  const payload = query.data as { items: DisplayRole[] } | undefined;
  return (
    <section className="admin-page">
      <PageHeader title={c.rolesTitle} description={c.rolesDescription} actions={<Link className="button primary" href="/admin/roles/new">{c.newRole}</Link>} />
      <div className="toolbar governance-toolbar">
        <div className="toolbar-filters">
          <label className="search-input">
            <span className="sr-only">{c.searchRoles}</span>
            <input className="input" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={c.searchRolesPlaceholder} />
          </label>
        </div>
      </div>
      {query.isPending && <LoadingState />}
      {query.isError && (asStatus(query.error) === 403 ? <AccessDeniedState permission="access.roles.read" /> : <ErrorState />)}
      {payload && (
        <section className="table-card governance-table-card" aria-labelledby="roles-list-title">
          <div className="card-heading ops-card-heading"><div><h2 id="roles-list-title">{c.roleList}</h2><p>{payload.items.length} {c.roles}</p></div></div>
          <div className="desktop-table"><table className="data-table governance-data-table">
            <caption>{c.roleList}</caption>
            <thead><tr><th>{c.role}</th><th>{c.kind}</th><th>{c.status}</th><th>{c.assignments}</th><th>{c.permissions}</th></tr></thead>
            <tbody>{payload.items.map((role) => (
              <tr key={role.id}>
                <td><Link className="table-link" href={`/admin/roles/${role.id}`}>{roleName(role, locale)}</Link><small className="ltr">{role.key}</small>{roleKind(role) === "system" && <Badge value={getStatusLabel(locale, "system")} />}</td>
                <td><Badge value={getStatusLabel(locale, roleKind(role))} tone={roleKind(role) === "custom" ? "bronze" : "info"} /></td>
                <td><Badge value={getStatusLabel(locale, roleStatus(role))} tone={roleStatus(role) === "active" ? "success" : "danger"} /></td>
                <td className="numbers">{role.assignmentCount}</td>
                <td className="numbers">{role.permissionKeys.length}</td>
              </tr>
            ))}</tbody>
          </table></div>
          <div className="mobile-cards ops-mobile-cards">{payload.items.map((role) => (
            <article className="mobile-data-card" key={role.id}>
              <div className="mobile-data-head"><div className="governance-mobile-title"><Link href={`/admin/roles/${role.id}`}><strong>{roleName(role, locale)}</strong></Link><small className="ltr">{role.key}</small></div><Badge value={getStatusLabel(locale, roleStatus(role))} tone={roleStatus(role) === "active" ? "success" : "danger"} /></div>
              <div className="mobile-data-meta">
                <div><small>{c.kind}</small><Badge value={getStatusLabel(locale, roleKind(role))} tone={roleKind(role) === "custom" ? "bronze" : "info"} /></div>
                <div><small>{c.assignments}</small><strong className="numbers">{role.assignmentCount}</strong></div>
                <div><small>{c.permissions}</small><strong className="numbers">{role.permissionKeys.length}</strong></div>
                {roleKind(role) === "system" && <div><small>{locale === "ar" ? "السياسة" : "Policy"}</small><Badge value={getStatusLabel(locale, "system")} /></div>}
              </div>
            </article>
          ))}</div>
        </section>
      )}
    </section>
  );
}

export function NewRoleView() {
  const createRole = useCreateRole();
  const { locale } = useLocale();
  const c = copy[locale];
  const [form, setForm] = useState({
    key: "custom-reviewer",
    ar: "Custom Reviewer",
    en: "Custom Reviewer",
    description: "Custom reviewer with least privilege permissions.",
    permissionKeys: "admin-team.read",
    reason: "Create custom role for least privilege review.",
  });
  const permissionKeys = form.permissionKeys.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = roleCreateRequestSchema.safeParse({
    key: form.key,
    name: { ar: form.ar, en: form.en },
    description: form.description,
    permissionKeys,
    reason: form.reason,
    submissionKey: "SUB-DEMO-UI-ROLE-CREATE",
  });
  return (
    <section className="admin-page">
      <PageHeader title={c.newRole} description={c.newRoleDescription} />
      <form className="table-card role-create-form" onSubmit={(event) => {
        event.preventDefault();
        if (parsed.success) createRole.mutate(parsed.data);
      }}>
        <div className="role-create-grid">
          <label>{c.roleKey}<input className="input ltr" aria-label={c.roleKey} value={form.key} onChange={(event) => setForm({ ...form, key: event.target.value })} /></label>
          <label>{c.arabicName}<input className="input" aria-label={c.arabicName} value={form.ar} onChange={(event) => setForm({ ...form, ar: event.target.value })} /></label>
          <label>{c.englishName}<input className="input ltr" aria-label={c.englishName} value={form.en} onChange={(event) => setForm({ ...form, en: event.target.value })} /></label>
          <label className="role-create-wide">{c.description}<textarea className="input" dir="auto" aria-label={c.description} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
        </div>

        <section className="role-create-section" aria-labelledby="role-permissions-title">
          <h2 id="role-permissions-title">{c.permissions}</h2>
          <label>{c.permissionKeys}<input className="input ltr" aria-label={c.permissions} value={form.permissionKeys} onChange={(event) => setForm({ ...form, permissionKeys: event.target.value })} /></label>
          <div className="role-permission-list" aria-label={c.selectedPermissions}>
            {permissionKeys.map((key) => <span className="role-permission-chip ltr" key={key}>{key}</span>)}
          </div>
        </section>

        <section className="role-create-section" aria-labelledby="role-reason-title">
          <h2 id="role-reason-title">{c.reason}</h2>
          <label><span className="sr-only">{c.reason}</span><textarea className="input" dir="auto" aria-label={c.reason} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>
          {!parsed.success && <p role="alert">{c.validationRole}</p>}
        </section>

        <div className="role-create-footer">
          <button className="button primary" disabled={!parsed.success || createRole.isPending}>{c.createRole}</button>
        </div>
      </form>
      {createRole.isSuccess && <SuccessState message="Role created safely." />}
      {createRole.isError && <ErrorState />}
    </section>
  );
}

export function PermissionMatrixView() {
  const query = usePermissionMatrix();
  const { locale } = useLocale();
  const c = copy[locale];
  const matrix = query.data as ({ groups: Array<{ group: string; permissions: Array<{ key: string; label: { en: string } }> }>; permissionCount: number } | { items: AccessPermission[]; total: number }) | undefined;
  const groups = matrix && "groups" in matrix
    ? matrix.groups
    : Object.values((matrix?.items ?? []).reduce<Record<string, { group: string; permissions: AccessPermission[] }>>((result, permission) => {
        (result[permission.resource] ??= { group: permission.resource, permissions: [] }).permissions.push(permission);
        return result;
      }, {}));
  const permissionCount = matrix && "permissionCount" in matrix ? matrix.permissionCount : matrix?.total ?? 0;
  return (
    <section className="admin-page">
      <PageHeader title={c.permissionMatrix} description={c.permissionMatrixDescription} />
      {query.isPending && <LoadingState />}
      {query.isError && (asStatus(query.error) === 403 ? <AccessDeniedState permission="permissions.read" /> : <ErrorState />)}
      {matrix && (
        <section className="table-card role-matrix-card" aria-labelledby="permission-matrix-title">
          <div className="card-heading ops-card-heading"><div><h2 id="permission-matrix-title">{locale === "ar" ? "مخزون الصلاحيات" : "Permission inventory"}</h2><p><span className="numbers">{permissionCount}</span> {locale === "ar" ? "صلاحية للقراءة فقط" : "read-only permissions"}</p></div></div>
          <div className="role-matrix-grid">
            {groups.map((group) => (
              <article className="role-permission-group" key={group.group}>
                <div><h3>{group.group}</h3><span className="numbers">{group.permissions.length}</span></div>
                <div className="role-permission-list">
                  {group.permissions.map((permission) => <span className="role-permission-chip ltr" key={permission.key}>{"label" in permission ? permission.label.en : permission.key}</span>)}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

export function RoleDetailView({ roleId }: { roleId: string }) {
  const query = useRole(roleId);
  const { locale } = useLocale();
  const c = copy[locale];
  const role = query.data as DisplayRole | undefined;
  if (query.isPending) return <LoadingState />;
  if (query.isError) return asStatus(query.error) === 403 ? <AccessDeniedState permission="access.roles.read" /> : <ErrorState />;
  if (!role) return <EmptyState title={c.roleNotFound} />;
  return (
    <section className="admin-page">
      <PageHeader title={roleName(role, locale)} description={role.description ?? "Unavailable"} actions={roleKind(role) === "custom" ? <Link className="button" href={`/admin/roles/${role.id}/edit`}>{c.editRole}</Link> : undefined} />
      <section className="table-card role-detail-card" aria-labelledby="role-detail-title">
        <div className="role-detail-head">
          <div>
            <h2 id="role-detail-title">{roleName(role, locale)}</h2>
            <p className="ltr">{role.key}</p>
          </div>
          <div className="governance-badge-stack">
            <Badge value={getStatusLabel(locale, roleKind(role))} tone={roleKind(role) === "custom" ? "bronze" : "info"} />
            <Badge value={getStatusLabel(locale, roleStatus(role))} tone={roleStatus(role) === "active" ? "success" : "danger"} />
            {roleKind(role) === "system" && <Badge value={getStatusLabel(locale, "system")} />}
          </div>
        </div>
        <dl className="role-detail-grid">
          <div><dt>{c.assignments}</dt><dd className="numbers">{role.assignmentCount}</dd></div>
          <div><dt>{c.permissions}</dt><dd className="numbers">{role.permissionKeys.length}</dd></div>
          <div><dt>{c.approval}</dt><dd>{"approval" in role ? (role.approval.required ? (locale === "ar" ? "مطلوبة" : "Required") : (locale === "ar" ? "غير مطلوبة" : "Not required")) : "Unavailable"}</dd></div>
          <div><dt>{c.version}</dt><dd className="numbers">{role.version}</dd></div>
          <div><dt>{c.roleId}</dt><dd className="ltr">{role.id}</dd></div>
          <div><dt>{locale === "ar" ? "السياسة" : "Policy"}</dt><dd>{getStatusLabel(locale, roleKind(role))}</dd></div>
        </dl>
        <section className="role-detail-section" aria-labelledby="role-approval-title">
          <h2 id="role-approval-title">{c.governanceApproval}</h2>
          <p>{"approval" in role ? role.approval.description : "Unavailable"}</p>
        </section>
        <section className="role-detail-section" aria-labelledby="role-permissions-title">
          <h2 id="role-permissions-title">{c.permissions}</h2>
          <div className="role-permission-list role-permission-list-dense">
            {role.permissionKeys.map((key) => <span className="role-permission-chip ltr" key={key}>{key}</span>)}
          </div>
        </section>
      </section>
    </section>
  );
}

export function EditRoleView({ roleId }: { roleId: string }) {
  const query = useRole(roleId);
  const update = useUpdateRole(roleId);
  const { locale } = useLocale();
  const c = copy[locale];
  const role = query.data as DisplayRole | undefined;
  const [reason, setReason] = useState("Update custom role after governance review.");
  if (query.isPending) return <LoadingState />;
  if (query.isError) return asStatus(query.error) === 403 ? <AccessDeniedState permission="access.roles.read" /> : <ErrorState />;
  if (!role) return <EmptyState title={c.roleNotFound} />;
  if (roleKind(role) === "system") return <AccessDeniedState permission="access.roles.write immutable-system-role" />;
  return (
    <section className="admin-page">
      <PageHeader title={`${c.editRole}: ${roleName(role, locale)}`} description={c.customRoleDescription} />
      <form className="table-card role-edit-form" onSubmit={(event) => {
        event.preventDefault();
        update.mutate({ status: roleStatus(role) === "active" ? "disabled" : "active", reason, expectedVersion: role.version, submissionKey: "SUB-DEMO-UI-ROLE-UPDATE" });
      }}>
        <div className="role-detail-head">
          <div><h2>{roleName(role, locale)}</h2><p className="ltr">{role.key}</p></div>
          <div className="governance-badge-stack"><Badge value={getStatusLabel(locale, roleKind(role))} tone="bronze" /><Badge value={getStatusLabel(locale, roleStatus(role))} tone={roleStatus(role) === "active" ? "success" : "danger"} /></div>
        </div>
        <section className="role-create-section" aria-labelledby="role-edit-reason-title">
          <h2 id="role-edit-reason-title">{c.reason}</h2>
          <label><span className="sr-only">{c.reason}</span><textarea className="input" dir="auto" aria-label={c.reason} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
          {role.assignmentCount > 0 && <p role="alert">{locale === "ar" ? "لا يمكن تعطيل دور مسند حاليا." : "Assigned roles cannot be disabled."}</p>}
        </section>
        <div className="role-create-footer">
          <button className="button primary" disabled={update.isPending}>{roleStatus(role) === "active" ? c.disableRole : c.activateRole}</button>
        </div>
      </form>
      {update.isSuccess && <SuccessState message="Role updated safely." />}
      {update.isError && <ErrorState />}
    </section>
  );
}
