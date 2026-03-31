/**
 * Actuals Import Page
 * 
 * This page only imports and stores transactions.
 * Matching/rollups to line items is implemented in Track B Prompt B2.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Info } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { getVisibleFiscalYears } from '@/lib/fiscalYearVisibility';
import { formatDate } from '@/lib/dateTime';
import { parseCsv } from '@/lib/csvParse';
import { loadActuals, appendActuals, replaceActuals, getActualsSummary } from '@/lib/actualsStore';
import type { 
  ActualsTransaction, 
  ActualsSource, 
  ColumnMapping, 
  ParsedRow 
} from '@/types/actuals';

type Step = 'upload' | 'mapping' | 'preview' | 'confirm';

// Helper to parse dates flexibly — returns YYYY-MM-DD string to avoid timezone shifts
function parseDate(value: string): string | null {
  if (!value) return null;
  
  const trimmed = value.trim();
  
  // ISO format (e.g. 2027-01-31T17:00:00Z) — extract date portion before T
  if (trimmed.includes('T')) {
    const datePart = trimmed.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  }
  
  // YYYY-MM-DD
  const dashMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashMatch) {
    return trimmed; // already in correct format
  }
  
  // MM/DD/YYYY or M/D/YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, month, day, year] = slashMatch;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  return null;
}

// Helper to parse amounts
function parseAmount(value: string): number | null {
  if (!value) return null;
  
  // Remove currency symbols, commas, spaces
  let cleaned = value.replace(/[$,\s]/g, '').trim();
  
  // Handle parentheses for negatives: (123.45) -> -123.45
  const parenMatch = cleaned.match(/^\((.+)\)$/);
  if (parenMatch) {
    cleaned = '-' + parenMatch[1];
  }
  
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

// Format currency
function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(amount);
}

export default function ActualsImport() {
  const navigate = useNavigate();
  const { fiscalYears } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();
  const { currentRole } = useCurrentUserRole();
  const { toast } = useToast();
  
  const visibleFiscalYears = getVisibleFiscalYears(fiscalYears, adminSettings.showArchivedFiscalYears);

  // Permission check
  const canImport = currentRole === 'admin' || currentRole === 'finance';

  // Wizard state
  const [step, setStep] = useState<Step>('upload');
  const [selectedFYId, setSelectedFYId] = useState<string>('');
  
  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  
  // Mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    txnDate: '',
    merchantName: '',
    amount: '',
  });
  const [source, setSource] = useState<ActualsSource>('unknown');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [skipInvalidRows, setSkipInvalidRows] = useState(true);

  // Reset wizard state when FY changes
  useEffect(() => {
    setFile(null);
    setCsvHeaders([]);
    setCsvRows([]);
    setMapping({ txnDate: '', merchantName: '', amount: '' });
    setSource('unknown');
    setReplaceExisting(false);
    setSkipInvalidRows(true);
    setStep('upload');
  }, [selectedFYId]);

  // Get selected FY
  const selectedFY = fiscalYears.find(fy => fy.id === selectedFYId);

  // Get existing summary for the FY
  const existingSummary = useMemo(() => {
    if (!selectedFYId) return null;
    const summary = getActualsSummary(selectedFYId);
    return summary.count > 0 ? summary : null;
  }, [selectedFYId]);

  // Handle file upload
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    
    setFile(f);
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCsv(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      
      // Auto-detect common column names
      const lowerHeaders = headers.map(h => h.toLowerCase());
      
      const autoMapping: ColumnMapping = { txnDate: '', merchantName: '', amount: '' };
      
      // Date detection
      const datePatterns = ['date', 'txn date', 'transaction date', 'posted'];
      for (const pattern of datePatterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pattern));
        if (idx !== -1) {
          autoMapping.txnDate = headers[idx];
          break;
        }
      }
      
      // Merchant detection
      const merchantPatterns = ['merchant', 'vendor', 'payee', 'description', 'name'];
      for (const pattern of merchantPatterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pattern));
        if (idx !== -1) {
          autoMapping.merchantName = headers[idx];
          break;
        }
      }
      
      // Amount detection
      const amountPatterns = ['amount', 'total', 'debit', 'credit'];
      for (const pattern of amountPatterns) {
        const idx = lowerHeaders.findIndex(h => h.includes(pattern));
        if (idx !== -1) {
          autoMapping.amount = headers[idx];
          break;
        }
      }
      
      // Category detection
      const catIdx = lowerHeaders.findIndex(h => h.includes('category'));
      if (catIdx !== -1) autoMapping.category = headers[catIdx];
      
      // Description detection (if not already used for merchant)
      const descIdx = lowerHeaders.findIndex((h, idx) => 
        h.includes('memo') || 
        (h.includes('description') && headers[idx] !== autoMapping.merchantName)
      );
      if (descIdx !== -1 && headers[descIdx] !== autoMapping.merchantName) {
        autoMapping.description = headers[descIdx];
      }
      
      setMapping(autoMapping);
    };
    reader.readAsText(f);
  }, []);

  // Parse rows with current mapping
  const parsedRows: ParsedRow[] = useMemo(() => {
    if (!mapping.txnDate || !mapping.merchantName || !mapping.amount) {
      return [];
    }

    return csvRows.map((row, index) => {
      const errors: string[] = [];
      
      // Parse date
      const dateValue = row[mapping.txnDate] ?? '';
      const parsedDate = parseDate(dateValue);
      if (!parsedDate) {
        errors.push(`Invalid date: "${dateValue}"`);
      }
      
      // Parse merchant
      const merchantValue = row[mapping.merchantName] ?? '';
      if (!merchantValue.trim()) {
        errors.push('Empty merchant name');
      }
      
      // Parse amount
      const amountValue = row[mapping.amount] ?? '';
      let parsedAmount = parseAmount(amountValue);
      if (parsedAmount === null) {
        errors.push(`Invalid amount: "${amountValue}"`);
      } else {
        // Always normalize to positive spend
        parsedAmount = Math.abs(parsedAmount);
      }
      
      // Optional fields
      const description = mapping.description ? row[mapping.description] : undefined;
      const category = mapping.category ? row[mapping.category] : undefined;
      const externalId = mapping.externalId ? row[mapping.externalId] : undefined;
      const postedDateValue = mapping.postedDate ? row[mapping.postedDate] : undefined;
      const postedDate = postedDateValue ? parseDate(postedDateValue) ?? undefined : undefined;

      return {
        rowIndex: index + 2, // 1-indexed, plus header row
        raw: row,
        txnDate: parsedDate ?? undefined,
        merchantName: merchantValue.trim() || undefined,
        amount: parsedAmount ?? undefined,
        description: description?.trim() || undefined,
        category: category?.trim() || undefined,
        externalId: externalId?.trim() || undefined,
        postedDate,
        errors,
      };
    });
  }, [csvRows, mapping]);

  // Stats
  const validRows = parsedRows.filter(r => r.errors.length === 0);
  const invalidRows = parsedRows.filter(r => r.errors.length > 0);
  const totalAmount = validRows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  const minDate = validRows.reduce((min, r) => {
    if (!r.txnDate) return min;
    return !min || r.txnDate < min ? r.txnDate : min;
  }, '');
  const maxDate = validRows.reduce((max, r) => {
    if (!r.txnDate) return max;
    return !max || r.txnDate > max ? r.txnDate : max;
  }, '');

  // Validate mapping completeness
  const isMappingComplete = Boolean(mapping.txnDate && mapping.merchantName && mapping.amount);
  
  // Can proceed to preview?
  const canPreview = isMappingComplete && csvRows.length > 0;
  
  // Can continue from preview to confirm?
  // If there are invalid rows and skipInvalidRows is false, block
  const canContinueToConfirm = validRows.length > 0 && (invalidRows.length === 0 || skipInvalidRows);
  
  // Can confirm import?
  const canConfirm = validRows.length > 0 && selectedFYId && (invalidRows.length === 0 || skipInvalidRows);

  // Generate a deterministic content hash for dedup
  const contentHash = (fyId: string, txnDate: string, merchant: string, amount: number): string => {
    return btoa(JSON.stringify([fyId, txnDate, merchant, amount])).slice(0, 32);
  };

  // Handle import confirmation
  const handleConfirmImport = useCallback(async () => {
    // Guard: FY must be selected
    if (!selectedFYId) {
      toast({
        title: 'Select a fiscal year first',
        variant: 'destructive',
      });
      return;
    }

    // Guard: must have valid rows
    if (validRows.length === 0) {
      toast({
        title: 'No valid rows to import',
        variant: 'destructive',
      });
      return;
    }

    // Guard: invalid rows exist and skip is off
    if (invalidRows.length > 0 && !skipInvalidRows) {
      toast({
        title: 'Fix mapping or enable "Skip invalid rows"',
        description: `${invalidRows.length} rows have errors.`,
        variant: 'destructive',
      });
      return;
    }

    const now = new Date().toISOString();
    const transactions: ActualsTransaction[] = validRows.map((row) => ({
      id: contentHash(selectedFYId, row.txnDate!, row.merchantName!, row.amount!),
      source,
      fiscalYearId: selectedFYId,
      txnDate: row.txnDate!,
      postedDate: row.postedDate,
      merchantName: row.merchantName!,
      description: row.description,
      amount: row.amount!,
      currency: 'USD',
      category: row.category,
      externalId: row.externalId,
      raw: row.raw,
      createdAt: now,
    }));

    if (replaceExisting) {
      await replaceActuals(selectedFYId, transactions);
      toast({
        title: `Imported ${transactions.length} transactions`,
        description: `Total: ${formatUSD(totalAmount)}`,
      });
    } else {
      // Dedup: filter out transactions whose id already exists
      const existing = loadActuals(selectedFYId);
      const existingIds = new Set(existing.map(t => t.id));
      const newTransactions = transactions.filter(t => !existingIds.has(t.id));
      const skippedCount = transactions.length - newTransactions.length;

      if (newTransactions.length > 0) {
        await appendActuals(selectedFYId, newTransactions);
      }

      const newTotal = newTransactions.reduce((sum, t) => sum + t.amount, 0);
      toast({
        title: `Imported ${newTransactions.length} transactions`,
        description: skippedCount > 0
          ? `${skippedCount} duplicate transaction(s) skipped. Total: ${formatUSD(newTotal)}`
          : `Total: ${formatUSD(newTotal)}`,
      });
    }

    // Navigate back to admin
    navigate('/admin');
  }, [selectedFYId, validRows, invalidRows, skipInvalidRows, source, replaceExisting, totalAmount, navigate, toast]);

  // Render based on step
  const renderStep = () => {
    if (!canImport) {
      return (
        <Card>
          <CardContent className="p-6">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Only Admin and Finance roles can import actuals.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      );
    }

    switch (step) {
      case 'upload':
        return (
          <div className="space-y-6">
            {/* FY Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Fiscal Year</CardTitle>
                <CardDescription>
                  Choose the fiscal year to import transactions into.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Select value={selectedFYId} onValueChange={setSelectedFYId}>
                  <SelectTrigger className="w-[280px]">
                    <SelectValue placeholder="Select fiscal year..." />
                  </SelectTrigger>
                <SelectContent>
                    {visibleFiscalYears.map(fy => (
                      <SelectItem key={fy.id} value={fy.id}>
                        {fy.name} ({fy.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {existingSummary && (
                  <Alert className="mt-4">
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      This fiscal year already has {existingSummary.count.toLocaleString()} transactions 
                      totaling {formatUSD(existingSummary.total)}.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            {/* File Upload */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Upload CSV File</CardTitle>
                <CardDescription>
                  Upload a CSV file from your bank or Ramp.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <Input
                      type="file"
                      accept=".csv"
                      onChange={handleFileChange}
                      className="max-w-sm"
                      disabled={!selectedFYId}
                    />
                    {file && (
                      <Badge variant="secondary">
                        <FileSpreadsheet className="h-3 w-3 mr-1" />
                        {file.name}
                      </Badge>
                    )}
                  </div>
                  
                  {!selectedFYId && (
                    <p className="text-sm text-muted-foreground">
                      Please select a fiscal year first.
                    </p>
                  )}
                  
                  {file && csvRows.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Found {csvRows.length} rows with {csvHeaders.length} columns.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button
                onClick={() => setStep('mapping')}
                disabled={!file || csvRows.length === 0}
              >
                Continue to Mapping
              </Button>
            </div>
          </div>
        );

      case 'mapping':
        return (
          <div className="space-y-6">
            {/* Source Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Import Source</CardTitle>
              </CardHeader>
              <CardContent>
                <RadioGroup
                  value={source}
                  onValueChange={(v) => setSource(v as ActualsSource)}
                  className="flex gap-6"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="bank" id="source-bank" />
                    <Label htmlFor="source-bank">Bank</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="ramp" id="source-ramp" />
                    <Label htmlFor="source-ramp">Ramp</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="unknown" id="source-unknown" />
                    <Label htmlFor="source-unknown">Other</Label>
                  </div>
                </RadioGroup>
              </CardContent>
            </Card>

            {/* Column Mapping */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Column Mapping</CardTitle>
                <CardDescription>
                  Map CSV columns to transaction fields. Required fields are marked with *.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Required Fields */}
                  <div className="space-y-2">
                    <Label>Transaction Date *</Label>
                    <Select
                      value={mapping.txnDate}
                      onValueChange={(v) => setMapping(m => ({ ...m, txnDate: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Merchant Name *</Label>
                    <Select
                      value={mapping.merchantName}
                      onValueChange={(v) => setMapping(m => ({ ...m, merchantName: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Amount *</Label>
                    <Select
                      value={mapping.amount}
                      onValueChange={(v) => setMapping(m => ({ ...m, amount: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column..." />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Optional Fields */}
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Select
                      value={mapping.description || ''}
                      onValueChange={(v) => setMapping(m => ({ ...m, description: v || undefined }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select
                      value={mapping.category || ''}
                      onValueChange={(v) => setMapping(m => ({ ...m, category: v || undefined }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>External ID</Label>
                    <Select
                      value={mapping.externalId || ''}
                      onValueChange={(v) => setMapping(m => ({ ...m, externalId: v || undefined }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Posted Date</Label>
                    <Select
                      value={mapping.postedDate || ''}
                      onValueChange={(v) => setMapping(m => ({ ...m, postedDate: v || undefined }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="(optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None</SelectItem>
                        {csvHeaders.map(h => (
                          <SelectItem key={h} value={h}>{h}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Amount Sign Info */}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Amounts are automatically normalized to positive spend values regardless of the sign in your CSV.
              </AlertDescription>
            </Alert>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('upload')}>
                Back
              </Button>
              <Button onClick={() => setStep('preview')} disabled={!canPreview}>
                Preview Import
              </Button>
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Valid Rows</div>
                  <div className="text-2xl font-semibold text-green-600">{validRows.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Invalid Rows</div>
                  <div className="text-2xl font-semibold text-destructive">{invalidRows.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Total Spend</div>
                  <div className="text-2xl font-semibold">{formatUSD(totalAmount)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground">Date Range</div>
                  <div className="text-sm font-medium">
                    {minDate ? formatDate(minDate, adminSettings.timeZone) : '—'} → {maxDate ? formatDate(maxDate, adminSettings.timeZone) : '—'}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Preview Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Preview (First 20 Rows)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.slice(0, 20).map((row) => (
                        <TableRow key={row.rowIndex} className={row.errors.length > 0 ? 'bg-destructive/5' : ''}>
                          <TableCell className="text-muted-foreground">{row.rowIndex}</TableCell>
                          <TableCell>
                            {row.txnDate ? formatDate(row.txnDate, adminSettings.timeZone) : '—'}
                          </TableCell>
                          <TableCell>{row.merchantName || '—'}</TableCell>
                          <TableCell className="text-right font-mono">
                            {row.amount !== undefined ? formatUSD(row.amount) : '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {row.description || '—'}
                          </TableCell>
                          <TableCell>
                            {row.errors.length === 0 ? (
                              <Badge variant="secondary" className="bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Valid
                              </Badge>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive">
                                    <AlertCircle className="h-3 w-3 mr-1" />
                                    {row.errors.length} error(s)
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <ul className="text-xs">
                                    {row.errors.map((e, i) => (
                                      <li key={i}>{e}</li>
                                    ))}
                                  </ul>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* Blocking message when invalid rows and skip is off */}
            {invalidRows.length > 0 && !skipInvalidRows && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Fix mapping or enable "Skip invalid rows" to continue. {invalidRows.length} row(s) have errors.
                </AlertDescription>
              </Alert>
            )}

            {/* Skip invalid rows toggle (shown in preview for convenience) */}
            {invalidRows.length > 0 && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-invalid-preview"
                  checked={skipInvalidRows}
                  onCheckedChange={(checked) => setSkipInvalidRows(checked === true)}
                />
                <Label htmlFor="skip-invalid-preview" className="text-sm">
                  Skip invalid rows ({invalidRows.length} will be skipped)
                </Label>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('mapping')}>
                Back to Mapping
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={!canContinueToConfirm}>
                Continue to Confirm
              </Button>
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Confirm Import</CardTitle>
                <CardDescription>
                  Review and confirm your import settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Fiscal Year:</span>
                    <span className="ml-2 font-medium">{selectedFY?.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <span className="ml-2 font-medium capitalize">{source}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Transactions:</span>
                    <span className="ml-2 font-medium">{validRows.length}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Spend:</span>
                    <span className="ml-2 font-medium">{formatUSD(totalAmount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Date Range:</span>
                    <span className="ml-2 font-medium">
                      {minDate ? formatDate(minDate, adminSettings.timeZone) : '—'} → {maxDate ? formatDate(maxDate, adminSettings.timeZone) : '—'}
                    </span>
                  </div>
                  {invalidRows.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Skipped Rows:</span>
                      <span className="ml-2 font-medium text-amber-600">{invalidRows.length}</span>
                    </div>
                  )}
                </div>

                {existingSummary && (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      This FY has {existingSummary.count} existing transactions.
                      {replaceExisting 
                        ? ' They will be replaced.' 
                        : ' New transactions will be appended.'}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex items-center space-x-2 pt-2">
                  <Checkbox
                    id="replace-existing"
                    checked={replaceExisting}
                    onCheckedChange={(checked) => setReplaceExisting(checked === true)}
                  />
                  <Label htmlFor="replace-existing" className="text-sm">
                    Replace all existing transactions for this fiscal year
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="skip-invalid"
                    checked={skipInvalidRows}
                    onCheckedChange={(checked) => setSkipInvalidRows(checked === true)}
                  />
                  <Label htmlFor="skip-invalid" className="text-sm">
                    Skip invalid rows (import only valid transactions)
                  </Label>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep('preview')}>
                Back to Preview
              </Button>
              <Button onClick={handleConfirmImport} disabled={!canConfirm}>
                <Upload className="h-4 w-4 mr-2" />
                Confirm Import
              </Button>
            </div>
          </div>
        );
    }
  };

  return (
    <div>
      <PageHeader
        title="Actuals Import"
        description="Import transaction data from bank or Ramp CSV files."
      >
        <Button variant="outline" onClick={() => navigate('/admin')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Admin
        </Button>
      </PageHeader>

      {/* Step Indicator */}
      {canImport && (
        <div className="flex items-center gap-2 mb-6">
          {(['upload', 'mapping', 'preview', 'confirm'] as Step[]).map((s, idx) => (
            <div key={s} className="flex items-center">
              <div
                className={`
                  w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                  ${step === s 
                    ? 'bg-primary text-primary-foreground' 
                    : idx < ['upload', 'mapping', 'preview', 'confirm'].indexOf(step)
                      ? 'bg-green-100 text-green-700'
                      : 'bg-muted text-muted-foreground'}
                `}
              >
                {idx + 1}
              </div>
              {idx < 3 && (
                <div className={`w-8 h-0.5 ${idx < ['upload', 'mapping', 'preview', 'confirm'].indexOf(step) ? 'bg-green-400' : 'bg-muted'}`} />
              )}
            </div>
          ))}
          <span className="ml-2 text-sm text-muted-foreground capitalize">{step}</span>
        </div>
      )}

      {renderStep()}
    </div>
  );
}
