import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Month, MONTH_LABELS } from '@/types/budget';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export interface AdjustmentJustificationData {
  costCenterId: string;
  lineItemId: string;
  lineItemName: string;
  month: Month;
  oldValue: number;
  newValue: number;
  delta: number;
  threshold: number;
  sheet: 'budget' | 'forecast';
}

interface AdjustmentJustificationDialogProps {
  open: boolean;
  data: AdjustmentJustificationData | null;
  onCancel: () => void;
  onSubmit: (justification: string) => void;
}

export function AdjustmentJustificationDialog({
  open,
  data,
  onCancel,
  onSubmit,
}: AdjustmentJustificationDialogProps) {
  const [justification, setJustification] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset justification when dialog opens with new data
  useEffect(() => {
    if (open) {
      setJustification('');
      // Focus textarea after dialog opens
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, data]);

  const handleSubmit = () => {
    if (!justification.trim()) return;
    onSubmit(justification.trim());
  };

  if (!data) return null;

  const sheetLabel = data.sheet === 'budget' ? 'Budget' : 'Forecast';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Approval Required</DialogTitle>
          <DialogDescription>
            This change exceeds the approval threshold. Please provide a justification to proceed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="text-muted-foreground">Line Item</div>
            <div className="font-medium">{data.lineItemName}</div>

            <div className="text-muted-foreground">Month</div>
            <div className="font-medium">{MONTH_LABELS[data.month]}</div>

            <div className="text-muted-foreground">Change Amount</div>
            <div className="font-medium text-amber-600">+{formatCurrency(data.delta)}</div>

            <div className="text-muted-foreground">Threshold</div>
            <div className="font-medium">{formatCurrency(data.threshold)}</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justification">Justification *</Label>
            <Textarea
              ref={textareaRef}
              id="justification"
              placeholder={`Why is this ${sheetLabel.toLowerCase()} increase necessary?`}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!justification.trim()}
          >
            Submit Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
