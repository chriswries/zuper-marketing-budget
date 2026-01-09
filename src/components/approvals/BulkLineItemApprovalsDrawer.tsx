import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { SpendRequest, OriginKind } from '@/types/requests';
import { requestNeedsApprovalByRole, applyApproveStep, applyRejectStep, getOriginKindLabel } from '@/lib/requestApproval';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { toast } from '@/hooks/use-toast';
import { Check, X, FileX2, Trash2 } from 'lucide-react';

interface BulkLineItemApprovalsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  originSheet: 'budget' | 'forecast';
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export function BulkLineItemApprovalsDrawer({
  open,
  onOpenChange,
  originSheet,
}: BulkLineItemApprovalsDrawerProps) {
  const { requests, updateRequest } = useRequests();
  const { currentRole } = useCurrentUserRole();
  const { selectedFiscalYearId } = useFiscalYearBudget();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Filter requests that need approval by current role for the selected FY and origin sheet
  const eligibleRequests = useMemo(() => {
    if (!selectedFiscalYearId || !currentRole) return [];
    
    return requests.filter((r) => {
      // Must be from the specified origin sheet
      if (r.originSheet !== originSheet) return false;
      
      // Must belong to selected fiscal year (ignore null legacy)
      if (r.originFiscalYearId !== selectedFiscalYearId) return false;
      
      // Must be a line item action kind
      const validKinds: OriginKind[] = ['new_line_item', 'adjustment', 'delete_line_item', 'cancel_request'];
      if (!r.originKind || !validKinds.includes(r.originKind)) return false;
      
      // Must need approval by current role
      return requestNeedsApprovalByRole(r, currentRole);
    });
  }, [requests, selectedFiscalYearId, currentRole, originSheet]);

  // Clear selection when drawer closes or eligible requests change
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      setSelectedIds(new Set());
      setRejectNote('');
    }
    onOpenChange(newOpen);
  }, [onOpenChange]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === eligibleRequests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligibleRequests.map((r) => r.id)));
    }
  }, [eligibleRequests, selectedIds.size]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleApproveSelected = useCallback(async () => {
    if (selectedIds.size === 0 || !currentRole || currentRole === 'admin') return;
    
    setIsProcessing(true);
    const role = currentRole as 'manager' | 'cmo' | 'finance';
    const count = selectedIds.size;
    
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          updateRequest(id, (r) => applyApproveStep(r, role))
        )
      );
      
      toast({
        title: 'Approved',
        description: `Approved ${count} request${count === 1 ? '' : 's'}`,
      });
      
      setSelectedIds(new Set());
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to approve some requests',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, currentRole, updateRequest]);

  const handleRejectSelected = useCallback(async () => {
    if (selectedIds.size === 0 || !currentRole || currentRole === 'admin') return;
    
    setIsProcessing(true);
    const role = currentRole as 'manager' | 'cmo' | 'finance';
    const count = selectedIds.size;
    const note = rejectNote.trim() || undefined;
    
    try {
      await Promise.all(
        Array.from(selectedIds).map((id) =>
          updateRequest(id, (r) => applyRejectStep(r, role, note))
        )
      );
      
      toast({
        title: 'Rejected',
        description: `Rejected ${count} request${count === 1 ? '' : 's'}`,
      });
      
      setSelectedIds(new Set());
      setRejectNote('');
      setRejectDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reject some requests',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedIds, currentRole, rejectNote, updateRequest]);

  const getKindIcon = (kind: OriginKind | undefined) => {
    switch (kind) {
      case 'delete_line_item':
        return <Trash2 className="h-3 w-3" />;
      case 'cancel_request':
        return <FileX2 className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const allSelected = eligibleRequests.length > 0 && selectedIds.size === eligibleRequests.length;
  const someSelected = selectedIds.size > 0;

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col">
          <SheetHeader>
            <SheetTitle>Approvals</SheetTitle>
            <SheetDescription>
              Line item approvals for this fiscal year
            </SheetDescription>
          </SheetHeader>

          {eligibleRequests.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              No line items need your approval.
            </div>
          ) : (
            <>
              <ScrollArea className="flex-1 -mx-6 px-6">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background border-b">
                    <tr>
                      <th className="py-2 px-2 text-left w-8">
                        <Checkbox
                          checked={allSelected}
                          onCheckedChange={toggleSelectAll}
                          aria-label="Select all"
                        />
                      </th>
                      <th className="py-2 px-2 text-left">Cost Center</th>
                      <th className="py-2 px-2 text-left">Line Item</th>
                      <th className="py-2 px-2 text-left">Type</th>
                      <th className="py-2 px-2 text-right">Amount</th>
                      <th className="py-2 px-2 text-right">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {eligibleRequests.map((request) => (
                      <tr
                        key={request.id}
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleSelect(request.id)}
                      >
                        <td className="py-2 px-2" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(request.id)}
                            onCheckedChange={() => toggleSelect(request.id)}
                          />
                        </td>
                        <td className="py-2 px-2 truncate max-w-[100px]">
                          {request.costCenterName}
                        </td>
                        <td className="py-2 px-2 truncate max-w-[120px]">
                          {request.lineItemName || request.vendorName}
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-xs flex items-center gap-1 w-fit">
                            {getKindIcon(request.originKind)}
                            {getOriginKindLabel(request.originKind)}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-mono">
                          {formatCurrency(request.amount)}
                        </td>
                        <td className="py-2 px-2 text-right text-muted-foreground">
                          {format(new Date(request.createdAt), 'MMM d')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollArea>

              <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
                <Button
                  onClick={handleApproveSelected}
                  disabled={!someSelected || isProcessing}
                  size="sm"
                >
                  <Check className="h-4 w-4 mr-1" />
                  Approve selected ({selectedIds.size})
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setRejectDialogOpen(true)}
                  disabled={!someSelected || isProcessing}
                  size="sm"
                >
                  <X className="h-4 w-4 mr-1" />
                  Reject selected
                </Button>
                {someSelected && (
                  <Button
                    variant="ghost"
                    onClick={clearSelection}
                    disabled={isProcessing}
                    size="sm"
                  >
                    Clear selection
                  </Button>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject {selectedIds.size} request{selectedIds.size === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject all selected requests. You can optionally add a note that will be applied to all.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="reject-note">Note (optional)</Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Reason for rejection..."
              className="mt-1"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRejectSelected}
              disabled={isProcessing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
