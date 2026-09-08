"use client";

import { usePathname } from "next/navigation";
import {
  Languages,
  Menu,
  Moon,
  PanelRightClose,
  ShieldCheck,
  Sun,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { setSimulatedRole, useSimulatedRole } from "@/core/auth/use-simulated-role";
import type { AdminRole } from "@/core/permissions/permissions";
import { hasPermission } from "@/core/permissions/role-map";
import { ApiError } from "@/core/api/errors";
import { mocksEnabled } from "@/core/config/runtime";
import { ADMIN_ROLES } from "@/core/permissions/permissions";
import { applyDocumentLocale, type Locale } from "@/core/localization/direction";
import { getNavigationLabel, getRoleLabel } from "@/core/localization/display-labels";
import { LocaleProvider, useLocale, useT } from "@/core/localization/provider";
import { t } from "@/core/localization/messages";
import type { DateRangeInput, NavigationGroup } from "@/features/foundation/contracts";
import { useAdminNavigation, useAdminSession } from "@/features/foundation/hooks";
import { AttentionPanel } from "./AttentionPanel";
import { AccessDenied } from "./AccessDenied";
import { DateRangeControl } from "./DateRangeControl";
import { EnvironmentIndicator } from "./EnvironmentIndicator";
import { GlobalSearch } from "./GlobalSearch";
import { RoleSwitcher } from "./RoleSwitcher";
import { SessionExpired } from "./SessionExpired";
import { SidebarNavigationList } from "./SidebarAccordion";
import { ToastRegion } from "./ToastRegion";
import { buildSidebarSections, nextTheme, resolveRoutePermission } from "./shell-state";
import { useAdminIdentity } from "@/app/providers";

const defaultRange = { start: "2026-06-28", end: "2026-07-27", preset: "30d" as const };

function Sidebar({
  compact,
  groups,
  mobile = false,
  close,
}: {
  compact: boolean;
  groups: NavigationGroup[];
  mobile?: boolean;
  close?: () => void;
}) {
  const pathname = usePathname();
  const { locale } = useLocale();
  const translate = useT();
  const sections = buildSidebarSections(groups, pathname);
  return (
    <aside
      aria-label={mobile ? translate("shell.mainNavigation") : undefined}
      className={`sidebar ${compact ? "sidebar-compact" : ""} ${mobile ? "sidebar-mobile" : ""}`}
      role={mobile ? "dialog" : undefined}
    >
      <div className="brand">
        <span className="brand-mark">م</span>
        {!compact && <div><strong>{translate("shell.appName")}</strong><small>{translate("shell.appSubtitle")}</small></div>}
        {mobile && <button className="icon-button sidebar-close" onClick={close} aria-label={translate("shell.mobileClose")}><X size={20} /></button>}
      </div>
      <nav aria-label={translate("shell.mainNavigation")}>
        {sections.map((group) => (
          <div className="nav-group" key={group.id}>
            {!compact && <p>{getNavigationLabel(locale, group.id, group.labelKey)}</p>}
            <SidebarNavigationList close={close} compact={compact && !mobile} key={`${group.id}:${pathname}`} nodes={group.items} pathname={pathname} />
          </div>
        ))}
      </nav>
      {!compact && <div className="sidebar-note"><ShieldCheck size={18} /><span>{translate("shell.financialDataHidden")}</span></div>}
    </aside>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const identity = useAdminIdentity();
  const pathname = usePathname();
  const demoMode = !identity.enabled || mocksEnabled();
  const session = useAdminSession(identity.actorId);
  const [compact, setCompact] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [locale, setLocale] = useState<Locale>("ar");
  const [range, setRange] = useState<DateRangeInput>(defaultRange);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const simulatedRole = useSimulatedRole();
  const serverRole = session.data?.roleKeys.find((key): key is AdminRole =>
    ADMIN_ROLES.some((role) => role === key),
  );
  const role = demoMode ? simulatedRole : (serverRole ?? "support-agent");
  const effectivePermissions = new Set(session.data?.effectivePermissionKeys ?? []);
  const navigation = useAdminNavigation(role);
  const groups = navigation.data?.groups ?? [];
  // Communications is temporarily hidden from the Admin Dashboard sidebar.
  // Its implementation, routes, and navigation configuration are intentionally preserved for future use.
  // Restore it by adding the communications navigation configuration back to this rendered sidebar array.
  const sidebarGroups = groups.filter((group) => group.id !== "communications");
  const routePermission = resolveRoutePermission(pathname);
  const deniedPermission = routePermission === "forbidden"
    ? routePermission
    : routePermission && !(demoMode
      ? hasPermission(role, routePermission)
      : identity.loaded && effectivePermissions.has(routePermission))
      ? routePermission
      : null;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => applyDocumentLocale(locale), [locale]);

  const closeMobile = () => {
    setMobileOpen(false);
    requestAnimationFrame(() => mobileTrigger.current?.focus());
  };

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        requestAnimationFrame(() => mobileTrigger.current?.focus());
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  const changeRole = (nextRole: AdminRole) => {
    setSimulatedRole(nextRole);
  };

  if (session.error instanceof ApiError && session.error.code === "session_expired") {
    return <SessionExpired temporary onReturn={() => window.location.assign("/admin")} />;
  }

  return (
    <LocaleProvider locale={locale} setLocale={setLocale}>
    <div className={`admin-shell ${compact ? "shell-compact" : ""}`} data-admin-shell>
      <Sidebar compact={compact} groups={sidebarGroups} />
      {mobileOpen && (
        <div
          className="mobile-overlay"
          role="presentation"
          onMouseDown={closeMobile}
          onKeyDown={(event) => {
            if (event.key === "Escape") closeMobile();
          }}
        >
          <div onMouseDown={(event) => event.stopPropagation()}>
            <Sidebar close={closeMobile} compact={false} groups={sidebarGroups} mobile />
          </div>
        </div>
      )}
      <div className="admin-main">
        <header className="topbar">
          <div className="topbar-start">
            <button ref={mobileTrigger} className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label={t(locale, "shell.mobileOpen")}><Menu size={20} /></button>
            <button className="icon-button desktop-collapse" onClick={() => setCompact((value) => !value)} aria-label={compact ? t(locale, "shell.expandSidebar") : t(locale, "shell.collapseSidebar")}><PanelRightClose size={20} /></button>
            <GlobalSearch role={role} />
            <DateRangeControl value={range} onChange={setRange} />
          </div>
          <div className="topbar-actions">
            <EnvironmentIndicator environment={demoMode ? "development" : "production"} locale={locale} />
            {demoMode && <RoleSwitcher role={role} onChange={changeRole} />}
            {demoMode && <span className="development-disclaimer">{t(locale, "shell.developmentDisclaimer")}</span>}
            <button className="icon-button" aria-label={t(locale, "shell.languageToggle")} onClick={() => setLocale((value) => value === "ar" ? "en" : "ar")}><Languages size={19} /></button>
            <button className="icon-button" onClick={() => setTheme(nextTheme)} aria-label={t(locale, "shell.themeToggle")}>
              {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <AttentionPanel role={role} />
            <div className="profile">
              <div className="avatar profile-photo" role="img" aria-label={t(locale, "shell.profilePhoto", { name: session.data?.displayName ?? "Waleed" })} />
              <div><strong>{session.data?.displayName ?? "Waleed"}</strong><small>{getRoleLabel(locale, role)}</small></div>
            </div>
          </div>
        </header>
        <main>{deniedPermission ? <AccessDenied permission={deniedPermission} /> : children}</main>
      </div>
      <ToastRegion messages={[]} />
    </div>
    </LocaleProvider>
  );
}
