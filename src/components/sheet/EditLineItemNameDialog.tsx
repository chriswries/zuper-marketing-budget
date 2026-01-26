import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LineItem } from '@/types/budget';
import { DuplicateLineItemResult } from '@/lib/lineItemNameValidation';

export interface EditLineItemNameData {
  costCenterId: string;
  costCenterName: string;
  lineItem: LineItem;
}

interface EditLineItemNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EditLineItemNameData | null;
  onSave: (costCenterId: string, lineItemId: string, newName: string) => void;
  checkDuplicateName: (name: string, excludeLineItemId: string) => DuplicateLineItemResult;
}

export function EditLineItemNameDialog({
  open,
  onOpenChange,
  data,
  onSave,
  checkDuplicateName,
}: EditLineItemNameDialogProps) {
  const [name, setName] = useState('');
  const [duplicateResult, setDuplicateResult] = useState<DuplicateLineItemResult>({ duplicate: false });

  // Reset and populate when dialog opens
  useEffect(() => {
    if (open && data) {
      setName(data.lineItem.name);
      setDuplicateResult({ duplicate: false });
    }
  }, [open, data]);

  // Real-time duplicate check
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (data && value.trim()) {
      const result = checkDuplicateName(value, data.lineItem.id);
      setDuplicateResult(result);
    } else {
      setDuplicateResult({ duplicate: false });
    }
  }, [checkDuplicateName, data]);

  const trimmedName = name.trim();
  const isEmpty = trimmedName === '';
  const isDuplicate = duplicateResult.duplicate;
  const canSave = !isEmpty && !isDuplicate;

  const handleSave = () => {
    if (!data || !canSave) return;
    onSave(data.costCenterId, data.lineItem.id, trimmedName);
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename Line Item</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {data.costCenterName} → {data.lineItem.name}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="line-item-name">
              New name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="line-item-name"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter line item name"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) {
                  handleSave();
                }
              }}
            />
            {isEmpty && name !== data.lineItem.name && (
              <p className="text-sm text-destructive">Name cannot be empty</p>
            )}
            {isDuplicate && (
              <p className="text-sm text-destructive">
                Name already exists in "{duplicateResult.existingCostCenterName}"
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
