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
import { LineItem } from '@/types/budget';

export type RowActionType = 'cancel_request' | 'delete_line_item';

export interface RowActionData {
  type: RowActionType;
  costCenterId: string;
  lineItem: LineItem;
  targetRequestId?: string; // For cancel_request, the request being cancelled
}

interface RowActionDialogProps {
  open: boolean;
  data: RowActionData | null;
  onCancel: () => void;
  onSubmit: (justification: string) => void;
}

export function RowActionDialog({
  open,
  data,
  onCancel,
  onSubmit,
}: RowActionDialogProps) {
  const [justification, setJustification] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset justification when dialog opens with new data
  useEffect(() => {
    if (open) {
      setJustification('');
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open, data]);

  const handleSubmit = () => {
    if (!justification.trim()) return;
    onSubmit(justification.trim());
  };

  if (!data) return null;

  const isCancel = data.type === 'cancel_request';
  const title = isCancel ? 'Cancel Request' : 'Delete Line Item';
  const description = isCancel
    ? `This will cancel the pending approval request for "${data.lineItem.name}".`
    : `This will delete "${data.lineItem.name}" from the forecast.`;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="justification">Justification *</Label>
            <Textarea
              ref={textareaRef}
              id="justification"
              placeholder={isCancel 
                ? 'Why are you cancelling this request?' 
                : 'Why are you deleting this line item?'}
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onCancel}>
            Go back
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={!justification.trim()}
          >
            {isCancel ? 'Cancel Request' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
