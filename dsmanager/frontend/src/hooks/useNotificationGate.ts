import { useState, useCallback } from "react";

interface NotificationGateOptions {
  /** Initial tab override */
  initialTab?: string;
  /** A2UI: onNavigate removed - navigation is AI-driven, not URL-based */
}

interface NotificationGateReturn {
  /** Whether the loading barrier is currently shown */
  tabLoading: boolean;
  /** Whether composer is in approval mode */
  approvalMode: boolean;
  /** Current header tab */
  headerTab: string | null;
  /** Set the header tab directly (for internal use after barrier completes) */
  setHeaderTab: (tab: string | null) => void;
  /** Clear approval mode */
  clearApprovalMode: () => void;
  /** Intercept tab change — shows barrier unless suppressed */
  handleHeaderTabChange: (tabId: string | null) => void;
  /** Called when user picks a notification action */
  handleNotificationAction: (value: string) => void;
  /** Called when barrier completes or is skipped */
  finishTabChange: () => void;
  /** Called when user checks "Don't show this type" */
  handleSuppressNotification: (type: string) => void;
  /** Check if a notification type is suppressed */
  isNotificationSuppressed: (type: string) => boolean;
}

// A2UI: tabToPath removed - no URL routing, AI assembles surfaces

/**
 * Manages the notification gate barrier between Console ↔ Composer navigation.
 * Encapsulates tab state, loading state, approval mode, and notification preferences.
 */
export function useNotificationGate(options?: NotificationGateOptions): NotificationGateReturn {
  const { initialTab } = options || {};
  // A2UI: onNavigate removed - AI controls surfaces, not URL routing
  const [headerTab, setHeaderTabState] = useState<string | null>(() => {
    const saved = localStorage.getItem("activeHeaderTab");
    return saved || initialTab || "console";
  });
  const [tabLoading, setTabLoading] = useState(false);
  const [approvalMode, setApprovalMode] = useState(false);

  const setHeaderTab = (tab: string | null) => {
    setHeaderTabState(tab);
    if (tab) {
      localStorage.setItem("activeHeaderTab", tab);
    }
  };

  const isNotificationSuppressed = useCallback((type: string): boolean => {
    try {
      const raw = localStorage.getItem("graceSettings");
      if (!raw) return false;
      const s = JSON.parse(raw);
      return s?.notifications?.[type] === false;
    } catch {
      return false;
    }
  }, []);

  const handleSuppressNotification = useCallback((type: string) => {
    try {
      const raw = localStorage.getItem("graceSettings");
      const s = raw ? JSON.parse(raw) : {};
      if (!s.notifications) s.notifications = {};
      s.notifications[type] = false;
      localStorage.setItem("graceSettings", JSON.stringify(s));
    } catch {
      /* ignore */
    }
  }, []);

  const handleHeaderTabChange = useCallback(
    (tabId: string | null) => {
      // A2UI: Just update internal state - AI assembly handles surface changes
      if (tabId !== headerTab) {
        setHeaderTab(tabId);
      }
    },
    [headerTab],
  );

  const handleNotificationAction = useCallback((value: string) => {
    if (value === "approve") {
      setApprovalMode(true);
      (window as any).__tabTarget = "composer";
    } else if (value === "view") {
      (window as any).__tabTarget = "console";
    }
  }, []);

  const finishTabChange = useCallback(() => {
    const target = (window as any).__tabTarget;
    setTabLoading(false);
    if (target) {
      setHeaderTab(target);
      // A2UI: No URL navigation - AI controls surfaces
    }
    delete (window as any).__tabTarget;
  }, []);

  const clearApprovalMode = useCallback(() => setApprovalMode(false), []);

  return {
    tabLoading,
    approvalMode,
    headerTab,
    setHeaderTab,
    clearApprovalMode,
    handleHeaderTabChange,
    handleNotificationAction,
    finishTabChange,
    handleSuppressNotification,
    isNotificationSuppressed,
  };
}
