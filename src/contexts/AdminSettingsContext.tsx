import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_TIME_ZONE } from '@/lib/dateTime';
import { useAuth } from '@/contexts/AuthContext';

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

interface AdminSettingsContextValue {
  settings: AdminSettings;
  updateSettings: (updates: Partial<AdminSettings>) => Promise<void>;
  loading: boolean;
}

const AdminSettingsContext = createContext<AdminSettingsContextValue | null>(null);

// Map DB row to frontend AdminSettings
function mapRowToSettings(row: Record<string, unknown>): AdminSettings {
  return {
    increaseApprovalAbsoluteUsd: Number(row.increase_approval_absolute_usd) || DEFAULT_SETTINGS.increaseApprovalAbsoluteUsd,
    increaseApprovalPercent: Number(row.increase_approval_percent) || DEFAULT_SETTINGS.increaseApprovalPercent,
    timeZone: (row.time_zone as string) || DEFAULT_SETTINGS.timeZone,
    adminOverrideEnabled: Boolean(row.admin_override_enabled),
    showArchivedFiscalYears: Boolean(row.show_archived_fiscal_years),
  };
}

// Map frontend AdminSettings to DB columns
function mapSettingsToRow(settings: Partial<AdminSettings>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (settings.increaseApprovalAbsoluteUsd !== undefined) {
    row.increase_approval_absolute_usd = settings.increaseApprovalAbsoluteUsd;
  }
  if (settings.increaseApprovalPercent !== undefined) {
    row.increase_approval_percent = settings.increaseApprovalPercent;
  }
  if (settings.timeZone !== undefined) {
    row.time_zone = settings.timeZone;
  }
  if (settings.adminOverrideEnabled !== undefined) {
    row.admin_override_enabled = settings.adminOverrideEnabled;
  }
  if (settings.showArchivedFiscalYears !== undefined) {
    row.show_archived_fiscal_years = settings.showArchivedFiscalYears;
  }
  return row;
}

export function AdminSettingsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<AdminSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const rowIdRef = useRef<string | null>(null);

  // Load settings from DB on mount
  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        // Try to fetch the singleton row
        const { data, error } = await supabase
          .from('admin_settings')
          .select('*')
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('Failed to load admin settings:', error);
          if (mounted) setLoading(false);
          return;
        }

        if (data) {
          rowIdRef.current = data.id;
          if (mounted) setSettings(mapRowToSettings(data));
        } else if (profile?.role === 'admin') {
          // No row exists and user is admin - create default row
          const { data: newRow, error: insertError } = await supabase
            .from('admin_settings')
            .insert({ time_zone: DEFAULT_TIME_ZONE })
            .select()
            .single();

          if (insertError) {
            console.error('Failed to create admin settings:', insertError);
          } else if (newRow) {
            rowIdRef.current = newRow.id;
            if (mounted) setSettings(mapRowToSettings(newRow));
          }
        }
      } catch (err) {
        console.error('Error loading admin settings:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadSettings();

    return () => {
      mounted = false;
    };
  }, [profile?.role]);

  // Update settings in DB
  const updateSettings = useCallback(async (updates: Partial<AdminSettings>) => {
    // Optimistically update local state
    setSettings((prev) => ({ ...prev, ...updates }));

    const dbUpdates = mapSettingsToRow(updates);

    if (rowIdRef.current) {
      // Update existing row
      const { error } = await supabase
        .from('admin_settings')
        .update(dbUpdates)
        .eq('id', rowIdRef.current);

      if (error) {
        console.error('Failed to update admin settings:', error);
        // Could revert optimistic update here if needed
      }
    } else {
      // Try to upsert (in case row was created by another user)
      const { data, error } = await supabase
        .from('admin_settings')
        .upsert({ ...dbUpdates, time_zone: updates.timeZone ?? DEFAULT_TIME_ZONE })
        .select()
        .single();

      if (error) {
        console.error('Failed to upsert admin settings:', error);
      } else if (data) {
        rowIdRef.current = data.id;
      }
    }
  }, []);

  return (
    <AdminSettingsContext.Provider value={{ settings, updateSettings, loading }}>
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
