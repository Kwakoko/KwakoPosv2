export const SESSION_POLICY_LIMITS = {
  idleTimeoutMs: { min: 5 * 60_000, max: 24 * 60 * 60_000 },
  absoluteTimeoutMs: { min: 15 * 60_000, max: 7 * 24 * 60 * 60_000 },
  warningDurationMs: { min: 30_000, max: 10 * 60_000 },
  refreshTokenDurationMs: { min: 60 * 60_000, max: 30 * 24 * 60 * 60_000 },
  rememberMeDurationMs: { min: 60 * 60_000, max: 30 * 24 * 60 * 60_000 },
  offlineGracePeriodMs: { min: 60 * 60_000, max: 72 * 60 * 60_000 },
  heartbeatIntervalMs: { min: 60_000, max: 15 * 60_000 },
  refreshThresholdMs: { min: 60_000, max: 15 * 60_000 },
} as const;

export interface SessionPolicy {
  idleTimeoutMs: number;
  absoluteTimeoutMs: number;
  warningDurationMs: number;
  refreshTokenDurationMs: number;
  rememberMeDurationMs: number;
  offlineGracePeriodMs: number;
  heartbeatIntervalMs: number;
  refreshThresholdMs: number;
  forceLogoutOnBrowserClose: boolean;
  allowMultipleDevices: boolean;
  maxConcurrentSessions: number;
  forceLogoutOnPasswordChange: boolean;
  singleDeviceLogin: boolean;
  trustedDevices: boolean;
  autoRedirect: boolean;
  restoreLastPage: boolean;
}

export const DEFAULT_SESSION_POLICY: SessionPolicy = {
  idleTimeoutMs: 30 * 60_000,
  absoluteTimeoutMs: 8 * 60 * 60_000,
  warningDurationMs: 2 * 60_000,
  refreshTokenDurationMs: 14 * 24 * 60 * 60_000,
  rememberMeDurationMs: 30 * 24 * 60 * 60_000,
  offlineGracePeriodMs: 24 * 60 * 60_000,
  heartbeatIntervalMs: 5 * 60_000,
  refreshThresholdMs: 5 * 60_000,
  forceLogoutOnBrowserClose: false,
  allowMultipleDevices: true,
  maxConcurrentSessions: 5,
  forceLogoutOnPasswordChange: true,
  singleDeviceLogin: false,
  trustedDevices: true,
  autoRedirect: true,
  restoreLastPage: true,
};

function bounded(value: unknown, fallback: number, limits: { min: number; max: number }): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(limits.max, Math.max(limits.min, Math.round(numeric)));
}

export function normalizeSessionPolicy(input?: Partial<SessionPolicy> | null): SessionPolicy {
  const value = input || {};
  const idleTimeoutMs = bounded(value.idleTimeoutMs, DEFAULT_SESSION_POLICY.idleTimeoutMs, SESSION_POLICY_LIMITS.idleTimeoutMs);
  const absoluteTimeoutMs = bounded(value.absoluteTimeoutMs, DEFAULT_SESSION_POLICY.absoluteTimeoutMs, SESSION_POLICY_LIMITS.absoluteTimeoutMs);
  const warningDurationMs = Math.min(
    idleTimeoutMs - 30_000,
    bounded(value.warningDurationMs, DEFAULT_SESSION_POLICY.warningDurationMs, SESSION_POLICY_LIMITS.warningDurationMs),
  );
  return {
    ...DEFAULT_SESSION_POLICY,
    ...value,
    idleTimeoutMs,
    absoluteTimeoutMs,
    warningDurationMs: Math.max(30_000, warningDurationMs),
    refreshTokenDurationMs: bounded(value.refreshTokenDurationMs, DEFAULT_SESSION_POLICY.refreshTokenDurationMs, SESSION_POLICY_LIMITS.refreshTokenDurationMs),
    rememberMeDurationMs: bounded(value.rememberMeDurationMs, DEFAULT_SESSION_POLICY.rememberMeDurationMs, SESSION_POLICY_LIMITS.rememberMeDurationMs),
    offlineGracePeriodMs: bounded(value.offlineGracePeriodMs, DEFAULT_SESSION_POLICY.offlineGracePeriodMs, SESSION_POLICY_LIMITS.offlineGracePeriodMs),
    heartbeatIntervalMs: bounded(value.heartbeatIntervalMs, DEFAULT_SESSION_POLICY.heartbeatIntervalMs, SESSION_POLICY_LIMITS.heartbeatIntervalMs),
    refreshThresholdMs: bounded(value.refreshThresholdMs, DEFAULT_SESSION_POLICY.refreshThresholdMs, SESSION_POLICY_LIMITS.refreshThresholdMs),
    maxConcurrentSessions: Math.max(1, Math.min(50, Math.floor(Number(value.maxConcurrentSessions ?? DEFAULT_SESSION_POLICY.maxConcurrentSessions)) || DEFAULT_SESSION_POLICY.maxConcurrentSessions)),
    forceLogoutOnBrowserClose: Boolean(value.forceLogoutOnBrowserClose ?? DEFAULT_SESSION_POLICY.forceLogoutOnBrowserClose),
    allowMultipleDevices: Boolean(value.allowMultipleDevices ?? DEFAULT_SESSION_POLICY.allowMultipleDevices),
    forceLogoutOnPasswordChange: Boolean(value.forceLogoutOnPasswordChange ?? DEFAULT_SESSION_POLICY.forceLogoutOnPasswordChange),
    singleDeviceLogin: Boolean(value.singleDeviceLogin ?? DEFAULT_SESSION_POLICY.singleDeviceLogin),
    trustedDevices: Boolean(value.trustedDevices ?? DEFAULT_SESSION_POLICY.trustedDevices),
    autoRedirect: Boolean(value.autoRedirect ?? DEFAULT_SESSION_POLICY.autoRedirect),
    restoreLastPage: Boolean(value.restoreLastPage ?? DEFAULT_SESSION_POLICY.restoreLastPage),
  };
}

export const sessionPolicyToMinutes = (policy: SessionPolicy) => ({
  idleTimeoutMinutes: Math.round(policy.idleTimeoutMs / 60_000),
  absoluteTimeoutMinutes: Math.round(policy.absoluteTimeoutMs / 60_000),
  warningDurationSeconds: Math.round(policy.warningDurationMs / 1_000),
  refreshTokenDurationDays: Math.round(policy.refreshTokenDurationMs / (24 * 60 * 60_000)),
  rememberMeDurationDays: Math.round(policy.rememberMeDurationMs / (24 * 60 * 60_000)),
  forceLogoutOnBrowserClose: policy.forceLogoutOnBrowserClose,
  allowMultipleDevices: policy.allowMultipleDevices,
  maxConcurrentSessions: policy.maxConcurrentSessions,
  forceLogoutOnPasswordChange: policy.forceLogoutOnPasswordChange,
  singleDeviceLogin: policy.singleDeviceLogin,
  trustedDevices: policy.trustedDevices,
  autoRedirect: policy.autoRedirect,
  restoreLastPage: policy.restoreLastPage,
  offlineGracePeriodHours: Math.round(policy.offlineGracePeriodMs / (60 * 60_000)),
  heartbeatIntervalMinutes: Math.round(policy.heartbeatIntervalMs / 60_000),
});

export function sessionPolicyFromSettings(securityConfig: Record<string, unknown> | null | undefined): SessionPolicy {
  const cfg = securityConfig || {};
  const minutes = Number(cfg["sessionIdleTimeoutMinutes"] ?? cfg["inactivityLockMinutes"] ?? 30);
  const absoluteHours = Number(cfg["absoluteSessionLifetimeHours"] ?? 8);
  const warningMinutes = Number(cfg["sessionWarningMinutes"] ?? 2);
  const refreshDays = Number(cfg["refreshTokenLifetimeDays"] ?? 14);
  const rememberDays = Number(cfg["rememberMeDurationDays"] ?? 30);
  const offlineHours = Number(cfg["offlineGracePeriodHours"] ?? 24);
  const heartbeatMinutes = Number(cfg["heartbeatIntervalMinutes"] ?? 5);
  const refreshThresholdMinutes = Number(cfg["sessionRefreshThresholdMinutes"] ?? 5);
  return normalizeSessionPolicy({
    idleTimeoutMs: minutes * 60_000,
    absoluteTimeoutMs: absoluteHours * 60 * 60_000,
    warningDurationMs: warningMinutes * 60_000,
    refreshTokenDurationMs: refreshDays * 24 * 60 * 60_000,
    rememberMeDurationMs: rememberDays * 24 * 60 * 60_000,
    offlineGracePeriodMs: offlineHours * 60 * 60_000,
    heartbeatIntervalMs: heartbeatMinutes * 60_000,
    refreshThresholdMs: refreshThresholdMinutes * 60_000,
    forceLogoutOnBrowserClose: Boolean(cfg["forceLogoutOnBrowserClose"]),
    allowMultipleDevices: cfg["allowMultipleDevices"] !== false,
    maxConcurrentSessions: Number(cfg["maxConcurrentSessions"] ?? 5),
    forceLogoutOnPasswordChange: cfg["forceLogoutOnPasswordChange"] !== false,
    singleDeviceLogin: Boolean(cfg["singleDeviceLogin"]),
    trustedDevices: cfg["trustedDevices"] !== false,
    autoRedirect: cfg["autoRedirect"] !== false,
    restoreLastPage: cfg["restoreLastPage"] !== false,
  });
}
