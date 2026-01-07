import { useState, useMemo } from "react";
import { ArrowLeft, CheckCircle2, Upload, Trash2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useNavigate } from "react-router-dom";
import type { ImportedTransactionMapped } from "@/types/import";
import type { ActualsImportBatch } from "@/types/actualsImport";
import type { Month } from "@/types/budget";
import { MONTH_LABELS } from "@/types/budget";
import { formatUSD } from "@/lib/import";
import { useAdminSettings } from "@/contexts/AdminSettingsContext";
import { formatDate } from "@/lib/dateTime";
import {
  saveLatestActualsImport,
  loadLatestActualsImport,
  clearLatestActualsImport,
} from "@/lib/actualsImportStore";

interface PostToActualsStepProps {
  transactions: ImportedTransactionMapped[];
  fileName?: string;
  onBack: () => void;
  onPosted: (batchId: string) => void;
}

export function PostToActualsStep({
  transactions,
  fileName,
  onBack,
  onPosted,
}: PostToActualsStepProps) {
  const navigate = useNavigate();
  const { settings: adminSettings } = useAdminSettings();
  const [isPosted, setIsPosted] = useState(false);
  const [postedBatchId, setPostedBatchId] = useState<string | null>(null);

  // Check if there's an existing import
  const existingBatch = useMemo(() => loadLatestActualsImport(), []);

  // Compute totals
  const totalAmount = useMemo(
    () => transactions.reduce((sum, tx) => sum + tx.amount, 0),
    [transactions]
  );

  // Build aggregates: lineItemId -> month -> amount
  const aggregates = useMemo(() => {
    const agg: Record<string, Record<Month, number>> = {};
    for (const tx of transactions) {
      if (!agg[tx.lineItemId]) {
        agg[tx.lineItemId] = {} as Record<Month, number>;
      }
      const current = agg[tx.lineItemId][tx.recognizedMonth] || 0;
      agg[tx.lineItemId][tx.recognizedMonth] = Math.round(current + tx.amount);
    }
    return agg;
  }, [transactions]);

  const handlePost = () => {
    const batchId = `batch_${Date.now()}`;
    const batch: ActualsImportBatch = {
      id: batchId,
      createdAt: new Date().toISOString(),
      fileName,
      transactionCount: transactions.length,
      totalAmount: Math.round(totalAmount),
      aggregates,
      transactions,
    };

    saveLatestActualsImport(batch);
    setIsPosted(true);
    setPostedBatchId(batchId);
    onPosted(batchId);
  };

  const handleClearExisting = () => {
    clearLatestActualsImport();
    // Force re-render by navigating to same page
    window.location.reload();
  };

  const previewTransactions = transactions.slice(0, 10);

  if (isPosted) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-semibold mb-2">
            Successfully Posted to Actuals!
          </h2>
          <p className="text-muted-foreground mb-6">
            {transactions.length} transactions totaling{" "}
            {formatUSD(totalAmount)} have been saved.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Batch ID: {postedBatchId}
          </p>
          <div className="flex gap-3">
            <Button onClick={() => navigate("/actuals")}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Go to Actuals
            </Button>
            <Button variant="outline" onClick={() => navigate("/import")}>
              Import Another File
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Post to Actuals</h2>
        <p className="text-sm text-muted-foreground">
          Review and post the mapped transactions to the Actuals sheet.
        </p>
      </div>

      {/* Existing batch warning */}
      {existingBatch && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>
              An existing import exists ({existingBatch.transactionCount}{" "}
              transactions from {existingBatch.fileName || "unknown file"},
              posted {formatDate(existingBatch.createdAt, adminSettings.timeZone)}).
              Posting will overwrite it.
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearExisting}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Transactions</p>
          <p className="text-2xl font-bold">{transactions.length}</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Amount</p>
          <p className="text-2xl font-bold">{formatUSD(totalAmount)}</p>
        </div>
      </div>

      {/* Preview Table */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Preview (first {previewTransactions.length} of {transactions.length})
        </h3>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Line Item</TableHead>
                  <TableHead>Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewTransactions.map((tx, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{tx.transactionDate}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatUSD(tx.amount)}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {tx.canonicalVendorName}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      <span className="text-muted-foreground text-xs">
                        {tx.costCenterName} /
                      </span>{" "}
                      {tx.lineItemName}
                    </TableCell>
                    <TableCell>{MONTH_LABELS[tx.recognizedMonth]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Line Items
        </Button>
        <Button onClick={handlePost}>
          <Upload className="h-4 w-4 mr-2" />
          Post to Actuals
        </Button>
      </div>
    </div>
  );
}
