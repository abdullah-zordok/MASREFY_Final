export type SystemStatus =
  | "operational"
  | "degraded"
  | "partial-outage"
  | "major-outage"
  | "maintenance";
export type Severity = "info" | "low" | "medium" | "high" | "critical";
export type ViewState = "default" | "loading" | "empty" | "error";
export type DateRange = "7d" | "30d" | "90d";

export interface Metric {
  label: string;
  value: string;
  change?: number;
  note?: string;
  tone?: "default" | "attention" | "premium";
  context?: string;
}

export interface ChartPoint {
  name: string;
  current: number;
  previous?: number;
  secondary?: number;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  country: "السعودية" | "الإمارات";
  platform: "iOS" | "Android";
  plan: "Free" | "Basic" | "Premium";
  status: "active" | "suspended" | "pending";
  verification: "verified" | "pending";
  risk: "low" | "medium" | "high";
  registeredAt: string;
  lastActive: string;
  language: string;
  currency: "SAR" | "AED";
  timezone: string;
  appVersion: string;
  accounts: number;
  transactions: number;
  goals: number;
  lastSync: string;
  importSources: number;
}

export interface ImportRecord {
  id: string;
  user?: string;
  source: string;
  bank?: string;
  platform?: "iOS" | "Android";
  failureType: string;
  parserVersion?: string;
  attempts: number;
  revision: number;
  severity: Severity;
  time: string;
  status:
    | "received"
    | "processing"
    | "review"
    | "complete"
    | "failed"
    | "cancelled"
    | "unsupported";
  appVersion?: string;
  sanitizedResult: string;
}

export interface ServiceHealth {
  name: string;
  status: SystemStatus;
  uptime: string;
  latency: string;
  errorRate: string;
  lastIncident: string;
  lastCheck: string;
}

export interface Incident {
  id: string;
  severity: Severity;
  service: string;
  title: string;
  detail: string;
  startedAt: string;
  status: string;
  affectedArea: string;
  timeline: string[];
}
