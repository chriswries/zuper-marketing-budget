import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { useEnsureActualsLoaded } from '@/hooks/useEnsureActualsLoaded';
import { MONTHS, MONTH_LABELS, Month, MonthlyValues, calculateFYTotal, CostCenter } from '@/types/budget';
import { ArrowLeft, DollarSign, TrendingDown, Calendar, Flame, Receipt, Loader2, FileDown } from 'lucide-react';
import { exportReportToPdf } from '@/lib/exportPdf';
import { getMonthIndex, getLatestActualsMonthFromLineItems } from '@/lib/ytdHelpers';
import { formatCurrency } from '@/lib/format';

type BurnMode = 'actuals_constant' | 'forecast_adjusted';

function formatMonths(value: number): string {
  if (value === Infinity || isNaN(value)) return '∞';
  return value.toFixed(1);
}

/**
 * Sum monthly values from start through asOfMonth (inclusive).
 */
function sumYTD(values: MonthlyValues, asOfMonth: Month): number {
  const endIndex = getMonthIndex(asOfMonth);
  let total = 0;
  for (let i = 0; i <= endIndex; i++) {
    total += values[MONTHS[i]] || 0;
  }
  return total;
}

/**
 * Sum monthly values for months AFTER asOfMonth through FY end.
 */
function sumRemaining(values: MonthlyValues, asOfMonth: Month): number {
  const startIndex = getMonthIndex(asOfMonth) + 1;
  let total = 0;
  for (let i = startIndex; i < MONTHS.length; i++) {
    total += values[MONTHS[i]] || 0;
  }
  return total;
}

/**
 * Compute FY total from forecast cost centers.
 */
function computeForecastFYTotal(forecastCCs: CostCenter[]): number {
  let total = 0;
  for (const cc of forecastCCs) {
    for (const li of cc.lineItems) {
      total += calculateFYTotal(li.forecastValues);
    }
  }
  return total;
}

/**
 * Get aggregated monthly forecast values from all line items.
 */
function getAggregateForecastByMonth(forecastCCs: CostCenter[]): MonthlyValues {
  const result: MonthlyValues = {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
  for (const cc of forecastCCs) {
    for (const li of cc.lineItems) {
      for (const month of MONTHS) {
        result[month] += li.forecastValues[month] || 0;
      }
    }
  }
  return result;
}

export default function BurnRateRunwayReport() {
  const navigate = useNavigate();
  const { selectedFiscalYear, selectedFiscalYearId } = useFiscalYearBudget();
  
  const [forecastCCs, setForecastCCs] = useState<CostCenter[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  // Mode toggle
  const [burnMode, setBurnMode] = useState<BurnMode>('actuals_constant');
  
  // As-of month selector
  const [asOfMonth, setAsOfMonth] = useState<Month>('feb');
  const [asOfMonthInitialized, setAsOfMonthInitialized] = useState(false);
  
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
  
  // Use the hook to ensure actuals are loaded from DB before computing rollup
  const isActiveFY = selectedFiscalYear?.status === 'active';
  const { isLoading: isLoadingActuals, rollup: actualsRollup } = useEnsureActualsLoaded(
    isActiveFY ? selectedFiscalYearId : null,
    isActiveFY ? selectedFiscalYear : null
  );
  
  // Compute actuals by month (aggregate)
  const actualsByMonth = useMemo((): MonthlyValues => {
    const result: MonthlyValues = {
      feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
      aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
    };
    if (!actualsRollup) return result;
    for (const li of actualsRollup.lineItems) {
      for (const month of MONTHS) {
        result[month] += li.actualByMonth[month] || 0;
      }
    }
    return result;
  }, [actualsRollup]);
  
  // Auto-set asOfMonth to latest month with actuals (only once)
  useEffect(() => {
    if (actualsRollup && !asOfMonthInitialized) {
      const allActualsByMonth = actualsRollup.lineItems.map(li => li.actualByMonth);
      const latestMonth = getLatestActualsMonthFromLineItems(allActualsByMonth);
      if (latestMonth) {
        setAsOfMonth(latestMonth);
      }
      setAsOfMonthInitialized(true);
    }
  }, [actualsRollup, asOfMonthInitialized]);
  
  // Core calculations
  const calculations = useMemo(() => {
    if (!selectedFiscalYear || !forecastCCs) {
      return null;
    }
    
    // FY Budget = total budget (from approved budget, summing budget values)
    let fyBudget = 0;
    for (const cc of selectedFiscalYear.costCenters) {
      for (const li of cc.lineItems) {
        fyBudget += calculateFYTotal(li.budgetValues);
      }
    }
    
    // Actuals YTD
    const actualsYTD = sumYTD(actualsByMonth, asOfMonth);
    
    // Months elapsed (inclusive of asOfMonth)
    const monthsElapsed = getMonthIndex(asOfMonth) + 1;
    
    // Months remaining after asOfMonth
    const monthsRemaining = MONTHS.length - monthsElapsed;
    
    // Remaining budget
    const remainingBudget = fyBudget - actualsYTD;
    
    // Forecast aggregates
    const forecastByMonth = getAggregateForecastByMonth(forecastCCs);
    const forecastRemaining = sumRemaining(forecastByMonth, asOfMonth);
    
    let burnPerMonth: number;
    let runwayMonths: number;
    let exhaustionMonth: string;
    let exhaustionNote: string | null = null;
    
    if (burnMode === 'actuals_constant') {
      // Mode A: Actuals burn (constant)
      burnPerMonth = monthsElapsed > 0 ? actualsYTD / monthsElapsed : 0;
      
      if (burnPerMonth <= 0) {
        runwayMonths = Infinity;
        exhaustionMonth = 'N/A';
        exhaustionNote = 'No burn detected';
      } else if (remainingBudget <= 0) {
        runwayMonths = 0;
        exhaustionMonth = 'N/A';
        exhaustionNote = 'Already exhausted';
      } else {
        runwayMonths = remainingBudget / burnPerMonth;
        
        // Project exhaustion month
        const asOfIndex = getMonthIndex(asOfMonth);
        const exhaustionIndex = Math.floor(asOfIndex + runwayMonths);
        
        if (exhaustionIndex >= MONTHS.length) {
          exhaustionMonth = 'Not exhausted by FY end';
          const endingRemainder = remainingBudget - (burnPerMonth * monthsRemaining);
          if (endingRemainder > 0) {
            exhaustionNote = `Est. ${formatCurrency(endingRemainder)} remaining at FY end`;
          }
        } else {
          exhaustionMonth = MONTH_LABELS[MONTHS[exhaustionIndex]] || 'N/A';
        }
      }
    } else {
      // Mode B: Forecast-adjusted burn
      burnPerMonth = monthsRemaining > 0 ? forecastRemaining / monthsRemaining : 0;
      
      if (burnPerMonth <= 0) {
        runwayMonths = Infinity;
        exhaustionMonth = 'N/A';
        exhaustionNote = 'No forecasted spend remaining';
      } else if (remainingBudget <= 0) {
        runwayMonths = 0;
        exhaustionMonth = 'N/A';
        exhaustionNote = 'Already exhausted';
      } else {
        runwayMonths = remainingBudget / burnPerMonth;
        
        // Simulate cumulative spend month-by-month
        let cumulative = actualsYTD;
        let exhausted = false;
        const startIndex = getMonthIndex(asOfMonth) + 1;
        
        for (let i = startIndex; i < MONTHS.length; i++) {
          cumulative += forecastByMonth[MONTHS[i]] || 0;
          if (cumulative >= fyBudget) {
            exhaustionMonth = MONTH_LABELS[MONTHS[i]];
            exhausted = true;
            break;
          }
        }
        
        if (!exhausted) {
          exhaustionMonth = 'Not exhausted by FY end';
          const endingRemainder = fyBudget - cumulative;
          if (endingRemainder > 0) {
            exhaustionNote = `Est. ${formatCurrency(endingRemainder)} remaining at FY end`;
          }
        }
      }
    }
    
    // Progress percentage
    const usedPct = fyBudget > 0 ? Math.min(100, (actualsYTD / fyBudget) * 100) : 0;
    
    return {
      fyBudget,
      actualsYTD,
      remainingBudget,
      burnPerMonth,
      runwayMonths,
      exhaustionMonth,
      exhaustionNote,
      usedPct,
      monthsElapsed,
      monthsRemaining,
    };
  }, [selectedFiscalYear, forecastCCs, actualsByMonth, asOfMonth, burnMode]);
  
  // Check if we have any actuals
  const hasActuals = actualsRollup && actualsRollup.summary.matchedCount > 0;
  
  // Render empty states
  if (!initialized || isLoadingActuals) {
    return (
      <div>
        <PageHeader
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
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
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Select a fiscal year to view burn rate analysis.
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (selectedFiscalYear.status !== 'active') {
    return (
      <div>
        <PageHeader
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Burn rate analysis available after budget approval (FY must be Active).
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!hasActuals) {
    return (
      <div>
        <PageHeader
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
        />
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => navigate('/reports')} 
          className="gap-2 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Card className="max-w-lg mx-auto">
          <CardContent className="p-8 text-center space-y-4">
            <Receipt className="h-12 w-12 mx-auto text-muted-foreground" />
            <div className="space-y-2">
              <h3 className="font-medium">No Actuals Data</h3>
              <p className="text-sm text-muted-foreground">
                No actuals found for this fiscal year. Import and match transactions to view burn rate analysis.
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
  
  if (!calculations) {
    return (
      <div>
        <PageHeader
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Unable to calculate burn rate.
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
        <h1 className="text-2xl font-bold">Burn Rate / Runway — {selectedFiscalYear?.name || 'FY'}</h1>
        <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      
      <div className="flex items-center justify-between">
        <PageHeader
          title="Burn Rate / Runway"
          description="Track spending velocity and forecast when budget will be exhausted"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 no-print"
          onClick={() => exportReportToPdf(`${selectedFiscalYear?.name || 'FY'}_Burn_Rate_Runway`)}
        >
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
      </div>
      
      <Card className="no-print">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Mode Toggle */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">Burn Rate Mode</label>
              <ToggleGroup
                type="single"
                value={burnMode}
                onValueChange={(value) => value && setBurnMode(value as BurnMode)}
                className="justify-start"
              >
                <ToggleGroupItem value="actuals_constant" className="text-xs">
                  Actuals burn (constant)
                </ToggleGroupItem>
                <ToggleGroupItem value="forecast_adjusted" className="text-xs">
                  Forecast-adjusted burn
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            
            {/* As-of Month Selector */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">As of Month</label>
              <Select value={asOfMonth} onValueChange={(v) => setAsOfMonth(v as Month)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month} value={month}>
                      {MONTH_LABELS[month]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">FY Budget</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(calculations.fyBudget)}</div>
            <p className="text-xs text-muted-foreground">
              {selectedFiscalYear.name} approved budget
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Actuals YTD</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(calculations.actualsYTD)}</div>
            <p className="text-xs text-muted-foreground">
              Through {MONTH_LABELS[asOfMonth]} ({calculations.monthsElapsed} months)
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Burn Rate</CardTitle>
            <Flame className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(calculations.burnPerMonth)}/mo</div>
            <p className="text-xs text-muted-foreground">
              {burnMode === 'actuals_constant' 
                ? 'Avg actual spend per month' 
                : 'Avg forecasted spend remaining'}
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Runway</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {calculations.runwayMonths === Infinity 
                ? '∞' 
                : `${formatMonths(calculations.runwayMonths)} mo`}
            </div>
            <p className="text-xs text-muted-foreground">
              {calculations.exhaustionNote || `Exhaustion: ${calculations.exhaustionMonth}`}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Budget Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Budget Utilization</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Used: {formatCurrency(calculations.actualsYTD)}</span>
              <span>Remaining: {formatCurrency(calculations.remainingBudget)}</span>
            </div>
            <Progress 
              value={calculations.usedPct} 
              className="h-4"
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{calculations.usedPct.toFixed(1)}% used</span>
              <span>{(100 - calculations.usedPct).toFixed(1)}% available</span>
            </div>
          </div>
          
          {/* Mode explanation */}
          <div className="pt-4 border-t">
            <div className="text-sm text-muted-foreground">
              {burnMode === 'actuals_constant' ? (
                <p>
                  <strong>Actuals burn (constant):</strong> Projects runway by assuming future months 
                  will spend at the same average rate as YTD actuals ({formatCurrency(calculations.burnPerMonth)}/month).
                </p>
              ) : (
                <p>
                  <strong>Forecast-adjusted burn:</strong> Uses remaining forecast amounts for months 
                  after {MONTH_LABELS[asOfMonth]} to project runway based on planned spend.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
