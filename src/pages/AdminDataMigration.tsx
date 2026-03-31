/**
 * Admin Data Migration Page
 * 
 * Allows migrating legacy localStorage data to the DB-backed stores.
 * This is a one-time migration tool for projects that had data in localStorage
 * before the cloud migration.
 */

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { useFiscalYearBudget, type FiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useRequests } from '@/contexts/RequestsContext';
import { supabase } from '@/integrations/supabase/client';
import { clearForecastCache } from '@/lib/forecastStore';
import { clearActualsCache } from '@/lib/actualsStore';
import { clearMatchingCache } from '@/lib/actualsMatchingStore';
import type { CostCenter } from '@/types/budget';
import type { SpendRequest } from '@/types/requests';
import type { ActualsTransaction } from '@/types/actuals';
import type { ApprovalAuditEvent } from '@/types/approvalAudit';
import type { Json } from '@/integrations/supabase/types';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Database,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  FileText,
  Receipt,
  ClipboardList,
  History,
  Link,
  ShieldAlert,
  ArrowRight,
  Trash2,
  HardDriveDownload,
} from 'lucide-react';

interface LegacyData {
  fiscalYears: FiscalYearBudget[];
  forecasts: Record<string, CostCenter[]>;
  actuals: Record<string, ActualsTransaction[]>;
  matching: Record<string, { matchesByTxnId: Record<string, unknown>; rulesByMerchantKey: Record<string, unknown> }>;
  requests: SpendRequest[];
  auditEvents: Record<string, ApprovalAuditEvent[]>;
  // Track which keys were actually found (for cleanup)
  foundKeys: string[];
}

interface MigrationSummary {
  fiscalYearsCount: number;
  forecastsCount: number;
  actualsCountByFY: Record<string, number>;
  matchingCountByFY: Record<string, { matches: number; rules: number }>;
  requestsCount: number;
  auditEventsCount: number;
}

// Known localStorage keys from legacy implementation
const LEGACY_KEYS = {
  fiscalYears: ['budget_fiscal_years_v1', 'fiscalYears'],
  forecasts: ['forecast_data_v1', 'forecasts', 'fy_forecasts'],
  actuals: ['actuals_transactions_v1', 'actualsTransactions'],
  matching: ['actuals_matching_v1', 'actualsMatching'],
  requests: ['spend_requests_v1', 'requests'],
  auditEvents: ['approval_audit_v1', 'auditEvents', 'approvalAudit'],
};

function tryParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function detectLegacyData(): LegacyData {
  const result: LegacyData = {
    fiscalYears: [],
    forecasts: {},
    actuals: {},
    matching: {},
    requests: [],
    auditEvents: {},
    foundKeys: [],
  };

  // Try known keys first
  for (const key of LEGACY_KEYS.fiscalYears) {
    const data = tryParseJson<FiscalYearBudget[]>(localStorage.getItem(key));
    if (data && Array.isArray(data) && data.length > 0 && data[0].id && data[0].costCenters) {
      result.fiscalYears = data;
      result.foundKeys.push(key);
      break;
    }
  }

  for (const key of LEGACY_KEYS.forecasts) {
    const data = tryParseJson<Record<string, CostCenter[]>>(localStorage.getItem(key));
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      result.forecasts = data;
      result.foundKeys.push(key);
      break;
    }
  }

  for (const key of LEGACY_KEYS.actuals) {
    const data = tryParseJson<Record<string, ActualsTransaction[]>>(localStorage.getItem(key));
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      result.actuals = data;
      result.foundKeys.push(key);
      break;
    }
  }

  for (const key of LEGACY_KEYS.matching) {
    const data = tryParseJson<Record<string, { matchesByTxnId: Record<string, unknown>; rulesByMerchantKey: Record<string, unknown> }>>(localStorage.getItem(key));
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      result.matching = data;
      result.foundKeys.push(key);
      break;
    }
  }

  for (const key of LEGACY_KEYS.requests) {
    const data = tryParseJson<SpendRequest[]>(localStorage.getItem(key));
    if (data && Array.isArray(data) && data.length > 0 && data[0].id) {
      result.requests = data;
      result.foundKeys.push(key);
      break;
    }
  }

  for (const key of LEGACY_KEYS.auditEvents) {
    const data = tryParseJson<Record<string, ApprovalAuditEvent[]>>(localStorage.getItem(key));
    if (data && typeof data === 'object' && Object.keys(data).length > 0) {
      result.auditEvents = data;
      result.foundKeys.push(key);
      break;
    }
  }

  // If nothing found via known keys, scan all localStorage keys
  if (result.fiscalYears.length === 0) {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      
      try {
        const value = localStorage.getItem(key);
        if (!value) continue;
        
        const data = JSON.parse(value);
        
        // Detect FiscalYearBudget array
        if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].costCenters && data[0].name) {
          if (result.fiscalYears.length === 0) {
            result.fiscalYears = data;
            result.foundKeys.push(key);
          }
        }
        
        // Detect SpendRequest array
        if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].vendorName !== undefined && data[0].approvalSteps) {
          if (result.requests.length === 0) {
            result.requests = data;
            result.foundKeys.push(key);
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }

  return result;
}

function computeSummary(data: LegacyData): MigrationSummary {
  const actualsCountByFY: Record<string, number> = {};
  for (const [fyId, txns] of Object.entries(data.actuals)) {
    actualsCountByFY[fyId] = txns.length;
  }

  const matchingCountByFY: Record<string, { matches: number; rules: number }> = {};
  for (const [fyId, matching] of Object.entries(data.matching)) {
    matchingCountByFY[fyId] = {
      matches: Object.keys(matching.matchesByTxnId || {}).length,
      rules: Object.keys(matching.rulesByMerchantKey || {}).length,
    };
  }

  let auditEventsCount = 0;
  for (const events of Object.values(data.auditEvents)) {
    auditEventsCount += events.length;
  }

  return {
    fiscalYearsCount: data.fiscalYears.length,
    forecastsCount: Object.keys(data.forecasts).length,
    actualsCountByFY,
    matchingCountByFY,
    requestsCount: data.requests.length,
    auditEventsCount,
  };
}

export default function AdminDataMigration() {
  const { toast } = useToast();
  const { settings } = useAdminSettings();
  const { fiscalYears: dbFiscalYears, refetch: refetchFiscalYears } = useFiscalYearBudget();
  const { requests: dbRequests } = useRequests();

  const [legacyData, setLegacyData] = useState<LegacyData | null>(null);
  const [summary, setSummary] = useState<MigrationSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [overwriteConfirmation, setOverwriteConfirmation] = useState('');
  const [clearLocalStorageAfter, setClearLocalStorageAfter] = useState(true);

  const clearLegacyKeys = () => {
    // Clear all found keys
    if (legacyData) {
      for (const key of legacyData.foundKeys) {
        localStorage.removeItem(key);
      }
    }
    
    // Also clear any remaining known legacy keys that might exist
    const allKnownKeys = [
      ...LEGACY_KEYS.fiscalYears,
      ...LEGACY_KEYS.forecasts,
      ...LEGACY_KEYS.actuals,
      ...LEGACY_KEYS.matching,
      ...LEGACY_KEYS.requests,
      ...LEGACY_KEYS.auditEvents,
    ];
    
    for (const key of allKnownKeys) {
      localStorage.removeItem(key);
    }
    
    // Re-detect to update UI
    const newData = detectLegacyData();
    setLegacyData(newData);
    setSummary(computeSummary(newData));
  };

  // Check if any legacy keys exist (for standalone clear button)
  const hasAnyLegacyKeys = (): boolean => {
    if (legacyData && legacyData.foundKeys.length > 0) return true;
    
    const allKnownKeys = [
      ...LEGACY_KEYS.fiscalYears,
      ...LEGACY_KEYS.forecasts,
      ...LEGACY_KEYS.actuals,
      ...LEGACY_KEYS.matching,
      ...LEGACY_KEYS.requests,
      ...LEGACY_KEYS.auditEvents,
    ];
    
    for (const key of allKnownKeys) {
      if (localStorage.getItem(key) !== null) return true;
    }
    
    return false;
  };

  const handleStandaloneClear = () => {
    clearLegacyKeys();
    toast({
      title: 'Legacy localStorage Cleared',
      description: 'Pre-cloud data has been removed from this browser. Cloud data is unaffected.',
    });
  };

  useEffect(() => {
    const data = detectLegacyData();
    setLegacyData(data);
    setSummary(computeSummary(data));
    setLoading(false);
  }, []);

  const hasLegacyData = summary && (
    summary.fiscalYearsCount > 0 ||
    summary.requestsCount > 0 ||
    summary.forecastsCount > 0 ||
    Object.keys(summary.actualsCountByFY).length > 0
  );

  const dbFiscalYearIds = new Set(dbFiscalYears.map(fy => fy.id));
  const dbRequestIds = new Set(dbRequests.map(r => r.id));

  const handleMerge = async () => {
    if (!legacyData) return;
    setMigrating(true);

    try {
      let insertedFYs = 0;
      let insertedRequests = 0;
      let insertedForecasts = 0;
      let insertedActuals = 0;
      let insertedMatching = 0;

      // 1. Insert FYs that don't exist
      for (const fy of legacyData.fiscalYears) {
        if (!dbFiscalYearIds.has(fy.id)) {
          const { id, name, status, archivedAt, archivedByRole, archivedJustification, previousStatusBeforeArchive } = fy;
          const { error } = await supabase.from('fiscal_years').insert({
            id,
            name,
            status,
            archived_at: archivedAt ?? null,
            archived_by_role: archivedByRole ?? null,
            archived_justification: archivedJustification ?? null,
            previous_status_before_archive: previousStatusBeforeArchive ?? null,
          } as any);
          if (!error) {
            insertedFYs++;
            dbFiscalYearIds.add(id);

            // Note: fy_forecasts table has been dropped; forecast data is in monthly_values

            // Insert actuals for this newly inserted FY
            if (legacyData.actuals[id] && legacyData.actuals[id].length > 0) {
              for (const txn of legacyData.actuals[id]) {
                await supabase.from('actuals_transactions').insert({
                  txn_id: txn.id,
                  fiscal_year_id: id,
                  amount: txn.amount,
                txn_date: txn.txnDate ?? null,
                  merchant: txn.merchantName ?? null,
                  source: txn.source ?? null,
                  raw: txn as unknown as Json,
                });
              }
              insertedActuals += legacyData.actuals[id].length;
            }

            // Upsert matching for this newly inserted FY (relational tables)
            if (legacyData.matching[id]) {
              const matchData = legacyData.matching[id];
              // Insert matches
              for (const [txnId, match] of Object.entries(matchData.matchesByTxnId ?? {})) {
                const m = match as any;
                await supabase.from('actuals_matches').upsert({
                  fiscal_year_id: id,
                  txn_id: txnId,
                  cost_center_id: m.costCenterId,
                  line_item_id: m.lineItemId,
                  match_source: m.matchSource ?? 'manual',
                  matched_at: m.matchedAt ?? new Date().toISOString(),
                  matched_by_role: m.matchedByRole ?? 'admin',
                  merchant_key: m.merchantKey ?? null,
                }, { onConflict: 'fiscal_year_id,txn_id' });
              }
              // Insert rules
              for (const [merchantKey, rule] of Object.entries(matchData.rulesByMerchantKey ?? {})) {
                const r = rule as any;
                await supabase.from('merchant_rules').upsert({
                  fiscal_year_id: id,
                  merchant_key: merchantKey,
                  cost_center_id: r.costCenterId,
                  line_item_id: r.lineItemId,
                  created_by_role: r.createdByRole ?? 'admin',
                }, { onConflict: 'fiscal_year_id,merchant_key' });
              }
              insertedMatching++;
            }
          }
        }
      }

      // 2. Insert requests that don't exist
      for (const req of legacyData.requests) {
        if (!dbRequestIds.has(req.id)) {
          const { error } = await supabase.from('spend_requests').insert({
            id: req.id,
            status: req.status,
            origin_fiscal_year_id: req.originFiscalYearId ?? null,
          } as any);
          if (!error) {
            insertedRequests++;
          }
        }
      }

      // 3. Insert audit events that don't exist (by checking if exists first)
      for (const [entityId, events] of Object.entries(legacyData.auditEvents)) {
        for (const event of events) {
          // Check if event already exists
          const { data: existing } = await supabase
            .from('approval_audit_events')
            .select('id')
            .eq('entity_type', 'request')
            .eq('entity_id', entityId)
            .eq('action', event.action)
            .eq('created_at', event.timestamp)
            .maybeSingle();

          if (!existing) {
            await supabase.from('approval_audit_events').insert({
              entity_type: 'request',
              entity_id: entityId,
              action: event.action,
              actor_role: event.actorRole ?? null,
              note: event.note ?? null,
              meta: event.meta as unknown as Json ?? null,
              created_at: event.timestamp,
            });
          }
        }
      }

      // Clear caches so next reads pull fresh DB data
      clearForecastCache();
      clearActualsCache();
      clearMatchingCache();

      await refetchFiscalYears();

      // Clear legacy localStorage if checkbox is checked
      if (clearLocalStorageAfter) {
        clearLegacyKeys();
        toast({
          title: 'Migration Complete',
          description: `Merged ${insertedFYs} FYs, ${insertedRequests} requests, ${insertedForecasts} forecasts, ${insertedActuals} actuals, ${insertedMatching} matching configs. Legacy localStorage keys cleared.`,
        });
      } else {
        toast({
          title: 'Migration Complete',
          description: `Merged ${insertedFYs} FYs, ${insertedRequests} requests, ${insertedForecasts} forecasts, ${insertedActuals} actuals, ${insertedMatching} matching configs. You can now close this page.`,
        });
      }
    } catch (err) {
      console.error('Migration error:', err);
      toast({
        title: 'Migration Failed',
        description: 'An error occurred during migration. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      setMigrating(false);
    }
  };

  const handleOverwrite = async () => {
    if (!legacyData || overwriteConfirmation !== 'OVERWRITE') return;
    if (!settings.adminOverrideEnabled) {
      toast({
        title: 'Admin Override Required',
        description: 'Enable Admin Override Mode to use destructive migration.',
        variant: 'destructive',
      });
      return;
    }

    setMigrating(true);

    try {
      // 1. Delete all existing data
      await supabase.from('approval_audit_events').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('spend_requests').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('actuals_matches').delete().neq('fiscal_year_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('merchant_rules').delete().neq('fiscal_year_id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('actuals_transactions').delete().neq('fiscal_year_id', '00000000-0000-0000-0000-000000000000');
      
      await supabase.from('fiscal_years').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // 2. Insert all legacy data
      let insertedFYs = 0;
      let insertedRequests = 0;

      for (const fy of legacyData.fiscalYears) {
        const { id, name, status, archivedAt, archivedByRole, archivedJustification, previousStatusBeforeArchive } = fy;
        const { error } = await supabase.from('fiscal_years').insert({
          id,
          name,
          status,
          archived_at: archivedAt ?? null,
          archived_by_role: archivedByRole ?? null,
          archived_justification: archivedJustification ?? null,
          previous_status_before_archive: previousStatusBeforeArchive ?? null,
        } as any);
        if (!error) {
          insertedFYs++;

          // Note: fy_forecasts table has been dropped; forecast data is in monthly_values

          // Insert actuals
          if (legacyData.actuals[id]) {
            for (const txn of legacyData.actuals[id]) {
              await supabase.from('actuals_transactions').insert({
                txn_id: txn.id,
                fiscal_year_id: id,
                amount: txn.amount,
                txn_date: txn.txnDate ?? null,
                merchant: txn.merchantName ?? null,
                source: txn.source ?? null,
                raw: txn as unknown as Json,
              });
            }
          }

          // Insert matching (relational tables)
          if (legacyData.matching[id]) {
            const matchData = legacyData.matching[id];
            for (const [txnId, match] of Object.entries(matchData.matchesByTxnId ?? {})) {
              const m = match as any;
              await supabase.from('actuals_matches').insert({
                fiscal_year_id: id,
                txn_id: txnId,
                cost_center_id: m.costCenterId,
                line_item_id: m.lineItemId,
                match_source: m.matchSource ?? 'manual',
                matched_at: m.matchedAt ?? new Date().toISOString(),
                matched_by_role: m.matchedByRole ?? 'admin',
                merchant_key: m.merchantKey ?? null,
              });
            }
            for (const [merchantKey, rule] of Object.entries(matchData.rulesByMerchantKey ?? {})) {
              const r = rule as any;
              await supabase.from('merchant_rules').insert({
                fiscal_year_id: id,
                merchant_key: merchantKey,
                cost_center_id: r.costCenterId,
                line_item_id: r.lineItemId,
                created_by_role: r.createdByRole ?? 'admin',
              });
            }
          }
        }
      }

      for (const req of legacyData.requests) {
        const { error } = await supabase.from('spend_requests').insert({
          id: req.id,
          status: req.status,
          origin_fiscal_year_id: req.originFiscalYearId ?? null,
        } as any);
        if (!error) {
          insertedRequests++;
        }
      }

      // Insert audit events
      for (const [entityId, events] of Object.entries(legacyData.auditEvents)) {
        for (const event of events) {
          await supabase.from('approval_audit_events').insert({
            entity_type: 'request',
            entity_id: entityId,
            action: event.action,
            actor_role: event.actorRole ?? null,
            note: event.note ?? null,
            meta: event.meta as unknown as Json ?? null,
            created_at: event.timestamp,
          });
        }
      }

      // Clear caches so next reads pull fresh DB data
      clearForecastCache();
      clearActualsCache();
      clearMatchingCache();

      await refetchFiscalYears();

      // Clear legacy localStorage if checkbox is checked
      if (clearLocalStorageAfter) {
        clearLegacyKeys();
        toast({
          title: 'Overwrite Complete',
          description: `Imported ${insertedFYs} FYs and ${insertedRequests} requests from localStorage. Legacy localStorage keys cleared.`,
        });
      } else {
        toast({
          title: 'Overwrite Complete',
          description: `Imported ${insertedFYs} FYs and ${insertedRequests} requests from localStorage. You can now close this page.`,
        });
      }

      setOverwriteConfirmation('');
    } catch (err) {
      console.error('Overwrite error:', err);
      toast({
        title: 'Overwrite Failed',
        description: 'An error occurred during overwrite. Check console for details.',
        variant: 'destructive',
      });
    } finally {
      setMigrating(false);
    }
  };

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Data Migration"
          description="Migrate legacy localStorage data to the cloud database."
        />
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Scanning localStorage...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Data Migration"
        description="Migrate legacy localStorage data to the cloud database."
      />

      <div className="space-y-6">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Legacy Data Detection</CardTitle>
            </div>
            <CardDescription>
              Scanning localStorage for data created before cloud migration.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!hasLegacyData ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>No Legacy Data Found</AlertTitle>
                <AlertDescription>
                  No localStorage data was detected that needs migration. Your data is already in the cloud.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>{summary?.fiscalYearsCount || 0} fiscal years</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{summary?.forecastsCount || 0} forecasts</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span>{Object.values(summary?.actualsCountByFY || {}).reduce((a, b) => a + b, 0)} transactions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {Object.values(summary?.matchingCountByFY || {}).reduce((a, b) => a + b.matches, 0)} matches, 
                      {Object.values(summary?.matchingCountByFY || {}).reduce((a, b) => a + b.rules, 0)} rules
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>{summary?.requestsCount || 0} requests</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span>{summary?.auditEventsCount || 0} audit events</span>
                  </div>
                </div>

                {/* Current DB stats */}
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">Current Cloud Database:</p>
                  <div className="flex gap-4 text-muted-foreground">
                    <span>{dbFiscalYears.length} fiscal years</span>
                    <span>{dbRequests.length} requests</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Standalone localStorage Cleanup */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDriveDownload className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">LocalStorage Cleanup (This Browser Only)</CardTitle>
            </div>
            <CardDescription>
              Clear legacy pre-cloud data stored in this browser without running a migration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasAnyLegacyKeys() ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Legacy keys detected: {legacyData?.foundKeys.length || 0} found key(s).
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear Legacy localStorage Now
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear legacy localStorage?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This removes pre-cloud data stored in this browser only. It does NOT delete cloud database data.
                        User preferences (e.g., selected fiscal year) will remain intact.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleStandaloneClear}>
                        Clear localStorage
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            ) : (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>No Legacy Keys Found</AlertTitle>
                <AlertDescription>
                  This browser has no pre-cloud localStorage data to clear.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Migration Actions */}
        {hasLegacyData && (
          <>
            {/* Cleanup checkbox - shared between actions */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clear-localstorage"
                    checked={clearLocalStorageAfter}
                    onCheckedChange={(checked) => setClearLocalStorageAfter(checked === true)}
                  />
                  <Label htmlFor="clear-localstorage" className="text-sm font-normal cursor-pointer">
                    Clear legacy localStorage after successful migration
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground mt-2 ml-6">
                  Removes old localStorage keys so data won't be detected again on reload.
                  Does not affect user preferences (e.g., selected fiscal year).
                </p>
              </CardContent>
            </Card>

            {/* Merge Action */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-primary" />
                  <CardTitle className="text-lg">Migrate (Merge Only)</CardTitle>
                </div>
                <CardDescription>
                  Safely add legacy data without overwriting existing cloud data.
                  Only inserts FYs and requests that don't already exist.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleMerge} disabled={migrating}>
                  {migrating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Merge Legacy Data
                </Button>
              </CardContent>
            </Card>

            {/* Overwrite Action */}
            <Card className="border-destructive/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5 text-destructive" />
                  <CardTitle className="text-lg text-destructive">Migrate (Overwrite)</CardTitle>
                </div>
                <CardDescription>
                  Delete ALL existing cloud data and replace with localStorage data.
                  This is destructive and cannot be undone.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!settings.adminOverrideEnabled && (
                  <Alert>
                    <ShieldAlert className="h-4 w-4" />
                    <AlertTitle>Admin Override Required</AlertTitle>
                    <AlertDescription>
                      Enable Admin Override Mode in Admin settings to use this feature.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="overwrite-confirm">
                    Type <strong>OVERWRITE</strong> to confirm
                  </Label>
                  <Input
                    id="overwrite-confirm"
                    placeholder="OVERWRITE"
                    value={overwriteConfirmation}
                    onChange={(e) => setOverwriteConfirmation(e.target.value)}
                    disabled={!settings.adminOverrideEnabled}
                  />
                </div>
                <Button 
                  variant="destructive"
                  onClick={handleOverwrite}
                  disabled={migrating || overwriteConfirmation !== 'OVERWRITE' || !settings.adminOverrideEnabled}
                >
                  {migrating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Overwrite Cloud Data
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
