import { useState, useEffect, useCallback } from "react";
import { Undo2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUserRole } from "@/contexts/CurrentUserRoleContext";
import { useAdminSettings } from "@/contexts/AdminSettingsContext";
import { formatDate } from "@/lib/dateTime";
import { formatCurrencyWithCents as formatUSD } from "@/lib/format";
import { invalidateActualsCache } from "@/lib/actualsStore";
import { invalidateMatchingCache } from "@/lib/actualsMatchingStore";

interface ImportBatch {
  id: string;
  fiscal_year_id: string;
  filename: string;
  source: string;
  row_count: number;
  total_amount: number;
  imported_at: string;
  imported_by_role: string;
  status: string;
  undone_at: string | null;
  undone_by_role: string | null;
}

interface ImportHistoryPanelProps {
  fiscalYearId: string;
  /** Bumped externally after a new import to trigger refresh */
  refreshKey?: number;
}

export function ImportHistoryPanel({ fiscalYearId, refreshKey }: ImportHistoryPanelProps) {
  const { toast } = useToast();
  const { currentRole } = useCurrentUserRole();
  const { settings: adminSettings } = useAdminSettings();

  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [legacyStats, setLegacyStats] = useState<{ count: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [undoing, setUndoing] = useState<string | null>(null);
  const [undoingLegacy, setUndoingLegacy] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<ImportBatch | null>(null);
  const [confirmLegacy, setConfirmLegacy] = useState(false);

  const canUndo = currentRole === "admin" || currentRole === "finance";

  const loadBatches = useCallback(async () => {
    if (!fiscalYearId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("import_batches")
        .select("*")
        .eq("fiscal_year_id", fiscalYearId)
        .order("imported_at", { ascending: false });

      if (error) {
        console.error("Failed to load import batches:", error);
      } else {
        setBatches((data as ImportBatch[]) ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [fiscalYearId]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches, refreshKey]);

  const handleUndo = async (batch: ImportBatch) => {
    setConfirmBatch(null);
    setUndoing(batch.id);

    try {
      // 1. Get txn_ids for this batch
      const { data: txnRows, error: txnErr } = await supabase
        .from("actuals_transactions")
        .select("txn_id")
        .eq("import_batch_id", batch.id);

      if (txnErr) throw new Error(`Failed to query transactions: ${txnErr.message}`);

      const txnIds = (txnRows ?? []).map((r) => r.txn_id);

      // 2. Delete matches for these transactions
      if (txnIds.length > 0) {
        const { error: matchErr } = await supabase
          .from("actuals_matches")
          .delete()
          .eq("fiscal_year_id", fiscalYearId)
          .in("txn_id", txnIds);

        if (matchErr) throw new Error(`Failed to delete matches: ${matchErr.message}`);
      }

      // 3. Delete the transactions
      const { error: delErr } = await supabase
        .from("actuals_transactions")
        .delete()
        .eq("import_batch_id", batch.id);

      if (delErr) throw new Error(`Failed to delete transactions: ${delErr.message}`);

      // 4. Mark batch as undone
      const { error: updErr } = await supabase
        .from("import_batches")
        .update({
          status: "undone",
          undone_at: new Date().toISOString(),
          undone_by_role: currentRole ?? "admin",
        })
        .eq("id", batch.id);

      if (updErr) throw new Error(`Failed to update batch status: ${updErr.message}`);

      // 5. Invalidate caches
      invalidateActualsCache(fiscalYearId);
      invalidateMatchingCache(fiscalYearId);

      // 6. Refresh list
      await loadBatches();

      toast({
        title: "Import undone",
        description: `${batch.row_count} transactions from "${batch.filename}" removed.`,
      });
    } catch (err) {
      console.error("Undo failed:", err);
      toast({
        title: "Undo failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setUndoing(null);
    }
  };

  if (!fiscalYearId) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Import History</CardTitle>
        <CardDescription>Past CSV imports for this fiscal year.</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && batches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No imports yet for this fiscal year.
          </p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Filename</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(batch.imported_at, adminSettings.timeZone)}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {batch.filename}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize text-xs">
                          {batch.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {batch.row_count.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatUSD(batch.total_amount)}
                      </TableCell>
                      <TableCell>
                        {batch.status === "active" ? (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Undone
                            {batch.undone_at && (
                              <span className="ml-1 opacity-70">
                                {formatDate(batch.undone_at, adminSettings.timeZone)}
                              </span>
                            )}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {batch.status === "active" && canUndo && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmBatch(batch)}
                            disabled={undoing === batch.id}
                            className="text-destructive hover:text-destructive"
                          >
                            {undoing === batch.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Undo2 className="h-4 w-4 mr-1" />
                                Undo
                              </>
                            )}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>

      {/* Undo Confirmation Dialog */}
      <AlertDialog
        open={!!confirmBatch}
        onOpenChange={(open) => !open && setConfirmBatch(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Undo import?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete {confirmBatch?.row_count} transactions totaling{" "}
              {confirmBatch ? formatUSD(confirmBatch.total_amount) : ""} from "
              {confirmBatch?.filename}". Matches for these transactions will also be
              removed. This cannot be undone. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmBatch && handleUndo(confirmBatch)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Transactions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
