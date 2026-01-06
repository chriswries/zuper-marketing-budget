import { useState, useMemo, useEffect } from 'react';
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
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY, saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import {
  buildVarianceReport,
  VarianceCostCenterRow,
  VarianceLineItemRow,
} from '@/lib/budgetForecastVariance';
import { MONTHS, MONTH_LABELS, CostCenter } from '@/types/budget';
import { FileSpreadsheet, TrendingUp, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

type SortOption = 'variance_abs' | 'variance_pct' | 'alpha';

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

export default function VarianceReport() {
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
  
  // Build variance report
  const report = useMemo(() => {
    if (!selectedFiscalYear || !forecastCCs) return null;
    return buildVarianceReport(selectedFiscalYear.costCenters, forecastCCs);
  }, [selectedFiscalYear, forecastCCs]);
  
  // Filter and sort
  const filteredReport = useMemo(() => {
    if (!report) return null;
    
    let costCenters = report.costCenters;
    
    // Cost center filter
    if (costCenterFilter !== 'all') {
      costCenters = costCenters.filter(cc => cc.costCenterId === costCenterFilter);
    }
    
    // Apply line item filters
    costCenters = costCenters.map(cc => {
      let lineItems = cc.lineItems;
      
      if (contractedOnly) {
        lineItems = lineItems.filter(item => item.isContracted);
      }
      
      if (varianceOnly) {
        lineItems = lineItems.filter(item => item.variance !== 0);
      }
      
      return { ...cc, lineItems };
    }).filter(cc => cc.lineItems.length > 0 || !contractedOnly && !varianceOnly);
    
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
    
    // Sort cost centers by total variance
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
    
    return { ...report, costCenters };
  }, [report, costCenterFilter, contractedOnly, varianceOnly, sortBy]);
  
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
      <PageHeader
        title="Budget vs Forecast Variance"
        description={`Comparing approved budget against current forecast for ${selectedFiscalYear.name}`}
      />
      
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Budget FY Total
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
              Forecast FY Total
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
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-4">
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
          </div>
        </CardContent>
      </Card>
      
      {/* Main Table */}
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
                      <TableHead className="text-right">Budget FY</TableHead>
                      <TableHead className="text-right">Forecast FY</TableHead>
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
      <TableCell className="pl-10">
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
