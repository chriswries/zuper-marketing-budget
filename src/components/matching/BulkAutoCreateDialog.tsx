import { useState, useMemo } from "react";
import { Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  normalizeMerchantKey,
  addTransactionMatch,
  addMerchantRule,
  type TransactionMatch,
  type MerchantRule,
} from "@/lib/actualsMatchingStore";
import { MONTHS } from "@/types/budget";
import type { ActualsTransaction } from "@/types/actuals";
import type { CostCenter } from "@/types/budget";
import type { UserRole } from "@/contexts/AuthContext";
import { formatCurrencyWithCents as formatUSD } from "@/lib/format";

interface MerchantGroup {
  merchantKey: string;
  displayName: string;
  transactions: ActualsTransaction[];
  totalAmount: number;
  costCenterId: string;
  skip: boolean;
}

interface BulkAutoCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unmatchedTransactions: ActualsTransaction[];
  costCenters: CostCenter[];
  existingRuleKeys: Set<string>;
  fiscalYearId: string;
  currentRole: string;
  onComplete: () => void;
}

export function BulkAutoCreateDialog({
  open,
  onOpenChange,
  unmatchedTransactions,
  costCenters,
  existingRuleKeys,
  fiscalYearId,
  currentRole,
  onComplete,
}: BulkAutoCreateDialogProps) {
  const { toast } = useToast();
  const [isCreating, setIsCreating] = useState(false);

  // Group unmatched transactions by merchant, excluding those with existing rules
  const initialGroups = useMemo((): MerchantGroup[] => {
    const byKey: Record<string, { displayName: string; txns: ActualsTransaction[] }> = {};

    for (const txn of unmatchedTransactions) {
      const key = normalizeMerchantKey(txn.merchantName);
      if (existingRuleKeys.has(key)) continue;
      if (!byKey[key]) {
        byKey[key] = { displayName: txn.merchantName, txns: [] };
      }
      byKey[key].txns.push(txn);
    }

    return Object.entries(byKey)
      .map(([merchantKey, { displayName, txns }]) => ({
        merchantKey,
        displayName,
        transactions: txns,
        totalAmount: txns.reduce((s, t) => s + t.amount, 0),
        costCenterId: costCenters.length === 1 ? costCenters[0].id : "",
        skip: false,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [unmatchedTransactions, existingRuleKeys, costCenters]);

  const [groups, setGroups] = useState<MerchantGroup[]>(initialGroups);
  // Reset groups when dialog opens with new data
  const [prevKey, setPrevKey] = useState("");
  const currentKey = `${unmatchedTransactions.length}-${existingRuleKeys.size}`;
  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setGroups(initialGroups);
  }

  const activeGroups = groups.filter((g) => !g.skip && g.costCenterId);
  const allHaveCostCenter = groups.every((g) => g.skip || g.costCenterId);

  const updateGroup = (idx: number, patch: Partial<MerchantGroup>) => {
    setGroups((prev) => prev.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  };

  const handleSelectAll = (costCenterId: string) => {
    setGroups((prev) => prev.map((g) => (g.skip ? g : { ...g, costCenterId })));
  };

  const handleCreateAll = async () => {
    if (activeGroups.length === 0) return;
    setIsCreating(true);

    try {
      let totalLineItems = 0;
      let totalMatched = 0;

      for (const group of activeGroups) {
        const lineItemId = crypto.randomUUID();

        // 1. Insert line item
        const { error: liErr } = await supabase.from("line_items").insert({
          id: lineItemId,
          cost_center_id: group.costCenterId,
          fiscal_year_id: fiscalYearId,
          name: group.displayName,
          vendor_name: group.displayName,
          is_contracted: false,
          is_accrual: false,
          is_software_subscription: false,
        });
        if (liErr) throw new Error(`Failed to create "${group.displayName}": ${liErr.message}`);

        // 2. Insert 24 monthly_values rows
        const monthlyRows = MONTHS.flatMap((month) => [
          { line_item_id: lineItemId, fiscal_year_id: fiscalYearId, month, value_type: "budget", amount: 0 },
          { line_item_id: lineItemId, fiscal_year_id: fiscalYearId, month, value_type: "forecast", amount: 0 },
        ]);
        const { error: mvErr } = await supabase.from("monthly_values").insert(monthlyRows);
        if (mvErr) throw new Error(`Failed to create monthly values for "${group.displayName}": ${mvErr.message}`);

        // 3. Match all transactions
        for (const txn of group.transactions) {
          const match: TransactionMatch = {
            txnId: txn.id,
            costCenterId: group.costCenterId,
            lineItemId,
            matchSource: "manual",
            matchedAt: new Date().toISOString(),
            matchedByRole: currentRole,
            merchantKey: group.merchantKey,
          };
          await addTransactionMatch(fiscalYearId, match);
          totalMatched++;
        }

        // 4. Create merchant rule
        const rule: MerchantRule = {
          merchantKey: group.merchantKey,
          costCenterId: group.costCenterId,
          lineItemId,
          createdAt: new Date().toISOString(),
          createdByRole: currentRole,
        };
        await addMerchantRule(fiscalYearId, rule);

        totalLineItems++;
      }

      toast({
        title: "Bulk creation complete",
        description: `Created ${totalLineItems} line items and matched ${totalMatched} transactions.`,
      });

      onOpenChange(false);
      onComplete();
    } catch (err) {
      console.error("Bulk create failed:", err);
      toast({
        title: "Bulk creation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Auto-Create Line Items for Unmatched Transactions</DialogTitle>
          <DialogDescription>
            {groups.length} unique merchant(s) found. Assign each to a cost center, then create line items and match all transactions at once.
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No unmatched merchants without existing rules.
          </p>
        ) : (
          <>
            {/* Bulk cost center selector */}
            {costCenters.length > 1 && (
              <div className="flex items-center gap-3 pb-2">
                <Label className="text-sm whitespace-nowrap">Assign all to:</Label>
                <Select onValueChange={handleSelectAll}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select cost center…" />
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
            )}

            <ScrollArea className="max-h-[400px]">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Skip</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead className="text-right">Txns</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Cost Center</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groups.map((group, idx) => (
                      <TableRow key={group.merchantKey} className={group.skip ? "opacity-50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={group.skip}
                            onCheckedChange={(checked) => updateGroup(idx, { skip: !!checked })}
                          />
                        </TableCell>
                        <TableCell className="font-medium max-w-[200px] truncate">
                          {group.displayName}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {group.transactions.length}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatUSD(group.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={group.costCenterId}
                            onValueChange={(v) => updateGroup(idx, { costCenterId: v })}
                            disabled={group.skip}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue placeholder="Select…" />
                            </SelectTrigger>
                            <SelectContent>
                              {costCenters.map((cc) => (
                                <SelectItem key={cc.id} value={cc.id}>
                                  {cc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateAll}
            disabled={isCreating || activeGroups.length === 0 || !allHaveCostCenter}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Create All ({activeGroups.length})
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
