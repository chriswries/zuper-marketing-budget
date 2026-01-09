import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ArrowLeft, Wand2, Search, CheckCircle2 } from "lucide-react";
import type { 
  ImportedTransactionWithVendor,
  ImportedTransactionMapped,
  VendorToLineItemMap,
  LineItemOption
} from "@/types/import";
import { formatUSD } from "@/lib/import";

interface LineItemMappingStepProps {
  transactions: ImportedTransactionWithVendor[];
  lineItemOptions: LineItemOption[];
  allowedCostCenterIds?: string[]; // If set, filter options to only these cost centers
  initialMappings?: VendorToLineItemMap;
  onBack: () => void;
  onContinue: (result: {
    lineItemMappings: VendorToLineItemMap;
    transactions: ImportedTransactionMapped[];
  }) => void;
}

interface VendorGroup {
  canonicalVendorId: string;
  canonicalVendorName: string;
  count: number;
  totalAmount: number;
}

export function LineItemMappingStep({
  transactions,
  lineItemOptions,
  allowedCostCenterIds = [],
  initialMappings = {},
  onBack,
  onContinue,
}: LineItemMappingStepProps) {
  const [lineItemMappings, setLineItemMappings] = useState<VendorToLineItemMap>(initialMappings);
  const [searchQuery, setSearchQuery] = useState("");

  // Group transactions by canonical vendor
  const vendorGroups = useMemo(() => {
    const groups = new Map<string, VendorGroup>();
    
    for (const tx of transactions) {
      const existing = groups.get(tx.canonicalVendorId);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += tx.amount;
      } else {
        groups.set(tx.canonicalVendorId, {
          canonicalVendorId: tx.canonicalVendorId,
          canonicalVendorName: tx.canonicalVendorName,
          count: 1,
          totalAmount: tx.amount,
        });
      }
    }
    
    return Array.from(groups.values()).sort((a, b) => 
      b.totalAmount - a.totalAmount
    );
  }, [transactions]);

  // Filter vendor groups by search
  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return vendorGroups;
    const query = searchQuery.toLowerCase();
    return vendorGroups.filter(g => 
      g.canonicalVendorName.toLowerCase().includes(query)
    );
  }, [vendorGroups, searchQuery]);

  // Count mapped vendors
  const mappedCount = vendorGroups.filter(g => lineItemMappings[g.canonicalVendorId]).length;
  const totalCount = vendorGroups.length;
  const allMapped = mappedCount === totalCount;

  // Filter and sort line item options
  // If allowedCostCenterIds is non-empty, filter to only those cost centers
  // Otherwise, show all options
  const sortedLineItemOptions = useMemo(() => {
    let filtered = lineItemOptions;
    if (allowedCostCenterIds.length > 0) {
      const allowedSet = new Set(allowedCostCenterIds);
      filtered = lineItemOptions.filter(opt => allowedSet.has(opt.costCenterId));
    }
    return [...filtered].sort((a, b) => {
      const ccCompare = a.costCenterName.localeCompare(b.costCenterName, undefined, { sensitivity: 'base' });
      if (ccCompare !== 0) return ccCompare;
      return a.lineItemName.localeCompare(b.lineItemName, undefined, { sensitivity: 'base' });
    });
  }, [lineItemOptions, allowedCostCenterIds]);

  // Auto-map by vendor name matching
  const handleAutoMap = () => {
    const newMappings = { ...lineItemMappings };
    
    for (const group of vendorGroups) {
      if (newMappings[group.canonicalVendorId]) continue; // Already mapped
      
      const vendorNameLower = group.canonicalVendorName.toLowerCase().trim();
      
      // First try: exact vendor name match
      let match = lineItemOptions.find(opt => 
        opt.vendorName?.toLowerCase().trim() === vendorNameLower
      );
      
      // Second try: line item name contains vendor name
      if (!match) {
        match = lineItemOptions.find(opt => 
          opt.lineItemName.toLowerCase().includes(vendorNameLower)
        );
      }
      
      if (match) {
        newMappings[group.canonicalVendorId] = match.lineItemId;
      }
    }
    
    setLineItemMappings(newMappings);
  };

  // Handle line item selection
  const handleLineItemSelect = (canonicalVendorId: string, lineItemId: string) => {
    setLineItemMappings(prev => ({
      ...prev,
      [canonicalVendorId]: lineItemId,
    }));
  };

  // Handle continue
  const handleContinue = () => {
    const mappedTransactions: ImportedTransactionMapped[] = transactions.map(tx => {
      const lineItemId = lineItemMappings[tx.canonicalVendorId];
      const option = lineItemOptions.find(opt => opt.lineItemId === lineItemId);
      
      return {
        ...tx,
        costCenterId: option?.costCenterId || "",
        costCenterName: option?.costCenterName || "",
        lineItemId: lineItemId,
        lineItemName: option?.lineItemName || "",
      };
    });
    
    onContinue({
      lineItemMappings,
      transactions: mappedTransactions,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Line Item Mapping</h2>
        <p className="text-sm text-muted-foreground">
          Map each vendor to a budget line item to categorize transactions.
        </p>
      </div>

      {/* Progress */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allMapped ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : null}
          <span className={allMapped ? "text-green-600 font-medium" : "text-muted-foreground"}>
            Mapped {mappedCount} of {totalCount} vendors
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={handleAutoMap}>
          <Wand2 className="h-4 w-4 mr-2" />
          Auto-map by vendor
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Filter vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Line Item Mapping Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                <TableHead>Canonical Vendor</TableHead>
                <TableHead className="text-right w-20"># Txns</TableHead>
                <TableHead className="text-right w-28">Total</TableHead>
                <TableHead className="w-80">Line Item</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => (
                <TableRow key={group.canonicalVendorId}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {group.canonicalVendorName}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {group.count}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUSD(group.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={lineItemMappings[group.canonicalVendorId] || ""}
                      onValueChange={(value) => handleLineItemSelect(group.canonicalVendorId, value)}
                    >
                      <SelectTrigger className="w-72">
                        <SelectValue placeholder="Select line item..." />
                      </SelectTrigger>
                      <SelectContent>
                        {sortedLineItemOptions.map((option) => (
                          <SelectItem key={option.lineItemId} value={option.lineItemId}>
                            {option.costCenterName}: {option.lineItemName}
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
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Vendors
        </Button>
        <Button onClick={handleContinue} disabled={!allMapped}>
          Post to Actuals (Coming Next)
        </Button>
      </div>
    </div>
  );
}
