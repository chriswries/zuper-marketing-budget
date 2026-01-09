import { useState, useMemo, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Wand2, Search, CheckCircle2, Loader2 } from "lucide-react";
import type { 
  ImportedTransactionDraft, 
  ImportedTransactionWithVendor,
} from "@/types/import";
import type { CanonicalVendor } from "@/types/vendorRegistry";
import { formatUSD } from "@/lib/import";
import { 
  listCanonicalVendors, 
  upsertCanonicalVendor, 
  upsertVendorAlias,
  resolveCanonicalVendorForMerchant,
  normalizeVendorKey,
  logVendorRegistryAudit,
} from "@/lib/vendorRegistryStore";
import { useCurrentUserRole } from "@/contexts/CurrentUserRoleContext";
import { toast } from "sonner";

interface VendorNormalizationStepProps {
  transactions: ImportedTransactionDraft[];
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
  initialMappings = {},
  onBack,
  onContinue,
}: VendorNormalizationStepProps) {
  const { currentRole, actualRole } = useCurrentUserRole();
  const isAdmin = actualRole === 'admin';
  const [vendorMappings, setVendorMappings] = useState<Record<string, string>>(initialMappings);
  const [canonicalVendors, setCanonicalVendors] = useState<CanonicalVendor[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorDialogOpen, setNewVendorDialogOpen] = useState(false);
  const [addingForRawVendor, setAddingForRawVendor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [createAliasOnSave, setCreateAliasOnSave] = useState(true);

  // Load global canonical vendors on mount
  useEffect(() => {
    async function loadVendors() {
      setIsLoading(true);
      try {
        const vendors = await listCanonicalVendors();
        setCanonicalVendors(vendors);
        
        // Auto-resolve existing aliases for each raw vendor
        const newMappings = { ...vendorMappings };
        for (const tx of transactions) {
          if (newMappings[tx.rawVendorName]) continue;
          
          const resolved = await resolveCanonicalVendorForMerchant(tx.rawVendorName);
          if (resolved) {
            newMappings[tx.rawVendorName] = resolved.id;
          }
        }
        setVendorMappings(newMappings);
      } catch (err) {
        console.error('Failed to load vendors:', err);
        toast.error('Failed to load vendor registry');
      } finally {
        setIsLoading(false);
      }
    }
    loadVendors();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Auto-map exact matches using vendor name or existing aliases
  const handleAutoMap = async () => {
    const newMappings = { ...vendorMappings };
    let autoMappedCount = 0;
    
    for (const group of vendorGroups) {
      if (newMappings[group.rawVendorName]) continue; // Already mapped
      
      // First try to resolve via alias
      const resolved = await resolveCanonicalVendorForMerchant(group.rawVendorName);
      if (resolved) {
        newMappings[group.rawVendorName] = resolved.id;
        autoMappedCount++;
        continue;
      }
      
      // Then try exact name match
      const rawLower = group.rawVendorName.toLowerCase().trim();
      const match = canonicalVendors.find(v => 
        v.name.toLowerCase().trim() === rawLower
      );
      
      if (match) {
        newMappings[group.rawVendorName] = match.id;
        autoMappedCount++;
      }
    }
    
    setVendorMappings(newMappings);
    
    if (autoMappedCount > 0) {
      toast.success(`Auto-mapped ${autoMappedCount} vendor(s)`);
    } else {
      toast.info('No additional vendors could be auto-mapped');
    }
  };

  // Handle vendor selection
  const handleVendorSelect = (rawVendorName: string, canonicalVendorId: string) => {
    setVendorMappings(prev => ({
      ...prev,
      [rawVendorName]: canonicalVendorId,
    }));
  };

  // Handle creating a new vendor (admin only)
  const handleCreateVendor = async () => {
    if (!newVendorName.trim() || !isAdmin) return;
    
    setIsSaving(true);
    try {
      const newVendor = await upsertCanonicalVendor(newVendorName.trim());
      
      if (!newVendor) {
        toast.error('Failed to create vendor');
        return;
      }

      // Log audit event
      await logVendorRegistryAudit(
        'vendor_created',
        newVendor.id,
        currentRole || 'admin',
        { vendorId: newVendor.id, vendorName: newVendor.name }
      );

      // If we were adding for a specific raw vendor, create alias and auto-select
      if (addingForRawVendor) {
        const alias = await upsertVendorAlias(addingForRawVendor, newVendor.id);
        if (alias) {
          await logVendorRegistryAudit(
            'vendor_alias_created',
            alias.id,
            currentRole || 'admin',
            { 
              vendorId: newVendor.id, 
              vendorName: newVendor.name,
              aliasId: alias.id,
              aliasKey: alias.aliasKey,
              aliasDisplay: alias.aliasDisplay,
            }
          );
        }

        setVendorMappings(prev => ({
          ...prev,
          [addingForRawVendor]: newVendor.id,
        }));
      }

      // Refresh vendors list
      const updatedVendors = await listCanonicalVendors();
      setCanonicalVendors(updatedVendors);
      
      toast.success(`Created vendor "${newVendor.name}"`);
      setNewVendorName("");
      setAddingForRawVendor(null);
      setNewVendorDialogOpen(false);
    } catch (err) {
      console.error('Failed to create vendor:', err);
      toast.error('Failed to create vendor');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle continue - optionally create aliases for new mappings
  const handleContinue = async () => {
    setIsSaving(true);
    try {
      // Create aliases for each mapping if admin and enabled
      if (isAdmin && createAliasOnSave) {
        for (const [rawVendorName, vendorId] of Object.entries(vendorMappings)) {
          // Check if alias already exists
          const resolved = await resolveCanonicalVendorForMerchant(rawVendorName);
          if (!resolved || resolved.id !== vendorId) {
            // Create new alias
            const alias = await upsertVendorAlias(rawVendorName, vendorId);
            if (alias) {
              const vendor = canonicalVendors.find(v => v.id === vendorId);
              await logVendorRegistryAudit(
                'vendor_alias_created',
                alias.id,
                currentRole || 'admin',
                { 
                  vendorId, 
                  vendorName: vendor?.name,
                  aliasId: alias.id,
                  aliasKey: alias.aliasKey,
                  aliasDisplay: alias.aliasDisplay,
                }
              );
            }
          }
        }
      }

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
    } catch (err) {
      console.error('Failed to save aliases:', err);
      toast.error('Failed to save vendor mappings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading vendor registry...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Vendor Normalization</h2>
        <p className="text-sm text-muted-foreground">
          Map raw vendor names from your CSV to canonical vendors. 
          {isAdmin ? " Mappings will be saved as global aliases for future imports." : " Contact an admin to add new vendors."}
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
            Auto-map
          </Button>
          {isAdmin && (
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
                    Create a new canonical vendor. This will be available globally for all fiscal years.
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
                      An alias will be created for: <strong>{addingForRawVendor}</strong>
                    </p>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setNewVendorDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateVendor} disabled={!newVendorName.trim() || isSaving}>
                    {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Create Vendor
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
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
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-64">Canonical Vendor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group) => {
                const isMapped = !!vendorMappings[group.rawVendorName];
                return (
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
                      {isMapped ? (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          Matched
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-600 border-amber-600">
                          Unmapped
                        </Badge>
                      )}
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
                        {isAdmin && (
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
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Save alias toggle for admin */}
      {isAdmin && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="create-aliases"
            checked={createAliasOnSave}
            onChange={(e) => setCreateAliasOnSave(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label htmlFor="create-aliases" className="text-sm text-muted-foreground">
            Save mappings as global aliases for future imports
          </Label>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Confirm
        </Button>
        <Button onClick={handleContinue} disabled={!allMapped || isSaving}>
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Continue to Line Item Mapping
        </Button>
      </div>
    </div>
  );
}
