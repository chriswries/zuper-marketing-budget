import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { LineItem } from '@/types/budget';

export interface EditTagsData {
  costCenterId: string;
  costCenterName: string;
  lineItem: LineItem;
}

export interface TagValues {
  isContracted: boolean;
  isAccrual: boolean;
  isSoftwareSubscription: boolean;
}

interface EditTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EditTagsData | null;
  onSave: (costCenterId: string, lineItemId: string, tags: TagValues) => void;
}

export function EditTagsDialog({ open, onOpenChange, data, onSave }: EditTagsDialogProps) {
  const [isContracted, setIsContracted] = useState(false);
  const [isAccrual, setIsAccrual] = useState(false);
  const [isSoftwareSubscription, setIsSoftwareSubscription] = useState(false);

  // Sync state when data changes
  useEffect(() => {
    if (data) {
      setIsContracted(data.lineItem.isContracted ?? false);
      setIsAccrual(data.lineItem.isAccrual ?? false);
      setIsSoftwareSubscription(data.lineItem.isSoftwareSubscription ?? false);
    }
  }, [data]);

  const handleSave = () => {
    if (!data) return;
    onSave(data.costCenterId, data.lineItem.id, {
      isContracted,
      isAccrual,
      isSoftwareSubscription,
    });
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Edit Tags</DialogTitle>
          <DialogDescription>
            {data.costCenterName} → {data.lineItem.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="flex items-center space-x-3">
            <Checkbox
              id="contracted"
              checked={isContracted}
              onCheckedChange={(checked) => setIsContracted(checked === true)}
            />
            <Label htmlFor="contracted" className="cursor-pointer">
              Contracted
            </Label>
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="accrual"
              checked={isAccrual}
              onCheckedChange={(checked) => setIsAccrual(checked === true)}
            />
            <Label htmlFor="accrual" className="cursor-pointer">
              Accrual
            </Label>
          </div>

          <div className="flex items-center space-x-3">
            <Checkbox
              id="software"
              checked={isSoftwareSubscription}
              onCheckedChange={(checked) => setIsSoftwareSubscription(checked === true)}
            />
            <Label htmlFor="software" className="cursor-pointer">
              Software Subscription
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
