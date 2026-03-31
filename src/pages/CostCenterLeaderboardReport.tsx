import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY, saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { useEnsureActualsLoaded } from '@/hooks/useEnsureActualsLoaded';
import { MONTHS, CostCenter, MonthlyValues } from '@/types/budget';
import { ArrowLeft, Receipt, ArrowUpDown, Loader2 } from 'lucide-react';
import { getLatestActualsMonthFromLineItems, getMonthIndex } from '@/lib/ytdHelpers';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/lib/format';

function formatVariance(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

function formatPct(pct: number | null): string {
  if (pct === null) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(1)}%`;
}

/**
 * Sum monthly values from start through asOfMonth (inclusive).
 */
function sumYTD(values: MonthlyValues, asOfMonthIndex: number): number {
  let total = 0;
  for (let i = 0; i <= asOfMonthIndex; i++) {
    total += values[MONTHS[i]] || 0;
  }
  return total;
}

interface CostCenterData {
  id: string;
  name: string;
  actualsTotal: number;
  forecastTotal: number;
  variance: number;
  variancePct: number | null;
}

export default function CostCenterLeaderboardReport() {
  const navigate = useNavigate();
  const { selectedFiscalYear, selectedFiscalYearId } = useFiscalYearBudget();
  
  const [forecastCCs, setForecastCCs] = useState<CostCenter[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  // Sort controls for each leaderboard
  const [spendSort, setSpendSort] = useState<SortDirection>('high_low');
  const [varianceSort, setVarianceSort] = useState<SortDirection>('high_low');
  
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
  
  // Determine the latest month with actuals
  const latestActualsMonthIndex = useMemo(() => {
    if (!actualsRollup) return -1;
    const allActualsByMonth = actualsRollup.lineItems.map(li => li.actualByMonth);
    const latestMonth = getLatestActualsMonthFromLineItems(allActualsByMonth);
    return latestMonth ? getMonthIndex(latestMonth) : -1;
  }, [actualsRollup]);
  
  // Compute cost center data (YTD through latest actuals month)
  const costCenterData = useMemo((): CostCenterData[] => {
    if (!forecastCCs || !actualsRollup || latestActualsMonthIndex < 0) {
      return [];
    }
    
    const result: CostCenterData[] = [];
    
    for (const cc of forecastCCs) {
      // Sum actuals YTD for this cost center
      let actualsTotal = 0;
      for (const li of cc.lineItems) {
        const rollupItem = actualsRollup.lineItems.find(
          r => r.lineItemId === li.id && r.costCenterId === cc.id
        );
        if (rollupItem) {
          actualsTotal += sumYTD(rollupItem.actualByMonth, latestActualsMonthIndex);
        }
      }
      
      // Sum forecast YTD for this cost center (same timeframe)
      let forecastTotal = 0;
      for (const li of cc.lineItems) {
        forecastTotal += sumYTD(li.forecastValues, latestActualsMonthIndex);
      }
      
      const variance = actualsTotal - forecastTotal;
      const variancePct = forecastTotal !== 0 ? variance / forecastTotal : null;
      
      result.push({
        id: cc.id,
        name: cc.name,
        actualsTotal,
        forecastTotal,
        variance,
        variancePct,
      });
    }
    
    return result;
  }, [forecastCCs, actualsRollup, latestActualsMonthIndex]);
  
  // Sorted data for spend leaderboard
  const spendLeaderboard = useMemo(() => {
    const sorted = [...costCenterData].sort((a, b) => {
      if (spendSort === 'high_low') {
        return b.actualsTotal - a.actualsTotal;
      } else {
        return a.actualsTotal - b.actualsTotal;
      }
    });
    return sorted.slice(0, 10);
  }, [costCenterData, spendSort]);
  
  // Sorted data for variance leaderboard
  const varianceLeaderboard = useMemo(() => {
    const sorted = [...costCenterData].sort((a, b) => {
      if (varianceSort === 'high_low') {
        return Math.abs(b.variance) - Math.abs(a.variance);
      } else {
        return Math.abs(a.variance) - Math.abs(b.variance);
      }
    });
    return sorted.slice(0, 10);
  }, [costCenterData, varianceSort]);
  
  // Max values for bar scaling
  const maxActuals = useMemo(() => {
    return Math.max(...spendLeaderboard.map(cc => cc.actualsTotal), 1);
  }, [spendLeaderboard]);
  
  const maxAbsVariance = useMemo(() => {
    return Math.max(...varianceLeaderboard.map(cc => Math.abs(cc.variance)), 1);
  }, [varianceLeaderboard]);
  
  // Check if we have any actuals
  const hasActuals = actualsRollup && actualsRollup.summary.matchedCount > 0;
  
  // Render empty states
  if (!initialized || isLoadingActuals) {
    return (
      <div>
        <PageHeader
          title="Cost Center Leaderboard"
          description="Rank cost centers by spend and variance"
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
          title="Cost Center Leaderboard"
          description="Rank cost centers by spend and variance"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Select a fiscal year to view the leaderboard.
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (selectedFiscalYear.status !== 'active') {
    return (
      <div>
        <PageHeader
          title="Cost Center Leaderboard"
          description="Rank cost centers by spend and variance"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Leaderboard available after budget approval (FY must be Active).
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!hasActuals) {
    return (
      <div>
        <PageHeader
          title="Cost Center Leaderboard"
          description="Rank cost centers by spend and variance"
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
                No actuals found for this fiscal year. Import and match transactions to view the leaderboard.
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
  
  if (costCenterData.length === 0) {
    return (
      <div>
        <PageHeader
          title="Cost Center Leaderboard"
          description="Rank cost centers by spend and variance"
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
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No cost center data available.
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
      
      <PageHeader
        title="Cost Center Leaderboard"
        description="Rank cost centers by spend and variance"
      />
      
      {/* Two leaderboards side by side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Leaderboard A: Total Spend */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-medium">Total Spend by Cost Center</CardTitle>
            <ToggleGroup
              type="single"
              value={spendSort}
              onValueChange={(value) => value && setSpendSort(value as SortDirection)}
              size="sm"
            >
              <ToggleGroupItem value="high_low" className="text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                High → Low
              </ToggleGroupItem>
              <ToggleGroupItem value="low_high" className="text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                Low → High
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent className="space-y-3">
            {spendLeaderboard.map((cc) => {
              const barWidth = (cc.actualsTotal / maxActuals) * 100;
              return (
                <div key={cc.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[200px]">{cc.name}</span>
                    <span className="text-muted-foreground">{formatCurrency(cc.actualsTotal)}</span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {spendLeaderboard.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            )}
          </CardContent>
        </Card>
        
        {/* Leaderboard B: Forecast vs Actuals Variance */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <CardTitle className="text-lg font-medium">Forecast vs Actuals Variance</CardTitle>
            <ToggleGroup
              type="single"
              value={varianceSort}
              onValueChange={(value) => value && setVarianceSort(value as SortDirection)}
              size="sm"
            >
              <ToggleGroupItem value="high_low" className="text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                High → Low
              </ToggleGroupItem>
              <ToggleGroupItem value="low_high" className="text-xs">
                <ArrowUpDown className="h-3 w-3 mr-1" />
                Low → High
              </ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent className="space-y-3">
            {varianceLeaderboard.map((cc) => {
              const barWidth = (Math.abs(cc.variance) / maxAbsVariance) * 100;
              const isOverspend = cc.variance > 0;
              const isUnderspend = cc.variance < 0;
              
              return (
                <div key={cc.id} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate max-w-[180px]">{cc.name}</span>
                    <span className={cn(
                      "font-medium",
                      isOverspend && "text-destructive",
                      isUnderspend && "text-green-600 dark:text-green-500"
                    )}>
                      {formatVariance(cc.variance)}
                      {cc.variancePct !== null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({formatPct(cc.variancePct)})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        isOverspend && "bg-destructive",
                        isUnderspend && "bg-green-600 dark:bg-green-500",
                        cc.variance === 0 && "bg-muted-foreground"
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {varianceLeaderboard.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No data</p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Legend */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-destructive" />
              <span className="text-muted-foreground">Overspend (Actuals &gt; Forecast)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-600 dark:bg-green-500" />
              <span className="text-muted-foreground">Underspend (Actuals &lt; Forecast)</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
