import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Upload, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';
import { loadLatestActualsImport, clearLatestActualsImport } from '@/lib/actualsImportStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { formatDateTime } from '@/lib/dateTime';
import type { ActualsImportBatch } from '@/types/actualsImport';
import type { CostCenter, MONTHS } from '@/types/budget';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function Actuals() {
  const navigate = useNavigate();
  const { settings: adminSettings } = useAdminSettings();
  const [importBatch, setImportBatch] = useState<ActualsImportBatch | null>(null);

  useEffect(() => {
    setImportBatch(loadLatestActualsImport());
  }, []);

  const handleClearImport = useCallback(() => {
    clearLatestActualsImport();
    setImportBatch(null);
  }, []);

  // Build display cost centers with imported actuals overlay
  const displayCostCenters = useMemo((): CostCenter[] => {
    // Deep clone mock data to avoid mutations
    const cloned: CostCenter[] = JSON.parse(JSON.stringify(mockCostCenters));

    if (!importBatch || !importBatch.aggregates) {
      return cloned;
    }

    // Overlay imported aggregates onto actualValues
    for (const costCenter of cloned) {
      for (const lineItem of costCenter.lineItems) {
        const lineAggregates = importBatch.aggregates[lineItem.id];
        if (lineAggregates) {
          // Reset all months to 0, then apply imported values
          const months: (keyof typeof lineItem.actualValues)[] = [
            'feb', 'mar', 'apr', 'may', 'jun', 'jul',
            'aug', 'sep', 'oct', 'nov', 'dec', 'jan'
          ];
          for (const month of months) {
            lineItem.actualValues[month] = lineAggregates[month] ?? 0;
          }
        } else {
          // No imported data for this line item - zero it out
          const months: (keyof typeof lineItem.actualValues)[] = [
            'feb', 'mar', 'apr', 'may', 'jun', 'jul',
            'aug', 'sep', 'oct', 'nov', 'dec', 'jan'
          ];
          for (const month of months) {
            lineItem.actualValues[month] = 0;
          }
        }
      }
    }

    return cloned;
  }, [importBatch]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actuals"
        description="Imported spend from bank and Ramp — reconciled monthly against forecast."
      />

      {/* Import Status Banner */}
      {importBatch ? (
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Actuals source: Imported CSV</CardTitle>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearImport}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear imported actuals
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              {importBatch.fileName && (
                <span>File: <span className="font-medium text-foreground">{importBatch.fileName}</span></span>
              )}
              <span>Posted: <span className="font-medium text-foreground">
                {formatDateTime(importBatch.createdAt, adminSettings.timeZone)}
              </span></span>
              <span>Transactions: <span className="font-medium text-foreground">
                {importBatch.transactionCount.toLocaleString()}
              </span></span>
              <span>Total: <span className="font-medium text-foreground">
                {formatCurrency(importBatch.totalAmount)}
              </span></span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-muted">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Actuals source: Mock data</CardTitle>
                <CardDescription>No import has been posted yet.</CardDescription>
              </div>
              <Button onClick={() => navigate('/import')}>
                <Upload className="mr-2 h-4 w-4" />
                Go to Import
              </Button>
            </div>
          </CardHeader>
        </Card>
      )}
      
      <SheetTable costCenters={displayCostCenters} valueType="actualValues" />
    </div>
  );
}
