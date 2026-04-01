import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { formatCurrency } from '@/lib/format';
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import {
  buildVarianceReport,
  VarianceCostCenterRow,
  VarianceLineItemRow,
  VarianceReportResult,
} from '@/lib/budgetForecastVariance';
import { downloadCsv, CsvColumn } from '@/lib/exportCsv';
import { MONTHS, MONTH_LABELS, CostCenter, Month } from '@/types/budget';
import { FileSpreadsheet, TrendingUp, ChevronDown, ChevronRight, Download, BarChart3, X, ArrowLeft, FileDown } from 'lucide-react';
import { exportReportToPdf } from '@/lib/exportPdf';
import { toast } from '@/hooks/use-toast';
import { ScopeMode, sumYTD, getCurrentFiscalMonth } from '@/lib/ytdHelpers';

// Helper to compute variance percentage
function computeVariancePct(variance: number, budget: number): number | null {
  if (budget === 0) return null;
  return variance / budget;
}

type SortOption = 'variance_abs' | 'variance_pct' | 'alpha';

// Chart helper: Get top cost centers by absolute variance
function getTopCostCenters(
  costCenters: VarianceCostCenterRow[],
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
  cc: VarianceCostCenterRow
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


function formatVariance(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

export default function VarianceReport() {
  const navigate = useNavigate();
  const { selectedFiscalYear, selectedFiscalYearId, setSelectedFiscalYearId } = useFiscalYearBudget();
  
  const [forecastCCs, setForecastCCs] = useState<CostCenter[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Filters
  const [costCenterFilter, setCostCenterFilter] = useState<string>('all');
  const [contractedOnly, setContractedOnly] = useState(false);
  const [varianceOnly, setVarianceOnly] = useState(false);
  const [showMonthly, setShowMonthly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('variance_abs');
  
  // Scope controls: FY vs YTD
  const [scopeMode, setScopeMode] = useState<ScopeMode>('fy');
  const [asOfMonth, setAsOfMonth] = useState<Month>(getCurrentFiscalMonth());
  
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
    
    const forecast = loadForecastForFY(selectedFiscalYearId);
    
    if (!forecast) {
      createForecastCostCentersFromBudget(selectedFiscalYear).then((fc) => {
        setForecastCCs(fc);
        setInitialized(true);
      });
      return;
    }
    
    setForecastCCs(forecast);
    setInitialized(true);
  }, [selectedFiscalYearId, selectedFiscalYear]);
  
  // Build variance report
  const report = useMemo(() => {
    if (!selectedFiscalYear || !forecastCCs) return null;
    return buildVarianceReport(selectedFiscalYear.costCenters, forecastCCs);
  }, [selectedFiscalYear, forecastCCs]);
  
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
          const budgetTotal = sumYTD(item.budgetByMonth, asOfMonth);
          const forecastTotal = sumYTD(item.forecastByMonth, asOfMonth);
          const variance = forecastTotal - budgetTotal;
          const variancePct = budgetTotal === 0 ? null : variance / budgetTotal;
          
          return {
            ...item,
            budgetTotal,
            forecastTotal,
            variance,
            variancePct,
          };
        });
      }
      
      // Recompute cost center totals from filtered line items
      const ccBudgetTotal = lineItems.reduce((sum, item) => sum + item.budgetTotal, 0);
      const ccForecastTotal = lineItems.reduce((sum, item) => sum + item.forecastTotal, 0);
      const ccVariance = ccForecastTotal - ccBudgetTotal;
      const ccVariancePct = computeVariancePct(ccVariance, ccBudgetTotal);
      
      return {
        ...cc,
        lineItems,
        budgetTotal: ccBudgetTotal,
        forecastTotal: ccForecastTotal,
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
    const grandBudgetTotal = costCenters.reduce((sum, cc) => sum + cc.budgetTotal, 0);
    const grandForecastTotal = costCenters.reduce((sum, cc) => sum + cc.forecastTotal, 0);
    const grandVariance = grandForecastTotal - grandBudgetTotal;
    const grandVariancePct = computeVariancePct(grandVariance, grandBudgetTotal);
    
    return {
      ...report,
      costCenters,
      totals: {
        budgetTotal: grandBudgetTotal,
        forecastTotal: grandForecastTotal,
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
    setAsOfMonth(getCurrentFiscalMonth());
    setExpandedCCs(new Set());
  }, []);
  
  const hasActiveFilters = costCenterFilter !== 'all' || contractedOnly || varianceOnly || showMonthly || sortBy !== 'variance_abs' || scopeMode !== 'fy';
  
  const handleViewInBudget = (ccId: string, itemId: string) => {
    if (selectedFiscalYearId) {
      setSelectedFiscalYearId(selectedFiscalYearId);
    }
    navigate(`/budget?focusCostCenterId=${ccId}&focusLineItemId=${itemId}`);
  };
  
  const handleViewInForecast = (ccId: string, itemId: string) => {
    if (selectedFiscalYearId) {
      setSelectedFiscalYearId(selectedFiscalYearId);
    }
    navigate(`/forecast?focusCostCenterId=${ccId}&focusLineItemId=${itemId}`);
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
            row.budgetFY = item.budgetTotal;
            row.forecastFY = item.forecastTotal;
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
          { key: 'budgetFY', header: 'Budget FY' },
          { key: 'forecastFY', header: 'Forecast FY' },
          { key: 'varianceFY', header: 'Variance FY' },
          { key: 'variancePct', header: 'Variance %' },
        ];
      }
      
      // Generate filename
      const fyName = selectedFiscalYear.name.replace(/[^a-zA-Z0-9]/g, '_');
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `variance_report_${fyName}_${dateStr}.csv`;
      
      downloadCsv(filename, rows, columns);
      
      toast({ title: 'CSV exported', description: `Downloaded ${filename}` });
    } catch (error) {
      console.error('CSV export error:', error);
      toast({ title: 'Export failed', description: 'An error occurred while exporting', variant: 'destructive' });
    }
  }, [filteredReport, selectedFiscalYear, selectedFiscalYearId, showMonthly]);
  
  // Render empty states
  if (!initialized) {
    return (
      <div>
        <PageHeader
          title="Budget vs Forecast Variance"
          description="Compare approved budget against current forecast"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Loading...
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!selectedFiscalYear) {
    return (
      <div>
        <PageHeader
          title="Budget vs Forecast Variance"
          description="Compare approved budget against current forecast"
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
          title="Budget vs Forecast Variance"
          description="Compare approved budget against current forecast"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Variance report available after budget approval (FY must be Active).
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!filteredReport) {
    return (
      <div>
        <PageHeader
          title="Budget vs Forecast Variance"
          description="Compare approved budget against current forecast"
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
        className="gap-2 no-print"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <div className="print-only mb-4">
        <h1 className="text-2xl font-bold">Budget vs Forecast Variance — {selectedFiscalYear.name}</h1>
        <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      
      <div className="flex items-center justify-between">
        <div>
          <PageHeader
            title="Budget vs Forecast Variance"
            description={`Comparing approved budget against current forecast for ${selectedFiscalYear.name}`}
          />
          <div className="mt-1 text-sm text-muted-foreground">
            Showing: {scopeMode === 'fy' ? 'Full FY' : `YTD through ${MONTH_LABELS[asOfMonth]}`}
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleExportCsv} variant="outline" className="gap-2 no-print">
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 no-print"
            onClick={() => exportReportToPdf(`${selectedFiscalYear.name}_Budget_vs_Forecast_Variance`)}
          >
            <FileDown className="h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Budget {scopeMode === 'fy' ? 'FY' : 'YTD'} Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(filteredReport.totals.budgetTotal)}
            </div>
          </CardContent>
        </Card>
        
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
      <Card className="no-print">
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
          <div className="relative overflow-x-auto overflow-y-auto max-h-[calc(100vh-300px)]">
            <Table className="border-separate border-spacing-0">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px] sticky top-0 left-0 z-30 bg-muted border-b border-r shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">Line Item</TableHead>
                  {!showMonthly && (
                    <>
                      <TableHead className="sticky top-0 z-10 bg-muted border-b">Vendor</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted border-b text-center">Contracted</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted border-b text-right">Budget FY</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted border-b text-right">Forecast FY</TableHead>
                    </>
                  )}
                  {showMonthly && MONTHS.map(month => (
                    <TableHead key={month} className="sticky top-0 z-10 bg-muted border-b text-right text-xs px-2">
                      {MONTH_LABELS[month]}
                    </TableHead>
                  ))}
                  <TableHead className="sticky top-0 z-10 bg-muted border-b text-right">Variance</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted border-b text-right">Var %</TableHead>
                  <TableHead className="sticky top-0 z-10 bg-muted border-b text-right">Actions</TableHead>
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
                    onViewInBudget={handleViewInBudget}
                    onViewInForecast={handleViewInForecast}
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
  cc: VarianceCostCenterRow;
  isExpanded: boolean;
  onToggle: () => void;
  showMonthly: boolean;
  onViewInBudget: (ccId: string, itemId: string) => void;
  onViewInForecast: (ccId: string, itemId: string) => void;
}

function CostCenterSection({
  cc,
  isExpanded,
  onToggle,
  showMonthly,
  onViewInBudget,
  onViewInForecast,
}: CostCenterSectionProps) {
  const colSpan = showMonthly ? 15 : 9;
  
  return (
    <>
      {/* Cost Center Header Row */}
      <TableRow 
        className="bg-muted/50 hover:bg-muted cursor-pointer font-medium"
        onClick={onToggle}
      >
        <TableCell className="py-3 sticky left-0 z-20 bg-muted/50 border-r shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
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
              {formatCurrency(cc.budgetTotal)}
            </TableCell>
            <TableCell className="text-right font-medium">
              {formatCurrency(cc.forecastTotal)}
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
          onViewInBudget={() => onViewInBudget(item.costCenterId, item.lineItemId)}
          onViewInForecast={() => onViewInForecast(item.costCenterId, item.lineItemId)}
        />
      ))}
    </>
  );
}

interface LineItemRowProps {
  item: VarianceLineItemRow;
  showMonthly: boolean;
  onViewInBudget: () => void;
  onViewInForecast: () => void;
}

function LineItemRow({ item, showMonthly, onViewInBudget, onViewInForecast }: LineItemRowProps) {
  return (
    <TableRow className="text-sm">
      <TableCell className="pl-10 sticky left-0 z-20 bg-background border-r shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2">
          <span>{item.name}</span>
          {item.status === 'budget_only' && (
            <Badge variant="outline" className="text-xs">Budget only</Badge>
          )}
          {item.status === 'forecast_only' && (
            <Badge variant="outline" className="text-xs">Forecast only</Badge>
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
            {formatCurrency(item.budgetTotal)}
          </TableCell>
          <TableCell className="text-right">
            {formatCurrency(item.forecastTotal)}
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
            onClick={onViewInBudget}
            title="View in Budget"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onViewInForecast}
            title="View in Forecast"
          >
            <TrendingUp className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

// Variance Charts Component
interface VarianceChartsProps {
  filteredReport: VarianceReportResult;
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
