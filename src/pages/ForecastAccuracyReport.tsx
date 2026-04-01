import { useState, useMemo, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { loadForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import { useEnsureActualsLoaded } from '@/hooks/useEnsureActualsLoaded';
import { MONTHS, MONTH_LABELS, Month, MonthlyValues, CostCenter } from '@/types/budget';
import { ArrowLeft, Receipt, Target, Loader2, FileDown } from 'lucide-react';
import { exportReportToPdf } from '@/lib/exportPdf';
import { getLatestActualsMonthFromLineItems, getMonthIndex } from '@/lib/ytdHelpers';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Sum monthly values from start through asOfMonthIndex (inclusive).
 */
function sumThrough(values: MonthlyValues, throughIndex: number): number {
  let total = 0;
  for (let i = 0; i <= throughIndex; i++) {
    total += values[MONTHS[i]] || 0;
  }
  return total;
}

/**
 * Calculate accuracy for a given cumulative forecast vs cumulative actual.
 * Accuracy = 1 - (|ForecastCum - ActualCum| / max(ForecastCum, 1))
 * Clamped to [0, 1]
 */
function calculateAccuracy(forecastCum: number, actualCum: number): number {
  // Edge case: both are 0 -> 100% accurate
  if (forecastCum === 0 && actualCum === 0) {
    return 1;
  }
  // Edge case: forecast is 0 but actual is not -> 0% accurate
  if (forecastCum === 0) {
    return 0;
  }
  const accuracy = 1 - (Math.abs(forecastCum - actualCum) / forecastCum);
  return Math.max(0, Math.min(1, accuracy));
}

interface ChartDataPoint {
  month: string;
  monthLabel: string;
  accuracy: number;
  forecastCum: number;
  actualCum: number;
}

export default function ForecastAccuracyReport() {
  const navigate = useNavigate();
  const { selectedFiscalYear, selectedFiscalYearId } = useFiscalYearBudget();
  
  const [forecastCCs, setForecastCCs] = useState<CostCenter[] | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [exporting, setExporting] = useState(false);
  
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
  
  // Determine the latest month with actuals
  const latestActualsMonthIndex = useMemo(() => {
    if (!actualsRollup) return -1;
    const allActualsByMonth = actualsRollup.lineItems.map(li => li.actualByMonth);
    const latestMonth = getLatestActualsMonthFromLineItems(allActualsByMonth);
    return latestMonth ? getMonthIndex(latestMonth) : -1;
  }, [actualsRollup]);
  
  // Compute aggregate monthly totals
  const { forecastByMonth, actualsByMonth } = useMemo(() => {
    const forecast: MonthlyValues = {
      feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
      aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
    };
    const actuals: MonthlyValues = {
      feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
      aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
    };
    
    if (forecastCCs) {
      for (const cc of forecastCCs) {
        for (const li of cc.lineItems) {
          for (const month of MONTHS) {
            forecast[month] += li.forecastValues[month] || 0;
          }
        }
      }
    }
    
    if (actualsRollup) {
      for (const li of actualsRollup.lineItems) {
        for (const month of MONTHS) {
          actuals[month] += li.actualByMonth[month] || 0;
        }
      }
    }
    
    return { forecastByMonth: forecast, actualsByMonth: actuals };
  }, [forecastCCs, actualsRollup]);
  
  // Compute chart data (cumulative accuracy by month)
  const chartData = useMemo((): ChartDataPoint[] => {
    if (latestActualsMonthIndex < 0) return [];
    
    const data: ChartDataPoint[] = [];
    
    for (let i = 0; i <= latestActualsMonthIndex; i++) {
      const month = MONTHS[i];
      const forecastCum = sumThrough(forecastByMonth, i);
      const actualCum = sumThrough(actualsByMonth, i);
      const accuracy = calculateAccuracy(forecastCum, actualCum);
      
      data.push({
        month,
        monthLabel: MONTH_LABELS[month],
        accuracy,
        forecastCum,
        actualCum,
      });
    }
    
    return data;
  }, [forecastByMonth, actualsByMonth, latestActualsMonthIndex]);
  
  // YTD accuracy (as of latest month)
  const ytdAccuracy = useMemo(() => {
    if (chartData.length === 0) return null;
    return chartData[chartData.length - 1].accuracy;
  }, [chartData]);
  
  // Check if we have any actuals
  const hasActuals = actualsRollup && actualsRollup.summary.matchedCount > 0;
  
  // Chart config
  const chartConfig = {
    accuracy: {
      label: 'Accuracy',
      color: 'hsl(var(--primary))',
    },
  };
  
  // Custom tooltip formatter
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    
    const data = payload[0].payload as ChartDataPoint;
    
    return (
      <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-sm shadow-xl">
        <div className="font-medium mb-1">{data.monthLabel}</div>
        <div className="space-y-0.5 text-muted-foreground">
          <div>Forecast (Cum): {formatCurrency(data.forecastCum)}</div>
          <div>Actuals (Cum): {formatCurrency(data.actualCum)}</div>
          <div className="font-medium text-foreground">
            Accuracy: {formatPct(data.accuracy)}
          </div>
        </div>
      </div>
    );
  };
  
  // Render empty states
  if (!initialized || isLoadingActuals) {
    return (
      <div>
        <PageHeader
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
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
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Select a fiscal year to view forecast accuracy.
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (selectedFiscalYear.status !== 'active') {
    return (
      <div>
        <PageHeader
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
        />
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            Forecast accuracy available after budget approval (FY must be Active).
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (!hasActuals) {
    return (
      <div>
        <PageHeader
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
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
                No actuals found for this fiscal year. Import and match transactions to view forecast accuracy.
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
  
  if (chartData.length === 0) {
    return (
      <div>
        <PageHeader
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
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
            Unable to calculate forecast accuracy.
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
        <h1 className="text-2xl font-bold">Forecast Accuracy — {selectedFiscalYear?.name || 'FY'}</h1>
        <p className="text-sm text-muted-foreground">Generated {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
      </div>
      
      <div className="flex items-center justify-between">
        <PageHeader
          title="Forecast Accuracy"
          description="Measure how accurately forecasts predict actual spending"
        />
        <Button
          variant="outline"
          size="sm"
          className="gap-2 no-print"
          onClick={() => exportReportToPdf(`${selectedFiscalYear?.name || 'FY'}_Forecast_Accuracy`)}
        >
          <FileDown className="h-4 w-4" />
          Export PDF
        </Button>
      </div>
      
      {/* YTD Accuracy KPI */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">YTD Forecast Accuracy</CardTitle>
          <Target className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold">
            {ytdAccuracy !== null ? formatPct(ytdAccuracy) : '—'}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Through {chartData.length > 0 ? chartData[chartData.length - 1].monthLabel : '—'}
          </p>
        </CardContent>
      </Card>
      
      {/* Line Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">
            Cumulative Forecast Accuracy by Month
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart data={chartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="monthLabel"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(value) => `${(value * 100).toFixed(0)}%`}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                width={50}
              />
              <ChartTooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="accuracy"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>
      
      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-medium">Monthly Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium sticky top-0 bg-background">Month</th>
                  <th className="text-right py-2 font-medium sticky top-0 bg-background">Forecast (Cum)</th>
                  <th className="text-right py-2 font-medium sticky top-0 bg-background">Actuals (Cum)</th>
                  <th className="text-right py-2 font-medium sticky top-0 bg-background">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {chartData.map((row) => (
                  <tr key={row.month} className="border-b last:border-0">
                    <td className="py-2">{row.monthLabel}</td>
                    <td className="text-right py-2 text-muted-foreground">
                      {formatCurrency(row.forecastCum)}
                    </td>
                    <td className="text-right py-2 text-muted-foreground">
                      {formatCurrency(row.actualCum)}
                    </td>
                    <td className="text-right py-2 font-medium">
                      {formatPct(row.accuracy)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
