/**
 * Actuals Matching Page
 * 
 * This page allows Admin/Finance roles to match imported transactions
 * to Cost Centers and Line Items. It supports:
 * - Manual matching of individual transactions
 * - Merchant-based rules to bulk-match transactions
 * - Auto-suggestions based on vendor name matching
 * 
 * Matching/rollups to line items is implemented here.
 * Transaction import is handled in ActualsImport.tsx (Track B Prompt B1).
 */

import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { formatDate } from '@/lib/dateTime';
import { loadActuals } from '@/lib/actualsStore';
import {
  loadActualsMatching,
  saveActualsMatching,
  normalizeMerchantKey,
  applyMerchantRules,
  addTransactionMatch,
  removeTransactionMatch,
  addMerchantRule,
  removeMerchantRule,
  type TransactionMatch,
  type MerchantRule,
} from '@/lib/actualsMatchingStore';
import { recomputeAndSaveActualsRollup } from '@/lib/actualsRollupStore';
import type { ActualsTransaction } from '@/types/actuals';
import { Link, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

type FilterTab = 'all' | 'unmatched' | 'matched';

export default function ActualsMatching() {
  const { toast } = useToast();
  const { fiscalYears, selectedFiscalYearId, setSelectedFiscalYearId, selectedFiscalYear } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();
  const { currentRole } = useCurrentUserRole();

  const canEdit = currentRole === 'admin' || currentRole === 'finance';

  // Data state
  const [transactions, setTransactions] = useState<ActualsTransaction[]>([]);
  const [matchesByTxnId, setMatchesByTxnId] = useState<Record<string, TransactionMatch>>({});
  const [rulesByMerchantKey, setRulesByMerchantKey] = useState<Record<string, MerchantRule>>({});
  const [filterTab, setFilterTab] = useState<FilterTab>('all');

  // Match dialog state
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedTxn, setSelectedTxn] = useState<ActualsTransaction | null>(null);
  const [selectedCostCenterId, setSelectedCostCenterId] = useState<string>('');
  const [selectedLineItemId, setSelectedLineItemId] = useState<string>('');
  const [createMerchantRule, setCreateMerchantRule] = useState(false);

  // Unmatch dialog state
  const [unmatchDialogOpen, setUnmatchDialogOpen] = useState(false);
  const [txnToUnmatch, setTxnToUnmatch] = useState<ActualsTransaction | null>(null);
  const [keepMerchantRule, setKeepMerchantRule] = useState(true);

  // Load data when FY changes
  useEffect(() => {
    if (!selectedFiscalYearId) {
      setTransactions([]);
      setMatchesByTxnId({});
      setRulesByMerchantKey({});
      return;
    }

    // Load transactions
    const txns = loadActuals(selectedFiscalYearId);
    setTransactions(txns);

    // Apply merchant rules and reload matching data
    if (txns.length > 0 && canEdit) {
      const appliedCount = applyMerchantRules(selectedFiscalYearId, txns, currentRole);
      if (appliedCount > 0) {
        toast({
          title: 'Merchant rules applied',
          description: `${appliedCount} transaction(s) auto-matched from existing rules.`,
        });
      }
    }

    // Load matching data
    const matchingData = loadActualsMatching(selectedFiscalYearId);
    setMatchesByTxnId(matchingData.matchesByTxnId);
    setRulesByMerchantKey(matchingData.rulesByMerchantKey);
  }, [selectedFiscalYearId, canEdit, currentRole]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    switch (filterTab) {
      case 'matched':
        return transactions.filter((t) => matchesByTxnId[t.id]);
      case 'unmatched':
        return transactions.filter((t) => !matchesByTxnId[t.id]);
      default:
        return transactions;
    }
  }, [transactions, matchesByTxnId, filterTab]);

  // Summary stats
  const stats = useMemo(() => {
    let matchedCount = 0;
    let matchedTotal = 0;
    let unmatchedCount = 0;
    let unmatchedTotal = 0;

    for (const txn of transactions) {
      if (matchesByTxnId[txn.id]) {
        matchedCount++;
        matchedTotal += txn.amount;
      } else {
        unmatchedCount++;
        unmatchedTotal += txn.amount;
      }
    }

    const totalSpend = matchedTotal + unmatchedTotal;
    const matchedPercent = totalSpend > 0 ? (matchedTotal / totalSpend) * 100 : 0;

    return {
      totalSpend,
      matchedCount,
      matchedTotal,
      matchedPercent,
      unmatchedCount,
      unmatchedTotal,
    };
  }, [transactions, matchesByTxnId]);

  // Cost centers and line items from selected FY
  const costCenters = selectedFiscalYear?.costCenters ?? [];

  // Line items filtered by selected cost center
  const availableLineItems = useMemo(() => {
    if (!selectedCostCenterId) return [];
    const cc = costCenters.find((c) => c.id === selectedCostCenterId);
    return cc?.lineItems ?? [];
  }, [costCenters, selectedCostCenterId]);

  // Auto-suggestion: find matching line item based on merchant name
  const suggestedMatch = useMemo(() => {
    if (!selectedTxn || costCenters.length === 0) return null;

    const merchantKey = normalizeMerchantKey(selectedTxn.merchantName);

    for (const cc of costCenters) {
      for (const li of cc.lineItems) {
        // Check vendor name
        if (li.vendor?.name) {
          const vendorKey = normalizeMerchantKey(li.vendor.name);
          if (merchantKey.includes(vendorKey) || vendorKey.includes(merchantKey)) {
            return { costCenterId: cc.id, lineItemId: li.id };
          }
        }
        // Check line item name
        const liKey = normalizeMerchantKey(li.name);
        if (merchantKey.includes(liKey) || liKey.includes(merchantKey)) {
          return { costCenterId: cc.id, lineItemId: li.id };
        }
      }
    }
    return null;
  }, [selectedTxn, costCenters]);

  // Open match dialog
  const handleOpenMatchDialog = (txn: ActualsTransaction) => {
    setSelectedTxn(txn);
    
    // Pre-fill with suggestion if available
    if (suggestedMatch) {
      setSelectedCostCenterId(suggestedMatch.costCenterId);
      setSelectedLineItemId(suggestedMatch.lineItemId);
    } else {
      setSelectedCostCenterId('');
      setSelectedLineItemId('');
    }
    
    setCreateMerchantRule(false);
    setMatchDialogOpen(true);
  };

  // Effect to update suggestion when dialog opens
  useEffect(() => {
    if (matchDialogOpen && suggestedMatch && !selectedCostCenterId) {
      setSelectedCostCenterId(suggestedMatch.costCenterId);
      setSelectedLineItemId(suggestedMatch.lineItemId);
    }
  }, [matchDialogOpen, suggestedMatch]);

  // Handle match confirm
  const handleConfirmMatch = () => {
    if (!selectedTxn || !selectedFiscalYearId || !selectedFiscalYear) return;
    if (!selectedCostCenterId || !selectedLineItemId) return;

    const merchantKey = normalizeMerchantKey(selectedTxn.merchantName);
    
    // Determine match source
    let matchSource: TransactionMatch['matchSource'] = 'manual';
    if (suggestedMatch && 
        suggestedMatch.costCenterId === selectedCostCenterId && 
        suggestedMatch.lineItemId === selectedLineItemId) {
      matchSource = 'auto_suggestion';
    }

    const match: TransactionMatch = {
      txnId: selectedTxn.id,
      costCenterId: selectedCostCenterId,
      lineItemId: selectedLineItemId,
      matchSource,
      matchedAt: new Date().toISOString(),
      matchedByRole: currentRole,
      merchantKey,
    };

    addTransactionMatch(selectedFiscalYearId, match);

    // Create merchant rule if requested
    if (createMerchantRule) {
      const rule: MerchantRule = {
        merchantKey,
        costCenterId: selectedCostCenterId,
        lineItemId: selectedLineItemId,
        createdAt: new Date().toISOString(),
        createdByRole: currentRole,
      };
      addMerchantRule(selectedFiscalYearId, rule);

      // Apply rule to other unmatched transactions from same merchant
      const appliedCount = applyMerchantRules(
        selectedFiscalYearId,
        transactions.filter((t) => t.id !== selectedTxn.id),
        currentRole
      );

      if (appliedCount > 0) {
        toast({
          title: 'Merchant rule created',
          description: `Rule applied to ${appliedCount} additional transaction(s).`,
        });
      }
    }

    // Recompute rollup
    recomputeAndSaveActualsRollup(selectedFiscalYearId, selectedFiscalYear);

    // Reload state
    const matchingData = loadActualsMatching(selectedFiscalYearId);
    setMatchesByTxnId(matchingData.matchesByTxnId);
    setRulesByMerchantKey(matchingData.rulesByMerchantKey);

    setMatchDialogOpen(false);
    setSelectedTxn(null);

    toast({
      title: 'Transaction matched',
      description: `Matched "${selectedTxn.merchantName}" to line item.`,
    });
  };

  // Open unmatch dialog
  const handleOpenUnmatchDialog = (txn: ActualsTransaction) => {
    setTxnToUnmatch(txn);
    setKeepMerchantRule(true);
    setUnmatchDialogOpen(true);
  };

  // Handle unmatch confirm
  const handleConfirmUnmatch = () => {
    if (!txnToUnmatch || !selectedFiscalYearId || !selectedFiscalYear) return;

    const match = matchesByTxnId[txnToUnmatch.id];
    if (!match) return;

    removeTransactionMatch(selectedFiscalYearId, txnToUnmatch.id);

    // Remove merchant rule if requested
    if (match.merchantKey && !keepMerchantRule) {
      removeMerchantRule(selectedFiscalYearId, match.merchantKey);
    }

    // Recompute rollup
    recomputeAndSaveActualsRollup(selectedFiscalYearId, selectedFiscalYear);

    // Reload state
    const matchingData = loadActualsMatching(selectedFiscalYearId);
    setMatchesByTxnId(matchingData.matchesByTxnId);
    setRulesByMerchantKey(matchingData.rulesByMerchantKey);

    setUnmatchDialogOpen(false);
    setTxnToUnmatch(null);

    toast({
      title: 'Transaction unmatched',
      description: keepMerchantRule 
        ? 'Match removed (merchant rule kept).'
        : 'Match and merchant rule removed.',
    });
  };

  // Get cost center and line item names for display
  const getMatchDisplay = (txnId: string) => {
    const match = matchesByTxnId[txnId];
    if (!match) return { ccName: '', liName: '', source: '' };

    const cc = costCenters.find((c) => c.id === match.costCenterId);
    const li = cc?.lineItems.find((l) => l.id === match.lineItemId);

    return {
      ccName: cc?.name ?? 'Unknown',
      liName: li?.name ?? 'Unknown',
      source: match.matchSource,
    };
  };

  const matchSourceBadge = (source: string) => {
    switch (source) {
      case 'manual':
        return <Badge variant="outline">Manual</Badge>;
      case 'merchant_rule':
        return <Badge variant="secondary">Merchant Rule</Badge>;
      case 'auto_suggestion':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Auto</Badge>;
      default:
        return null;
    }
  };

  return (
    <div>
      <PageHeader
        title="Actuals Matching"
        description="Match imported transactions to cost centers and line items."
      />

      {!canEdit && (
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            You are viewing in read-only mode. Only Admin and Finance roles can match transactions.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {/* Fiscal Year Selector */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Label htmlFor="fy-select">Fiscal Year</Label>
              <Select
                value={selectedFiscalYearId ?? ''}
                onValueChange={setSelectedFiscalYearId}
              >
                <SelectTrigger id="fy-select" className="w-[200px]">
                  <SelectValue placeholder="Select fiscal year" />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.map((fy) => (
                    <SelectItem key={fy.id} value={fy.id}>
                      {fy.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!selectedFiscalYearId && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Select a fiscal year to view and match transactions.
            </AlertDescription>
          </Alert>
        )}

        {selectedFiscalYearId && transactions.length === 0 && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              No transactions imported for this fiscal year. Go to{' '}
              <a href="/admin/actuals" className="underline">
                Actuals Import
              </a>{' '}
              to import transactions first.
            </AlertDescription>
          </Alert>
        )}

        {selectedFiscalYearId && transactions.length > 0 && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Total Spend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    ${stats.totalSpend.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {transactions.length} transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Matched Spend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    ${stats.matchedTotal.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.matchedCount} transactions ({stats.matchedPercent.toFixed(1)}%)
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Unmatched Spend
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-orange-600">
                    ${stats.unmatchedTotal.toLocaleString()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {stats.unmatchedCount} transactions
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Merchant Rules
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {Object.keys(rulesByMerchantKey).length}
                  </div>
                  <p className="text-xs text-muted-foreground">active rules</p>
                </CardContent>
              </Card>
            </div>

            {/* Transactions Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Transactions</CardTitle>
                  <Tabs value={filterTab} onValueChange={(v) => setFilterTab(v as FilterTab)}>
                    <TabsList>
                      <TabsTrigger value="all">All ({transactions.length})</TabsTrigger>
                      <TabsTrigger value="unmatched">
                        Unmatched ({stats.unmatchedCount})
                      </TabsTrigger>
                      <TabsTrigger value="matched">
                        Matched ({stats.matchedCount})
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Merchant</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Cost Center</TableHead>
                        <TableHead>Line Item</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            No transactions to display.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredTransactions.map((txn) => {
                          const isMatched = !!matchesByTxnId[txn.id];
                          const matchDisplay = getMatchDisplay(txn.id);

                          return (
                            <TableRow key={txn.id}>
                              <TableCell className="whitespace-nowrap">
                                {formatDate(txn.txnDate, adminSettings.timeZone)}
                              </TableCell>
                              <TableCell className="font-medium max-w-[200px] truncate">
                                {txn.merchantName}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                ${txn.amount.toLocaleString()}
                              </TableCell>
                              <TableCell className="max-w-[150px] truncate text-muted-foreground">
                                {txn.description || '—'}
                              </TableCell>
                              <TableCell>
                                {isMatched ? (
                                  <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Matched
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Unmatched
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{matchDisplay.ccName || '—'}</TableCell>
                              <TableCell>{matchDisplay.liName || '—'}</TableCell>
                              <TableCell>
                                {matchDisplay.source ? matchSourceBadge(matchDisplay.source) : '—'}
                              </TableCell>
                              <TableCell className="text-right">
                                {isMatched ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenUnmatchDialog(txn)}
                                    disabled={!canEdit}
                                  >
                                    Unmatch
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleOpenMatchDialog(txn)}
                                    disabled={!canEdit}
                                  >
                                    <Link className="h-3 w-3 mr-1" />
                                    Match
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Match Dialog */}
      <Dialog open={matchDialogOpen} onOpenChange={setMatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Match Transaction</DialogTitle>
            <DialogDescription>
              Match "{selectedTxn?.merchantName}" (${selectedTxn?.amount.toLocaleString()}) to a line item.
            </DialogDescription>
          </DialogHeader>

          {suggestedMatch && (
            <Alert className="bg-blue-50 border-blue-200">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800">
                Auto-suggestion based on merchant name match.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Cost Center</Label>
              <Select value={selectedCostCenterId} onValueChange={(v) => {
                setSelectedCostCenterId(v);
                setSelectedLineItemId('');
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select cost center" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>
                      {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Line Item</Label>
              <Select 
                value={selectedLineItemId} 
                onValueChange={setSelectedLineItemId}
                disabled={!selectedCostCenterId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={selectedCostCenterId ? "Select line item" : "Select cost center first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableLineItems.map((li) => (
                    <SelectItem key={li.id} value={li.id}>
                      {li.name} {li.vendor?.name ? `(${li.vendor.name})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="create-rule"
                checked={createMerchantRule}
                onCheckedChange={(checked) => setCreateMerchantRule(!!checked)}
              />
              <Label htmlFor="create-rule" className="text-sm">
                Apply to all transactions from this merchant (create rule)
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmMatch}
              disabled={!selectedCostCenterId || !selectedLineItemId}
            >
              Confirm Match
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unmatch Dialog */}
      <Dialog open={unmatchDialogOpen} onOpenChange={setUnmatchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unmatch Transaction</DialogTitle>
            <DialogDescription>
              Remove the match for "{txnToUnmatch?.merchantName}".
            </DialogDescription>
          </DialogHeader>

          {txnToUnmatch && matchesByTxnId[txnToUnmatch.id]?.matchSource === 'merchant_rule' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This transaction was matched via a merchant rule.
              </p>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="keep-rule"
                  checked={keepMerchantRule}
                  onCheckedChange={(checked) => setKeepMerchantRule(!!checked)}
                />
                <Label htmlFor="keep-rule" className="text-sm">
                  Keep merchant rule (will re-match future transactions)
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setUnmatchDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmUnmatch}>
              Unmatch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
