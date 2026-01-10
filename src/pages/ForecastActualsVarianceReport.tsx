import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY, saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { useEnsureActualsLoaded } from '@/hooks/useEnsureActualsLoaded';
import {
  buildForecastActualsReport,
  ForecastActualsCostCenterRow,
  ForecastActualsLineItemRow,
  ForecastActualsReportResult,
} from '@/lib/forecastActualsVariance';
import { downloadCsv, CsvColumn } from '@/lib/exportCsv';
import { MONTHS, MONTH_LABELS, CostCenter, Month } from '@/types/budget';
import { FileSpreadsheet, TrendingUp, ChevronDown, ChevronRight, Download, BarChart3, X, Receipt, ArrowLeft, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { ScopeMode, sumYTD, getCurrentFiscalMonth, getLatestActualsMonthFromLineItems } from '@/lib/ytdHelpers';

// Helper to compute variance percentage
function computeVariancePct(variance: number, forecast: number): number | null {
  if (forecast === 0) return null;
  return variance / forecast;
}

type SortOption = 'variance_abs' | 'variance_pct' | 'alpha';

// Chart helper: Get top cost centers by absolute variance
function getTopCostCenters(
  costCenters: ForecastActualsCostCenterRow[],
  limit = 10
): { costCenterId: string; name: string; variance: number }[] {
  return [...costCenters]
    .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
    .slice(0, limit)
    .map(cc => ({
      costCenterId: cc.costCenterId,
      name: cc.costCenterName,
      variance: cc.variance,
    }));
}

// Chart helper: Get monthly totals for a single cost center from its filtered line items
function getMonthlyTotalsForCostCenter(
  cc: ForecastActualsCostCenterRow
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const month of MONTHS) {
    totals[month] = cc.lineItems.reduce(
      (sum, item) => sum + (item.varianceByMonth[month] || 0),
      0
    );
  }
  return totals;
}

function formatCurrency(value: number): string {
  const sign = value >= 0 ? '' : '-';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatVariance(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

export default function ForecastActualsVarianceReport() {
  const navigate = useNavigate();
  const { selectedFiscalYear, selectedFiscalYearId, setSelectedFiscalYearId } = useFiscalYearBudget();
  
  const [forecastCCs, setForecastCCs] = useState<CostCenter[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  // Filters
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [contractedOnly, setContractedOnly] = useState(false);
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('variance_abs');
  
  // Scope controls: FY vs YTD
  const [scopeMode, setScopeMode] = useState<ScopeMode>('fy');
  const [asOfMonth, setAsOfMonth] = useState<Month>(getCurrentFiscalMonth());
  const [asOfMonthInitialized, setAsOfMonthInitialized] = useState(false);
  
  // Expanded cost centers
  const [expandedCCs, setExpandedCCs] = useState<Set<string>>(new Set());
  
  // Load/initialize forecast
  useEffect(() => {
    if (!selectedFiscalYearId || !selectedFiscalYear) {
      setForecastCCs(null);
      setInitialized(true);
      return;
    }
    
    if (selectedFiscalYear.status !== 'active') {
      setForecastCCs(null);
      setInitialized(true);
      return;
    }
    
    let forecast = loadForecastForFY(selectedFiscalYearId);
    
    if (!forecast) {
      // Initialize from approved budget
      forecast = createForecastCostCentersFromBudget(selectedFiscalYear);
      saveForecastForFY(selectedFiscalYearId, forecast);
    }
    
    setForecastCCs(forecast);
    setInitialized(true);
  }, [selectedFiscalYearId, selectedFiscalYear]);
  
  // Use the hook to ensure actuals are loaded from DB before computing rollup
  const isActiveFY = selectedFiscalYear?.status === 'active';
  const { isLoading: isLoadingActuals, rollup: actualsRollup } = useEnsureActualsLoaded(
    isActiveFY ? selectedFiscalYearId : null,
    isActiveFY ? selectedFiscalYear : null
  );
  
  // Build variance report
  const report = useMemo(() => {
    if (!forecastCCs || !actualsRollup) return null;
    return buildForecastActualsReport(forecastCCs, actualsRollup);
  }, [forecastCCs, actualsRollup]);
  
  // Auto-set asOfMonth to latest month with actuals (only once)
  useEffect(() => {
    if (report && !asOfMonthInitialized) {
      const allActualsByMonth = report.costCenters.flatMap(cc => 
        cc.lineItems.map(li => li.actualsByMonth)
      );
      const latestMonth = getLatestActualsMonthFromLineItems(allActualsByMonth);
      if (latestMonth) {
        setAsOfMonth(latestMonth);
      }
      setAsOfMonthInitialized(true);
    }
  }, [report, asOfMonthInitialized]);
  
  // Table ref for scroll-to-table
  const tableRef = useRef<HTMLDivElement | null>(null);
  
  // Filter, apply YTD if needed, recompute totals, and sort
  const filteredReport = useMemo(() => {
    if (!report) return null;
    
    let costCenters = report.costCenters;
    
    // Cost center filter
    if (costCenterFilter !== 'all') {
      costCenters = costCenters.filter(cc => cc.costCenterId === costCenterFilter);
    }
    
    // Apply line item filters and recompute cost center totals
    costCenters = costCenters.map(cc => {
      let lineItems = cc.lineItems;
      
      if (contractedOnly) {
        lineItems = lineItems.filter(item => item.isContracted);
      }
      
      if (varianceOnly) {
        lineItems = lineItems.filter(item => item.variance !== 0);
      }
      
      // Apply YTD calculation if scopeMode is 'ytd'
      if (scopeMode === 'ytd') {
        lineItems = lineItems.map(item => {
          const forecastTotal = sumYTD(item.forecastByMonth, asOfMonth);
          const actualsTotal = sumYTD(item.actualsByMonth, asOfMonth);
          const variance = actualsTotal - forecastTotal;
          const variancePct = forecastTotal === 0 ? null : variance / forecastTotal;
          
          return {
            ...item,
            forecastTotal,
            actualsTotal,
            variance,
            variancePct,
          };
        });
      }
      
      // Recompute cost center totals from filtered line items
      const ccForecastTotal = lineItems.reduce((sum, item) => sum + item.forecastTotal, 0);
      const ccActualsTotal = lineItems.reduce((sum, item) => sum + item.actualsTotal, 0);
      const ccVariance = ccActualsTotal - ccForecastTotal;
      const ccVariancePct = computeVariancePct(ccVariance, ccForecastTotal);
      
      return {
        ...cc,
        lineItems,
        forecastTotal: ccForecastTotal,
        actualsTotal: ccActualsTotal,
        variance: ccVariance,
        variancePct: ccVariancePct,
      };
    }).filter(cc => cc.lineItems.length > 0 || (!contractedOnly && !varianceOnly));
    
    // Sort line items within each cost center
    costCenters = costCenters.map(cc => {
      const sortedItems = [...cc.lineItems];
      
      switch (sortBy) {
        case 'variance_abs':
          sortedItems.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
          break;
        case 'variance_pct':
          sortedItems.sort((a, b) => {
            const aPct = a.variancePct ?? 0;
            const bPct = b.variancePct ?? 0;
            return Math.abs(bPct) - Math.abs(aPct);
          });
          break;
        case 'alpha':
          sortedItems.sort((a, b) => a.name.localeCompare(b.name));
          break;
      }
      
      return { ...cc, lineItems: sortedItems };
    });
    
    // Sort cost centers by recomputed variance
    if (sortBy === 'variance_abs') {
      costCenters.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
    } else if (sortBy === 'variance_pct') {
      costCenters.sort((a, b) => {
        const aPct = a.variancePct ?? 0;
        const bPct = b.variancePct ?? 0;
        return Math.abs(bPct) - Math.abs(aPct);
      });
    } else {
      costCenters.sort((a, b) => a.costCenterName.localeCompare(b.costCenterName));
    }
    
    // Recompute grand totals from filtered/recomputed cost centers
    const grandForecastTotal = costCenters.reduce((sum, cc) => sum + cc.forecastTotal, 0);
    const grandActualsTotal = costCenters.reduce((sum, cc) => sum + cc.actualsTotal, 0);
    const grandVariance = grandActualsTotal - grandForecastTotal;
    const grandVariancePct = computeVariancePct(grandVariance, grandForecastTotal);
    
    return {
      ...report,
      costCenters,
      totals: {
        forecastTotal: grandForecastTotal,
        actualsTotal: grandActualsTotal,
        variance: grandVariance,
        variancePct: grandVariancePct,
      },
    };
  }, [report, costCenterFilter, contractedOnly, varianceOnly, sortBy, scopeMode, asOfMonth]);
  
  const toggleCC = (ccId: string) => {
    setExpandedCCs(prev => {
      const next = new Set(prev);
      if (next.has(ccId)) {
        next.delete(ccId);
      } else {
        next.add(ccId);
      }
      return next;
    });
  };
  
  const handleClearFilters = useCallback(() => {
    setCostCenterFilter('all');
    setContractedOnly(false);
    setVarianceOnly(false);
    setShowMonthly(false);
    setSortBy('variance_abs');
    setScopeMode('fy');
    setExpandedCCs(new Set());
  }, []);
  
  const hasActiveFilters = costCenterFilter !== 'all' || contractedOnly || varianceOnly || showMonthly || sortBy !== 'variance_abs' || scopeMode !== 'fy';
  
  const handleViewInForecast = (ccId: string, itemId: string) => {
    if (selectedFiscalYearId) {
      setSelectedFiscalYearId(selectedFiscalYearId);
    }
    navigate(`/forecast?focusCostCenterId=${ccId}&focusLineItemId=${itemId}`);
  };
  
  const handleViewInActuals = (ccId: string, itemId: string) => {
    if (selectedFiscalYearId) {
      setSelectedFiscalYearId(selectedFiscalYearId);
    }
    navigate(`/actuals?focusCostCenterId=${ccId}&focusLineItemId=${itemId}`);
  };
  
  const handleExportCsv = useCallback(() => {
    if (!filteredReport || !selectedFiscalYear) {
      toast({ title: 'Export failed', description: 'No data to export', variant: 'destructive' });
      return;
    }
    
    try {
      // Build rows from filtered data
      const rows: Record<string, unknown>[] = [];
      
      for (const cc of filteredReport.costCenters) {
        for (const item of cc.lineItems) {
          const row: Record<string, unknown> = {
            fiscalYearId: selectedFiscalYearId,
            fiscalYearName: selectedFiscalYear.name,
            costCenterId: item.costCenterId,
            costCenterName: item.costCenterName,
            lineItemId: item.lineItemId,
            lineItemName: item.name,
            vendorName: item.vendorName || '',
            isContracted: item.isContracted,
            status: item.status,
          };
          
          if (showMonthly) {
            // Add monthly variance columns
            for (const month of MONTHS) {
              row[`variance_${month}`] = item.varianceByMonth[month];
            }
          } else {
            row.forecastFY = item.forecastTotal;
            row.actualsFY = item.actualsTotal;
          }
          
          row.varianceFY = item.variance;
          row.variancePct = item.variancePct; // null stays as empty in CSV
          
          rows.push(row);
        }
      }
      
      // Define columns based on showMonthly
      const baseColumns: CsvColumn[] = [
        { key: 'fiscalYearId', header: 'Fiscal Year ID' },
        { key: 'fiscalYearName', header: 'Fiscal Year Name' },
        { key: 'costCenterId', header: 'Cost Center ID' },
        { key: 'costCenterName', header: 'Cost Center Name' },
        { key: 'lineItemId', header: 'Line Item ID' },
        { key: 'lineItemName', header: 'Line Item Name' },
        { key: 'vendorName', header: 'Vendor Name' },
        { key: 'isContracted', header: 'Is Contracted' },
        { key: 'status', header: 'Status' },
      ];
      
      let columns: CsvColumn[];
      
      if (showMonthly) {
        const monthColumns: CsvColumn[] = MONTHS.map(month => ({
          key: `variance_${month}`,
          header: `Variance ${MONTH_LABELS[month]}`,
        }));
        columns = [
          ...baseColumns,
          ...monthColumns,
          { key: 'varianceFY', header: 'Variance FY' },
          { key: 'variancePct', header: 'Variance %' },
        ];
      } else {
        columns = [
          ...baseColumns,
          { key: 'forecastFY', header: 'Forecast FY' },
          { key: 'actualsFY', header: 'Actuals FY' },
          { key: 'varianceFY', header: 'Variance FY' },
          { key: 'variancePct', header: 'Variance %' },
        ];
      }
      
      // Generate filename
      const fyName = selectedFiscalYear.name.replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `forecast_actuals_variance_${fyName}_${dateStr}.csv`;
      
      downloadCsv(filename, rows, columns);
      
      toast({ title: 'CSV exported', description: `Downloaded ${filename}` });
    } catch (error) {
      console.error('CSV export error:', error);
      toast({ title: 'Export failed', description: 'An error occurred while exporting', variant: 'destructive' });
    }
  }, [filteredReport, selectedFiscalYear, selectedFiscalYearId, showMonthly]);
  
  // Check if we have any matched actuals
  const hasMatchedActuals = actualsRollup && actualsRollup.summary.matchedCount > 0;
  
  // Render empty states
  if (!initialized || isLoadingActuals) {
    return (
      <div>
        <PageHeader
          title="Forecast vs Actuals Variance"
          description="Compare current forecast against matched actuals"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading actuals...
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!selectedFiscalYear) {
    return (
      <div>
        <PageHeader
          title="Forecast vs Actuals Variance"
          description="Compare current forecast against matched actuals"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Select a fiscal year to view variance report.
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (selectedFiscalYear.status !== 'active') {
    return (
      <div>
        <PageHeader
          title="Forecast vs Actuals Variance"
          description="Compare current forecast against matched actuals"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Variance report available after budget approval (FY must be Active).
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!hasMatchedActuals) {
    return (
      <div>
        <PageHeader
          title="Forecast vs Actuals Variance"
          description="Compare current forecast against matched actuals"
        />
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="font-medium">No Matched Actuals</h3>
              <p className="text-sm text-muted-foreground">
                No matched actuals found for this fiscal year. Import and match transactions to view actuals variance.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={() => navigate('/import')}>
                Import Actuals
              </Button>
              <Button variant="outline" onClick={() => navigate('/actuals/match')}>
                Match Transactions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!filteredReport) {
    return (
      <div>
        <PageHeader
          title="Forecast vs Actuals Variance"
          description="Compare current forecast against matched actuals"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No data available.
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => navigate('/reports')} 
        className="gap-2"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>
      
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            title="Forecast vs Actuals Variance"
            description={`Comparing forecast against matched actuals for ${selectedFiscalYear.name}`}
          />
          <div className="mt-1 text-sm text-muted-foreground">
            Showing: {scopeMode === 'fy' ? 'Full FY' : `YTD through ${MONTH_LABELS[asOfMonth]}`}
          </div>
        </div>
        <Button onClick={handleExportCsv} variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Forecast {scopeMode === 'fy' ? 'FY' : 'YTD'} Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredReport.totals.forecastTotal)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actuals {scopeMode === 'fy' ? 'FY' : 'YTD'} Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredReport.totals.actualsTotal)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Variance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${filteredReport.totals.variance > 0 ? 'text-destructive' : filteredReport.totals.variance < 0 ? 'text-green-600' : ''}`}>
              {formatVariance(filteredReport.totals.variance)}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Variance %
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(filteredReport.totals.variancePct ?? 0) > 0 ? 'text-destructive' : (filteredReport.totals.variancePct ?? 0) < 0 ? 'text-green-600' : ''}`}>
              {formatPct(filteredReport.totals.variancePct)}
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
            {/* Scope Toggle */}
            <div className="flex items-center gap-2">
              <Label className="text-sm">Scope</Label>
              <ToggleGroup 
                type="single" 
                value={scopeMode} 
                onValueChange={(val) => val && setScopeMode(val as ScopeMode)}
                className="border rounded-md"
              >
                <ToggleGroupItem value="fy" aria-label="Full FY" className="text-xs px-3">
                  FY
                </ToggleGroupItem>
                <ToggleGroupItem value="ytd" aria-label="Year to Date" className="text-xs px-3">
                  YTD
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            {/* As Of Month Dropdown (only when YTD) */}
            {scopeMode === 'ytd' && (
              <div className="flex items-center gap-2">
                <Label className="text-sm">As of</Label>
                <Select value={asOfMonth} onValueChange={(v) => setAsOfMonth(v as Month)}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(month => (
                      <SelectItem key={month} value={month}>
                        {MONTH_LABELS[month]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <Label className="text-sm">Cost Center</Label>
              <Select value={costCenterFilter} onValueChange={setCostCenterFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Cost Centers</SelectItem>
                  {report?.costCenters.map(cc => (
                    <SelectItem key={cc.costCenterId} value={cc.costCenterId}>
                      {cc.costCenterName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="contracted"
                checked={contractedOnly}
                onCheckedChange={(checked) => setContractedOnly(checked === true)}
              />
              <Label htmlFor="contracted" className="text-sm cursor-pointer">
                Contracted only
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="variance"
                checked={varianceOnly}
                onCheckedChange={(checked) => setVarianceOnly(checked === true)}
              />
              <Label htmlFor="variance" className="text-sm cursor-pointer">
                Variance only
              </Label>
            </div>
            
            <div className="flex items-center gap-2">
              <Checkbox
                id="monthly"
                checked={showMonthly}
                onCheckedChange={(checked) => setShowMonthly(checked === true)}
              />
              <Label htmlFor="monthly" className="text-sm cursor-pointer">
                Show monthly breakdown
              </Label>
            </div>
            
            <div className="flex items-center gap-2 ml-auto">
              <Label className="text-sm">Sort by</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="variance_abs">Largest $ Variance</SelectItem>
                  <SelectItem value="variance_pct">Largest % Variance</SelectItem>
                  <SelectItem value="alpha">Alphabetical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilters}
                className="gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Variance Charts */}
      <VarianceCharts
        filteredReport={filteredReport}
        costCenterFilter={costCenterFilter}
        setCostCenterFilter={setCostCenterFilter}
        setExpandedCCs={setExpandedCCs}
        tableRef={tableRef}
      />
      
      {/* Main Table */}
      <div ref={tableRef}>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">Line Item</TableHead>
                  {!showMonthly && (
                    <>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-center">Contracted</TableHead>
                      <TableHead className="text-right">Forecast FY</TableHead>
                      <TableHead className="text-right">Actuals FY</TableHead>
                    </>
                  )}
                  {showMonthly && MONTHS.map(month => (
                    <TableHead key={month} className="text-right text-xs px-2">
                      {MONTH_LABELS[month]}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead className="text-right">Var %</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReport.costCenters.map(cc => (
                  <CostCenterSection
                    key={cc.costCenterId}
                    cc={cc}
                    isExpanded={expandedCCs.has(cc.costCenterId)}
                    onToggle={() => toggleCC(cc.costCenterId)}
                    showMonthly={showMonthly}
                    onViewInForecast={handleViewInForecast}
                    onViewInActuals={handleViewInActuals}
                  />
                ))}
                
                {filteredReport.costCenters.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={showMonthly ? 15 : 9} className="text-center text-muted-foreground py-8">
                      No results match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

interface CostCenterSectionProps {
  cc: ForecastActualsCostCenterRow;
  isExpanded: boolean;
  onToggle: () => void;
  showMonthly: boolean;
  onViewInForecast: (ccId: string, itemId: string) => void;
  onViewInActuals: (ccId: string, itemId: string) => void;
}

function CostCenterSection({
  cc,
  isExpanded,
  onToggle,
  showMonthly,
  onViewInForecast,
  onViewInActuals,
}: CostCenterSectionProps) {
  return (
    <>
      {/* Cost Center Header Row */}
      <TableRow 
        className="bg-muted/50 hover:bg-muted cursor-pointer font-medium"
        onClick={onToggle}
      >
        <TableCell className="py-3">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>{cc.costCenterName}</span>
            <Badge variant="secondary" className="ml-2 text-xs">
              {cc.lineItems.length} items
            </Badge>
          </div>
        </TableCell>
        {!showMonthly && (
          <>
            <TableCell />
            <TableCell />
            <TableCell className="text-right font-medium">
              {formatCurrency(cc.forecastTotal)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(cc.actualsTotal)}
            </TableCell>
          </>
        )}
        {showMonthly && MONTHS.map(month => (
          <TableCell key={month} />
        ))}
        <TableCell className={`text-right font-medium ${cc.variance > 0 ? 'text-destructive' : cc.variance < 0 ? 'text-green-600' : ''}`}>
          {formatVariance(cc.variance)}
        </TableCell>
        <TableCell className={`text-right font-medium ${(cc.variancePct ?? 0) > 0 ? 'text-destructive' : (cc.variancePct ?? 0) < 0 ? 'text-green-600' : ''}`}>
          {formatPct(cc.variancePct)}
        </TableCell>
        <TableCell />
      </TableRow>
      
      {/* Line Item Rows */}
      {isExpanded && cc.lineItems.map(item => (
        <LineItemRow
          key={item.lineItemId}
          item={item}
          showMonthly={showMonthly}
          onViewInForecast={() => onViewInForecast(item.costCenterId, item.lineItemId)}
          onViewInActuals={() => onViewInActuals(item.costCenterId, item.lineItemId)}
        />
      ))}
    </>
  );
}

interface LineItemRowProps {
  item: ForecastActualsLineItemRow;
  showMonthly: boolean;
  onViewInForecast: () => void;
  onViewInActuals: () => void;
}

function LineItemRow({ item, showMonthly, onViewInForecast, onViewInActuals }: LineItemRowProps) {
  return (
    <TableRow className="text-sm">
      <TableCell className="pl-10">
        <div className="flex items-center gap-2">
          <span>{item.name}</span>
          {item.status === 'forecast_only' && (
            <Badge variant="outline" className="text-xs">Forecast only</Badge>
          )}
          {item.status === 'actuals_only' && (
            <Badge variant="outline" className="text-xs">Actuals only</Badge>
          )}
        </div>
      </TableCell>
      {!showMonthly && (
        <>
          <TableCell className="text-muted-foreground">
            {item.vendorName || '—'}
          </TableCell>
          <TableCell className="text-center">
            {item.isContracted && <Badge variant="secondary" className="text-xs">Contracted</Badge>}
          </TableCell>
          <TableCell className="text-right">
            {formatCurrency(item.forecastTotal)}
          </TableCell>
          <TableCell className="text-right">
            {formatCurrency(item.actualsTotal)}
          </TableCell>
        </>
      )}
      {showMonthly && MONTHS.map(month => (
        <TableCell 
          key={month} 
          className={`text-right text-xs px-2 ${item.varianceByMonth[month] > 0 ? 'text-destructive' : item.varianceByMonth[month] < 0 ? 'text-green-600' : 'text-muted-foreground'}`}
        >
          {item.varianceByMonth[month] !== 0 ? formatVariance(item.varianceByMonth[month]) : '—'}
        </TableCell>
      ))}
      <TableCell className={`text-right ${item.variance > 0 ? 'text-destructive' : item.variance < 0 ? 'text-green-600' : ''}`}>
        {formatVariance(item.variance)}
      </TableCell>
      <TableCell className={`text-right ${(item.variancePct ?? 0) > 0 ? 'text-destructive' : (item.variancePct ?? 0) < 0 ? 'text-green-600' : ''}`}>
        {formatPct(item.variancePct)}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewInForecast}
            title="View in Forecast"
          >
            <TrendingUp className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewInActuals}
            title="View in Actuals"
          >
            <Receipt className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Variance Charts Component
interface VarianceChartsProps {
  filteredReport: ForecastActualsReportResult;
  costCenterFilter: string;
  setCostCenterFilter: (id: string) => void;
  setExpandedCCs: React.Dispatch<React.SetStateAction<Set<string>>>;
  tableRef: React.RefObject<HTMLDivElement | null>;
}

function VarianceCharts({
  filteredReport,
  costCenterFilter,
  setCostCenterFilter,
  setExpandedCCs,
  tableRef,
}: VarianceChartsProps) {
  // Get top cost centers from filtered data (already has recomputed totals)
  const topCostCenters = useMemo(
    () => getTopCostCenters(filteredReport.costCenters),
    [filteredReport.costCenters]
  );
  
  const maxAbsVariance = useMemo(
    () => Math.max(...topCostCenters.map(cc => Math.abs(cc.variance)), 1),
    [topCostCenters]
  );
  
  // Get selected cost center for monthly chart
  const selectedCC = useMemo(() => {
    if (costCenterFilter === 'all') return null;
    return filteredReport.costCenters.find(cc => cc.costCenterId === costCenterFilter) || null;
  }, [costCenterFilter, filteredReport.costCenters]);
  
  const monthlyTotals = useMemo(() => {
    if (!selectedCC) return null;
    return getMonthlyTotalsForCostCenter(selectedCC);
  }, [selectedCC]);
  
  const maxAbsMonthlyVariance = useMemo(() => {
    if (!monthlyTotals) return 1;
    return Math.max(...Object.values(monthlyTotals).map(Math.abs), 1);
  }, [monthlyTotals]);
  
  const handleCostCenterClick = (ccId: string) => {
    setCostCenterFilter(ccId);
    setExpandedCCs(prev => new Set([...prev, ccId]));
    // Scroll to table after a brief delay to allow state updates
    setTimeout(() => {
      tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };
  
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Chart 1: Top Cost Centers by Variance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Top Cost Centers by FY Variance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {topCostCenters.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No cost centers to display
            </div>
          ) : (
            topCostCenters.map(cc => {
              const barWidth = (Math.abs(cc.variance) / maxAbsVariance) * 100;
              const isPositive = cc.variance > 0;
              
              return (
                <div
                  key={cc.costCenterId}
                  className="cursor-pointer hover:bg-muted/50 rounded p-2 transition-colors"
                  onClick={() => handleCostCenterClick(cc.costCenterId)}
                >
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="truncate font-medium">{cc.name}</span>
                    <span className={isPositive ? 'text-destructive' : cc.variance < 0 ? 'text-green-600' : ''}>
                      {formatVariance(cc.variance)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded overflow-hidden">
                    <div
                      className={`h-full rounded transition-all ${
                        isPositive ? 'bg-destructive/70' : 'bg-green-500/70'
                      }`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
      
      {/* Chart 2: Monthly Variance Trend (only when single CC selected) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Monthly Variance Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedCC ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              Select a cost center to view monthly trend
            </div>
          ) : monthlyTotals && Object.values(monthlyTotals).every(v => v === 0) ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No variance for selected cost center
            </div>
          ) : (
            <div className="space-y-1">
              {MONTHS.map(month => {
                const value = monthlyTotals?.[month] || 0;
                const barWidth = (Math.abs(value) / maxAbsMonthlyVariance) * 100;
                const isPositive = value > 0;
                
                return (
                  <div key={month} className="flex items-center gap-2">
                    <span className="text-xs w-8 text-muted-foreground">
                      {MONTH_LABELS[month]}
                    </span>
                    <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full rounded transition-all ${
                          isPositive ? 'bg-destructive/70' : value < 0 ? 'bg-green-500/70' : 'bg-muted'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                    <span className={`text-xs w-20 text-right ${
                      isPositive ? 'text-destructive' : value < 0 ? 'text-green-600' : 'text-muted-foreground'
                    }`}>
                      {value !== 0 ? formatVariance(value) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
