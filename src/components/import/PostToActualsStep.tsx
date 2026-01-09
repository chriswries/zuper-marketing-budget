import { useState, useMemo } from "react";
import { ArrowLeft, CheckCircle2, Upload, Trash2, ExternalLink, Loader2 } from "lucide-react";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "react-router-dom";
import type { ImportedTransactionMapped } from "@/types/import";
import type { ActualsImportBatch } from "@/types/actualsImport";
import type { ActualsTransaction } from "@/types/actuals";
import type { Month } from "@/types/budget";
import { MONTH_LABELS } from "@/types/budget";
import { formatUSD } from "@/lib/import";
import { useAdminSettings } from "@/contexts/AdminSettingsContext";
import { formatDate } from "@/lib/dateTime";
import {
  saveLatestActualsImport,
  loadLatestActualsImport,
  clearLatestActualsImport,
  clearLegacyActualsImportLocalStorage,
  hasLegacyActualsImportData,
} from "@/lib/actualsImportStore";
import { appendActuals } from "@/lib/actualsStore";
import { toast } from "@/hooks/use-toast";

interface PostToActualsStepProps {
  transactions: ImportedTransactionMapped[];
  fileName?: string;
  fiscalYearId: string;
  fiscalYearName: string;
  onBack: () => void;
  onPosted: (batchId: string) => void;
}

/**
 * Convert ImportedTransactionMapped to ActualsTransaction for DB storage.
 * 
 * Field mapping:
 * - id: Pure UUID (DB column is text, but we use clean UUIDs for consistency)
 * - fiscalYearId: From wizard's selected fiscal year
 * - txnDate: ISO date string from transactionDate
 * - merchantName: Canonical vendor name for display
 * - description: Memo from import
 * - amount: Dollar amount (numeric, NOT cents) - already in correct unit from import
 * - canonicalVendorId: UUID reference to canonical_vendors table
 * - raw: JSON blob for traceability containing:
 *   - rowIndex, rawVendorName, recognizedMonth (fiscal month)
 *   - costCenterId, costCenterName, lineItemId, lineItemName (mapped forecast refs)
 *   - memo, transactionDate (original import values)
 */
function convertToActualsTransaction(
  txn: ImportedTransactionMapped,
  fiscalYearId: string
): ActualsTransaction {
  return {
    id: crypto.randomUUID(), // Pure UUID - DB txn_id column is text type
    source: 'bank', // Default to bank for imported transactions
    fiscalYearId,
    txnDate: txn.transactionDate, // ISO date string (YYYY-MM-DD)
    merchantName: txn.canonicalVendorName,
    description: txn.memo,
    amount: txn.amount, // Dollar amount (numeric, not cents)
    currency: 'USD',
    raw: {
      // Original import data for traceability
      rowIndex: txn.rowIndex,
      rawVendorName: txn.rawVendorName,
      memo: txn.memo,
      transactionDate: txn.transactionDate,
      // Fiscal month for reconciliation
      recognizedMonth: txn.recognizedMonth,
      // Mapped forecast references (no dedicated DB columns, stored in raw JSON)
      costCenterId: txn.costCenterId,
      costCenterName: txn.costCenterName,
      lineItemId: txn.lineItemId,
      lineItemName: txn.lineItemName,
    },
    createdAt: new Date().toISOString(),
    canonicalVendorId: txn.canonicalVendorId || null,
  };
}

export function PostToActualsStep({
  transactions,
  fileName,
  fiscalYearId,
  fiscalYearName,
  onBack,
  onPosted,
}: PostToActualsStepProps) {
  const navigate = useNavigate();
  const { settings: adminSettings } = useAdminSettings();
  const [isPosted, setIsPosted] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showLegacyCleanupDialog, setShowLegacyCleanupDialog] = useState(false);
  const [postedBatchId, setPostedBatchId] = useState<string | null>(null);
  const [clearedBatch, setClearedBatch] = useState(false);
  const [clearedLegacyData, setClearedLegacyData] = useState(false);

  // Check if there's an existing import
  const existingBatch = useMemo(() => loadLatestActualsImport(), []);
  
  // Check if legacy data exists (only compute once, then track via state)
  const initialHasLegacy = useMemo(() => hasLegacyActualsImportData(), []);
  const hasLegacyData = initialHasLegacy && !clearedLegacyData;

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

  const handlePostClick = () => {
    setShowConfirmDialog(true);
  };

  const handleConfirmPost = async () => {
    setShowConfirmDialog(false);
    
    if (!fiscalYearId) {
      toast({
        title: "Error",
        description: "No fiscal year selected. Please go back and select a fiscal year.",
        variant: "destructive",
      });
      return;
    }

    setIsPosting(true);

    try {
      // 1. Convert transactions to DB format
      const actualsTransactions: ActualsTransaction[] = transactions.map(txn =>
        convertToActualsTransaction(txn, fiscalYearId)
      );

      // 2. Persist to database
      await appendActuals(fiscalYearId, actualsTransactions);

      // 3. After successful DB write, save to localStorage as audit receipt
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

      // 4. Update state and notify parent
      setIsPosted(true);
      setPostedBatchId(batchId);
      onPosted(batchId);

      toast({
        title: "Success",
        description: `${transactions.length} transactions posted to Actuals.`,
      });
    } catch (error) {
      console.error("Failed to post actuals:", error);
      toast({
        title: "Failed to Post Actuals",
        description: error instanceof Error ? error.message : "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const handleClearExisting = () => {
    clearLatestActualsImport();
    setClearedBatch(true);
  };

  const handleClearLegacyData = () => {
    const result = clearLegacyActualsImportLocalStorage();
    setClearedLegacyData(true);
    setShowLegacyCleanupDialog(false);
    
    if (result.clearedKeys.length > 0) {
      toast({
        title: "Cleared legacy import data",
        description: `Removed ${result.clearedKeys.length} legacy storage key(s): ${result.clearedKeys.join(", ")}`,
      });
    } else {
      toast({
        title: "No legacy import data found",
        description: "No legacy localStorage keys were present.",
      });
    }
  };

  // Compute effective existing batch (null if cleared)
  const effectiveExistingBatch = clearedBatch ? null : existingBatch;

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
            {formatUSD(totalAmount)} have been saved to the database.
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
      {effectiveExistingBatch && (
        <Alert>
          <AlertDescription className="flex items-center justify-between">
            <span>
              An existing import exists ({effectiveExistingBatch.transactionCount}{" "}
              transactions from {effectiveExistingBatch.fileName || "unknown file"},
              posted {formatDate(effectiveExistingBatch.createdAt, adminSettings.timeZone)}).
              Posting will add more transactions.
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

      {/* Legacy data cleanup option */}
      {hasLegacyData && (
        <Alert variant="default" className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800 dark:text-amber-200">
              Legacy import data found in browser storage from before database persistence was added.
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLegacyCleanupDialog(true)}
              className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200 dark:hover:bg-amber-900"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear legacy data
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
        <Button variant="outline" onClick={onBack} disabled={isPosting}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Line Items
        </Button>
        <Button onClick={handlePostClick} disabled={isPosting}>
          {isPosting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Posting…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Post to Actuals
            </>
          )}
        </Button>
      </div>

      {/* Post Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Post actuals to {fiscalYearName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will add {transactions.length} transactions totaling {formatUSD(totalAmount)} to Actuals for {fiscalYearName}. You can't undo this from the import wizard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmPost}>Post Actuals</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Legacy Cleanup Confirmation Dialog */}
      <AlertDialog open={showLegacyCleanupDialog} onOpenChange={setShowLegacyCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear legacy import data?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes old Import Actuals data saved in your browser before database posting existed. This will NOT delete any Actuals saved to the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearLegacyData}>Clear</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
