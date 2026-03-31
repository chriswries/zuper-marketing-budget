/**
 * Actuals Page
 * 
 * This page displays imported actuals rollups in a read-only sheet-style layout.
 * It shows matched transactions aggregated by cost center and line item.
 * 
 * Matching/rollups are implemented in ActualsMatching.tsx (Track B Prompt B2).
 * Transaction import is handled in ActualsImport.tsx (Track B Prompt B1).
 */

import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, DollarSign, TrendingUp, Receipt, Search, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { getVisibleFiscalYears } from '@/lib/fiscalYearVisibility';
import { useEnsureActualsLoaded } from '@/hooks/useEnsureActualsLoaded';
import type { LineItemRollup } from '@/lib/actualsRollup';
import type { CostCenter, MonthlyValues, LineItem } from '@/types/budget';
import { formatCurrency } from '@/lib/format';

type SortMode = 'alpha' | 'total';

// Legacy localStorage keys to clean up
const LEGACY_ACTUALS_KEYS = [
  'actuals_transactions_v1',
  'actualsTransactions',
  'actuals_matching_v1',
  'actualsMatching',
];

// Clean up legacy localStorage artifacts
function cleanupLegacyActualsStorage(): void {
  for (const key of LEGACY_ACTUALS_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
}

export default function Actuals() {
  const navigate = useNavigate();
  const { fiscalYears, selectedFiscalYearId, setSelectedFiscalYearId, selectedFiscalYear } = useFiscalYearBudget();
  const { settings } = useAdminSettings();
  
  const visibleFiscalYears = getVisibleFiscalYears(fiscalYears, settings.showArchivedFiscalYears);

  // Determine if we have an active FY
  const isActiveFY = selectedFiscalYear?.status === 'active';

  // Clean up legacy localStorage artifacts on mount when no active FY
  useEffect(() => {
    if (!isActiveFY) {
      cleanupLegacyActualsStorage();
    }
  }, [isActiveFY]);

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [ccSort, setCcSort] = useState<SortMode>('alpha');
  const [liSort, setLiSort] = useState<SortMode>('alpha');
  const [showZeroRows, setShowZeroRows] = useState(false);

  // Use the hook to ensure actuals are loaded from DB before computing rollup
  const { isLoading: isLoadingActuals, rollup } = useEnsureActualsLoaded(
    isActiveFY ? selectedFiscalYearId : null,
    isActiveFY ? selectedFiscalYear : null
  );

  // Build CostCenter[] structure for SheetTable from rollup
  const displayCostCenters = useMemo((): CostCenter[] => {
    if (!selectedFiscalYear || !rollup) {
      return [];
    }

    const searchLower = searchQuery.toLowerCase().trim();

    // Create a map of line item rollups by costCenterId::lineItemId
    const rollupByKey = new Map<string, LineItemRollup>();
    for (const li of rollup.lineItems) {
      rollupByKey.set(`${li.costCenterId}::${li.lineItemId}`, li);
    }

    // Build cost centers from the fiscal year structure
    const result: CostCenter[] = [];

    for (const cc of selectedFiscalYear.costCenters) {
      const lineItems: LineItem[] = [];

      for (const li of cc.lineItems) {
        const key = `${cc.id}::${li.id}`;
        const liRollup = rollupByKey.get(key);
        
        // Skip zero rows if not showing them
        const hasActuals = liRollup && liRollup.actualTotal > 0;
        if (!showZeroRows && !hasActuals) continue;

        // Apply search filter
        if (searchLower) {
          const matchesSearch = 
            li.name.toLowerCase().includes(searchLower) ||
            (li.vendor?.name?.toLowerCase().includes(searchLower)) ||
            cc.name.toLowerCase().includes(searchLower);
          if (!matchesSearch) continue;
        }

        // Build actualValues from rollup or zero
        const actualValues: MonthlyValues = liRollup 
          ? { ...liRollup.actualByMonth }
          : { feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0, aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0 };

        lineItems.push({
          ...li,
          actualValues,
        });
      }

      // Skip cost centers with no matching line items
      if (lineItems.length === 0) continue;

      // Sort line items
      if (liSort === 'alpha') {
        lineItems.sort((a, b) => a.name.localeCompare(b.name));
      } else {
        // Sort by actual total descending
        lineItems.sort((a, b) => {
          const totalA = Object.values(a.actualValues).reduce((sum, v) => sum + v, 0);
          const totalB = Object.values(b.actualValues).reduce((sum, v) => sum + v, 0);
          return totalB - totalA;
        });
      }

      result.push({
        ...cc,
        lineItems,
      });
    }

    // Sort cost centers
    if (ccSort === 'alpha') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Sort by total actuals descending
      result.sort((a, b) => {
        const totalA = a.lineItems.reduce((sum, li) => 
          sum + Object.values(li.actualValues).reduce((s, v) => s + v, 0), 0);
        const totalB = b.lineItems.reduce((sum, li) => 
          sum + Object.values(li.actualValues).reduce((s, v) => s + v, 0), 0);
        return totalB - totalA;
      });
    }

    return result;
  }, [selectedFiscalYear, rollup, searchQuery, ccSort, liSort, showZeroRows]);

  const summary = rollup?.summary ?? { matchedCount: 0, matchedTotal: 0, unmatchedCount: 0, unmatchedTotal: 0, orphanedMatchCount: 0 };
  const totalSpend = summary.matchedTotal + summary.unmatchedTotal;
  const hasUnmatched = summary.unmatchedCount > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actuals"
        description="Matched actual spend from imported transactions — reconciled by cost center and line item."
      />

      {/* Fiscal Year Selector */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <Label htmlFor="fy-select">Fiscal Year</Label>
            <Select
              value={selectedFiscalYearId ?? ''}
              onValueChange={setSelectedFiscalYearId}
            >
              <SelectTrigger id="fy-select" className="w-[200px]">
                <SelectValue placeholder="Select fiscal year" />
              </SelectTrigger>
              <SelectContent>
                {visibleFiscalYears.map((fy) => (
                  <SelectItem key={fy.id} value={fy.id}>
                    {fy.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Empty state when no active FY */}
      {!isActiveFY ? (
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <CardTitle className="text-center">No Active Actuals</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Create and approve a fiscal year budget to generate a forecast and begin tracking actuals.
            </p>
            <Button onClick={() => navigate('/budget')}>
              Go to Budget
            </Button>
          </CardContent>
        </Card>
      ) : isLoadingActuals ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading actuals...</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalSpend)}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.matchedCount + summary.unmatchedCount} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Matched Actuals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatCurrency(summary.matchedTotal)}</div>
                <p className="text-xs text-muted-foreground">
                  {summary.matchedCount} transactions
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Unmatched Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${hasUnmatched ? 'text-orange-600' : 'text-muted-foreground'}`}>
                  {formatCurrency(summary.unmatchedTotal)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.unmatchedCount} transactions
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Unmatched Warning Callout */}
          {hasUnmatched && (
            <Alert variant="default" className="border-orange-300 bg-orange-50">
              <AlertTriangle className="h-4 w-4 text-orange-600" />
              <AlertTitle className="text-orange-800">Unmatched transactions</AlertTitle>
              <AlertDescription className="text-orange-700">
                <span className="block mb-2">
                  {summary.unmatchedCount} transaction(s) totaling {formatCurrency(summary.unmatchedTotal)} are not matched to line items and won't appear in the actuals rollup below.
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/admin/actuals/match')}
                  className="border-orange-400 text-orange-700 hover:bg-orange-100"
                >
                  Go to Actuals Matching
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Orphaned Match Warning */}
          {summary.orphanedMatchCount > 0 && (
            <Alert variant="default" className="border-yellow-300 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertTitle className="text-yellow-800">Orphaned matches detected</AlertTitle>
              <AlertDescription className="text-yellow-700">
                {summary.orphanedMatchCount} transaction(s) are matched to cost centers or line items that no longer exist. 
                These are counted as unmatched until re-matched.
              </AlertDescription>
            </Alert>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search line items, vendors, cost centers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-[300px]"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="cc-sort" className="text-sm text-muted-foreground whitespace-nowrap">
                    Cost Center:
                  </Label>
                  <Select value={ccSort} onValueChange={(v) => setCcSort(v as SortMode)}>
                    <SelectTrigger id="cc-sort" className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alpha">A → Z</SelectItem>
                      <SelectItem value="total">Spend (High → Low)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label htmlFor="li-sort" className="text-sm text-muted-foreground whitespace-nowrap">
                    Line Item:
                  </Label>
                  <Select value={liSort} onValueChange={(v) => setLiSort(v as SortMode)}>
                    <SelectTrigger id="li-sort" className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alpha">A → Z</SelectItem>
                      <SelectItem value="total">Spend (High → Low)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show-zero"
                    checked={showZeroRows}
                    onChange={(e) => setShowZeroRows(e.target.checked)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <Label htmlFor="show-zero" className="text-sm text-muted-foreground cursor-pointer">
                    Show zero rows
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sheet Table */}
          {displayCostCenters.length === 0 ? (
            <Card className="border-muted">
              <CardContent className="py-12 text-center text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium">No actuals data to display</p>
                <p className="text-sm">
                  {searchQuery 
                    ? 'No line items match your search criteria.'
                    : 'Import and match transactions to see actuals here.'}
                </p>
                {!searchQuery && (
                  <div className="flex justify-center gap-2 mt-4">
                    <Button variant="outline" onClick={() => navigate('/admin/actuals')}>
                      Import Actuals
                    </Button>
                    <Button variant="outline" onClick={() => navigate('/admin/actuals/match')}>
                      Match Transactions
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <SheetTable 
              costCenters={displayCostCenters} 
              valueType="actualValues" 
              editable={false}
            />
          )}
        </>
      )}
    </div>
  );
}