import { useState, useEffect, useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import type { 
  ParsedImportData, 
  ColumnMapping, 
  ImportedTransactionDraft,
  MappingValidationError 
} from "@/types/import";
import { MONTH_LABELS } from "@/types/budget";
import { autoDetectColumns, normalizeTransactions, formatUSD } from "@/lib/import";

interface MappingStepProps {
  data: ParsedImportData;
  onBack: () => void;
  onContinue: (result: { mapping: ColumnMapping; transactions: ImportedTransactionDraft[] }) => void;
}

const NONE_VALUE = "__none__";

export function MappingStep({ data, onBack, onContinue }: MappingStepProps) {
  const { headers, rows } = data;
  
  // Initialize with auto-detected values
  const [dateColumn, setDateColumn] = useState<string>("");
  const [amountColumn, setAmountColumn] = useState<string>("");
  const [vendorColumn, setVendorColumn] = useState<string>("");
  const [memoColumn, setMemoColumn] = useState<string>(NONE_VALUE);
  const [amountSignMode, setAmountSignMode] = useState<'expenses_negative' | 'expenses_positive'>('expenses_positive');
  
  // Auto-detect on mount
  useEffect(() => {
    const detected = autoDetectColumns(headers);
    if (detected.dateColumn) setDateColumn(detected.dateColumn);
    if (detected.amountColumn) setAmountColumn(detected.amountColumn);
    if (detected.vendorColumn) setVendorColumn(detected.vendorColumn);
    if (detected.memoColumn) setMemoColumn(detected.memoColumn);
    if (detected.amountSignMode) setAmountSignMode(detected.amountSignMode);
  }, [headers]);
  
  // Check if required fields are selected
  const isConfigComplete = dateColumn && amountColumn && vendorColumn;
  
  // Normalize transactions when mapping changes
  const { transactions, errors } = useMemo(() => {
    if (!isConfigComplete) {
      return { transactions: [], errors: [] };
    }
    
    const mapping: ColumnMapping = {
      dateColumn,
      amountColumn,
      vendorColumn,
      memoColumn: memoColumn !== NONE_VALUE ? memoColumn : undefined,
      amountSignMode,
    };
    
    return normalizeTransactions(rows, mapping);
  }, [rows, dateColumn, amountColumn, vendorColumn, memoColumn, amountSignMode, isConfigComplete]);
  
  const validCount = transactions.length;
  const invalidCount = errors.length;
  const canContinue = isConfigComplete && invalidCount === 0 && validCount > 0;
  
  const handleContinue = () => {
    if (!canContinue) return;
    
    const mapping: ColumnMapping = {
      dateColumn,
      amountColumn,
      vendorColumn,
      memoColumn: memoColumn !== NONE_VALUE ? memoColumn : undefined,
      amountSignMode,
    };
    
    onContinue({ mapping, transactions });
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Map Columns</h2>
        <p className="text-sm text-muted-foreground">
          Select which CSV columns correspond to each transaction field.
        </p>
      </div>
      
      {/* Column Mapping */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="date-column">
            Transaction Date <span className="text-destructive">*</span>
          </Label>
          <Select value={dateColumn} onValueChange={setDateColumn}>
            <SelectTrigger id="date-column">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="amount-column">
            Amount <span className="text-destructive">*</span>
          </Label>
          <Select value={amountColumn} onValueChange={setAmountColumn}>
            <SelectTrigger id="amount-column">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="vendor-column">
            Vendor Name <span className="text-destructive">*</span>
          </Label>
          <Select value={vendorColumn} onValueChange={setVendorColumn}>
            <SelectTrigger id="vendor-column">
              <SelectValue placeholder="Select column" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="memo-column">Memo / Description</Label>
          <Select value={memoColumn} onValueChange={setMemoColumn}>
            <SelectTrigger id="memo-column">
              <SelectValue placeholder="Select column (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_VALUE}>None</SelectItem>
              {headers.map((header) => (
                <SelectItem key={header} value={header}>
                  {header}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Amount Sign Mode */}
      <div className="space-y-3">
        <Label>Amount Sign Interpretation</Label>
        <RadioGroup 
          value={amountSignMode} 
          onValueChange={(v) => setAmountSignMode(v as 'expenses_negative' | 'expenses_positive')}
          className="flex flex-col sm:flex-row gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="expenses_negative" id="neg" />
            <Label htmlFor="neg" className="font-normal cursor-pointer">
              Expenses are negative
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="expenses_positive" id="pos" />
            <Label htmlFor="pos" className="font-normal cursor-pointer">
              Expenses are positive
            </Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Many bank exports represent spend as negative numbers. Choose how your CSV represents expenses.
        </p>
      </div>
      
      {/* Validation Summary */}
      {isConfigComplete && (
        <div className="space-y-4">
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Valid rows: {validCount}
            </div>
            {invalidCount > 0 && (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                Invalid rows: {invalidCount}
              </div>
            )}
          </div>
          
          {/* Error Messages */}
          {errors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-medium mb-1">Validation errors (fix to continue):</p>
                <ul className="list-disc list-inside text-sm">
                  {errors.slice(0, 5).map((err, i) => (
                    <li key={i}>Row {err.rowIndex}: {err.message}</li>
                  ))}
                  {errors.length > 5 && (
                    <li>...and {errors.length - 5} more errors</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          
          {/* Preview Table */}
          {transactions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">
                Preview (first {Math.min(10, transactions.length)} of {transactions.length})
              </h3>
              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Vendor</TableHead>
                        {memoColumn !== NONE_VALUE && <TableHead>Memo</TableHead>}
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
                          {memoColumn !== NONE_VALUE && (
                            <TableCell className="max-w-[150px] truncate">
                              {tx.memo || "—"}
                            </TableCell>
                          )}
                          <TableCell>{MONTH_LABELS[tx.recognizedMonth]}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Preview
        </Button>
        <Button onClick={handleContinue} disabled={!canContinue}>
          Continue to Confirm
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
