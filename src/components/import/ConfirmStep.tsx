import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import type { ImportedTransactionDraft } from "@/types/import";
import { MONTH_LABELS } from "@/types/budget";
import { formatUSD } from "@/lib/import";

interface ConfirmStepProps {
  transactions: ImportedTransactionDraft[];
  onBack: () => void;
  onContinue: () => void;
}

export function ConfirmStep({ transactions, onBack, onContinue }: ConfirmStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Confirm Import</h2>
        <p className="text-sm text-muted-foreground">
          Review the normalized transactions before proceeding to vendor normalization.
        </p>
      </div>
      
      {/* Summary */}
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">{transactions.length} transactions ready for import</span>
      </div>
      
      {/* Preview Table */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">
          Preview (first {Math.min(10, transactions.length)} of {transactions.length})
        </h3>
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[350px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted">
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Memo</TableHead>
                  <TableHead>Month</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.slice(0, 10).map((tx) => (
                  <TableRow key={tx.rowIndex}>
                    <TableCell className="text-muted-foreground">{tx.rowIndex}</TableCell>
                    <TableCell>{tx.transactionDate}</TableCell>
                    <TableCell className="text-right font-mono">
                      {formatUSD(tx.amount)}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {tx.rawVendorName}
                    </TableCell>
                    <TableCell className="max-w-[150px] truncate">
                      {tx.memo || "—"}
                    </TableCell>
                    <TableCell>{MONTH_LABELS[tx.recognizedMonth]}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
      
      {/* Next Steps Info */}
      <div className="bg-muted/50 rounded-lg p-4 text-sm">
        <p className="font-medium mb-1">Next steps:</p>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li><strong>Vendor normalization</strong> — map raw vendor names to canonical vendors</li>
          <li>Line item mapping — assign transactions to budget line items</li>
          <li>Post to Actuals — commit transactions to the actuals sheet</li>
        </ul>
      </div>
      
      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Mapping
        </Button>
        <Button onClick={onContinue}>
          Continue to Vendor Normalization
        </Button>
      </div>
    </div>
  );
}
