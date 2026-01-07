import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { DEFAULT_TIME_ZONE } from '@/lib/dateTime';

export interface AdminSettings {
  increaseApprovalAbsoluteUsd: number;
  increaseApprovalPercent: number;
  timeZone: string;
  adminOverrideEnabled: boolean;
  showArchivedFiscalYears: boolean;
}

const DEFAULT_SETTINGS: AdminSettings = {
  increaseApprovalAbsoluteUsd: 5000,
  increaseApprovalPercent: 5,
  timeZone: DEFAULT_TIME_ZONE,
  adminOverrideEnabled: false,
  showArchivedFiscalYears: false,
};

const STORAGE_KEY = 'admin_settings_v1';

function loadSettings(): AdminSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        increaseApprovalAbsoluteUsd: parsed.increaseApprovalAbsoluteUsd ?? DEFAULT_SETTINGS.increaseApprovalAbsoluteUsd,
        increaseApprovalPercent: parsed.increaseApprovalPercent ?? DEFAULT_SETTINGS.increaseApprovalPercent,
        timeZone: parsed.timeZone ?? DEFAULT_SETTINGS.timeZone,
        adminOverrideEnabled: parsed.adminOverrideEnabled ?? DEFAULT_SETTINGS.adminOverrideEnabled,
        showArchivedFiscalYears: parsed.showArchivedFiscalYears ?? DEFAULT_SETTINGS.showArchivedFiscalYears,
      };
    }
  } catch {
    // Ignore parse errors
  }
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: AdminSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

interface AdminSettingsContextValue {
  settings: AdminSettings;
  updateSettings: (updates: Partial<AdminSettings>) => void;
}

const AdminSettingsContext = createContext<AdminSettingsContextValue | null>(null);

export function AdminSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AdminSettings>(loadSettings);

  // Persist settings whenever they change
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((updates: Partial<AdminSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  return (
    <AdminSettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </AdminSettingsContext.Provider>
  );
}

export function useAdminSettings(): AdminSettingsContextValue {
  const context = useContext(AdminSettingsContext);
  if (!context) {
    throw new Error('useAdminSettings must be used within AdminSettingsProvider');
  }
  return context;
}
