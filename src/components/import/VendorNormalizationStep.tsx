import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Wand2, Search, CheckCircle2 } from "lucide-react";
import type { 
  ImportedTransactionDraft, 
  ImportedTransactionWithVendor,
  CanonicalVendor 
} from "@/types/import";
import { formatUSD } from "@/lib/import";

interface VendorNormalizationStepProps {
  transactions: ImportedTransactionDraft[];
  canonicalVendors: CanonicalVendor[];
  initialMappings?: Record<string, string>;
  onBack: () => void;
  onContinue: (result: {
    vendorMappings: Record<string, string>;
    transactions: ImportedTransactionWithVendor[];
    canonicalVendors: CanonicalVendor[];
  }) => void;
}

interface VendorGroup {
  rawVendorName: string;
  count: number;
  totalAmount: number;
}

export function VendorNormalizationStep({
  transactions,
  canonicalVendors: initialVendors,
  initialMappings = {},
  onBack,
  onContinue,
}: VendorNormalizationStepProps) {
  const [vendorMappings, setVendorMappings] = useState<Record<string, string>>(initialMappings);
  const [canonicalVendors, setCanonicalVendors] = useState<CanonicalVendor[]>(initialVendors);
  const [searchQuery, setSearchQuery] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorDialogOpen, setNewVendorDialogOpen] = useState(false);
  const [addingForRawVendor, setAddingForRawVendor] = useState<string | null>(null);

  // Group transactions by raw vendor name
  const vendorGroups = useMemo(() => {
    const groups = new Map<string, VendorGroup>();
    
    for (const tx of transactions) {
      const existing = groups.get(tx.rawVendorName);
      if (existing) {
        existing.count += 1;
        existing.totalAmount += tx.amount;
      } else {
        groups.set(tx.rawVendorName, {
          rawVendorName: tx.rawVendorName,
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
      g.rawVendorName.toLowerCase().includes(query)
    );
  }, [vendorGroups, searchQuery]);

  // Count mapped vendors
  const mappedCount = vendorGroups.filter(g => vendorMappings[g.rawVendorName]).length;
  const totalCount = vendorGroups.length;
  const allMapped = mappedCount === totalCount;

  // Auto-map exact matches
  const handleAutoMap = () => {
    const newMappings = { ...vendorMappings };
    
    for (const group of vendorGroups) {
      if (newMappings[group.rawVendorName]) continue; // Already mapped
      
      const rawLower = group.rawVendorName.toLowerCase().trim();
      const match = canonicalVendors.find(v => 
        v.name.toLowerCase().trim() === rawLower
      );
      
      if (match) {
        newMappings[group.rawVendorName] = match.id;
      }
    }
    
    setVendorMappings(newMappings);
  };

  // Handle vendor selection
  const handleVendorSelect = (rawVendorName: string, canonicalVendorId: string) => {
    setVendorMappings(prev => ({
      ...prev,
      [rawVendorName]: canonicalVendorId,
    }));
  };

  // Handle creating a new vendor
  const handleCreateVendor = () => {
    if (!newVendorName.trim()) return;
    
    const newVendor: CanonicalVendor = {
      id: `new-${Date.now()}`,
      name: newVendorName.trim(),
    };
    
    setCanonicalVendors(prev => [...prev, newVendor].sort((a, b) => 
      a.name.localeCompare(b.name)
    ));
    
    // If we were adding for a specific raw vendor, auto-select it
    if (addingForRawVendor) {
      setVendorMappings(prev => ({
        ...prev,
        [addingForRawVendor]: newVendor.id,
      }));
    }
    
    setNewVendorName("");
    setAddingForRawVendor(null);
    setNewVendorDialogOpen(false);
  };

  // Handle continue
  const handleContinue = () => {
    const normalizedTransactions: ImportedTransactionWithVendor[] = transactions.map(tx => {
      const vendorId = vendorMappings[tx.rawVendorName];
      const vendor = canonicalVendors.find(v => v.id === vendorId);
      
      return {
        ...tx,
        canonicalVendorId: vendorId,
        canonicalVendorName: vendor?.name || "",
      };
    });
    
    onContinue({
      vendorMappings,
      transactions: normalizedTransactions,
      canonicalVendors,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Vendor Normalization</h2>
        <p className="text-sm text-muted-foreground">
          Map raw vendor names from your CSV to canonical vendors used in your budget.
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
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAutoMap}>
            <Wand2 className="h-4 w-4 mr-2" />
            Auto-map exact matches
          </Button>
          <Dialog open={newVendorDialogOpen} onOpenChange={setNewVendorDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setAddingForRawVendor(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Vendor</DialogTitle>
                <DialogDescription>
                  Create a new canonical vendor to map transactions to.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="vendor-name">Vendor Name</Label>
                  <Input
                    id="vendor-name"
                    value={newVendorName}
                    onChange={(e) => setNewVendorName(e.target.value)}
                    placeholder="e.g., Acme Corp"
                  />
                </div>
                {addingForRawVendor && (
                  <p className="text-sm text-muted-foreground">
                    This vendor will be mapped to: <strong>{addingForRawVendor}</strong>
                  </p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setNewVendorDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateVendor} disabled={!newVendorName.trim()}>
                  Create Vendor
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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

      {/* Vendor Mapping Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted">
              <TableRow>
                <TableHead>Raw Vendor</TableHead>
                <TableHead className="text-right w-20"># Txns</TableHead>
                <TableHead className="text-right w-28">Total</TableHead>
                <TableHead className="w-64">Canonical Vendor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => (
                <TableRow key={group.rawVendorName}>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {group.rawVendorName}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {group.count}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatUSD(group.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Select
                        value={vendorMappings[group.rawVendorName] || ""}
                        onValueChange={(value) => handleVendorSelect(group.rawVendorName, value)}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select vendor..." />
                        </SelectTrigger>
                        <SelectContent>
                          {canonicalVendors.map((vendor) => (
                            <SelectItem key={vendor.id} value={vendor.id}>
                              {vendor.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() => {
                          setAddingForRawVendor(group.rawVendorName);
                          setNewVendorName(group.rawVendorName);
                          setNewVendorDialogOpen(true);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
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
          Back to Confirm
        </Button>
        <Button onClick={handleContinue} disabled={!allMapped}>
          Continue to Line Item Mapping (Coming Next)
        </Button>
      </div>
    </div>
  );
}
