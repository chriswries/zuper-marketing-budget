import { useState } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MONTHS, MONTH_LABELS, Month } from '@/types/budget';
import { SpendRequest, createDefaultApprovalSteps } from '@/types/requests';

interface CostCenterOption {
  id: string;
  name: string;
}

interface CreateRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCenters: CostCenterOption[];
  onCreateRequest: (request: SpendRequest) => void;
  requesterId?: string;
}

export function CreateRequestDialog({
  open,
  onOpenChange,
  costCenters,
  onCreateRequest,
  requesterId,
}: CreateRequestDialogProps) {
  const [costCenterId, setCostCenterId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [amount, setAmount] = useState('');
  const [startMonth, setStartMonth] = useState<Month>('feb');
  const [endMonth, setEndMonth] = useState<Month>('feb');
  const [isContracted, setIsContracted] = useState(false);
  const [justification, setJustification] = useState('');

  const resetForm = () => {
    setCostCenterId('');
    setVendorName('');
    setAmount('');
    setStartMonth('feb');
    setEndMonth('feb');
    setIsContracted(false);
    setJustification('');
  };

  const handleSubmit = () => {
    const selectedCostCenter = costCenters.find((cc) => cc.id === costCenterId);
    if (!selectedCostCenter || !vendorName.trim() || !amount) return;

    const request: SpendRequest = {
      id: crypto.randomUUID(),
      costCenterId,
      costCenterName: selectedCostCenter.name,
      vendorName: vendorName.trim(),
      amount: parseFloat(amount),
      startMonth,
      endMonth,
      isContracted,
      justification: justification.trim(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      approvalSteps: createDefaultApprovalSteps(),
      requesterId,
    };

    onCreateRequest(request);
    resetForm();
    onOpenChange(false);
  };

  const isValid =
    costCenterId &&
    vendorName.trim() &&
    amount &&
    parseFloat(amount) > 0 &&
    MONTHS.indexOf(endMonth) >= MONTHS.indexOf(startMonth);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Spend Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="costCenter">Cost Center</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger id="costCenter">
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
            <Label htmlFor="vendor">Vendor</Label>
            <Input
              id="vendor"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="Enter vendor name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount ($)</Label>
            <Input
              id="amount"
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startMonth">Start Month</Label>
              <Select value={startMonth} onValueChange={(v) => setStartMonth(v as Month)}>
                <SelectTrigger id="startMonth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem key={month} value={month}>
                      {MONTH_LABELS[month]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endMonth">End Month</Label>
              <Select value={endMonth} onValueChange={(v) => setEndMonth(v as Month)}>
                <SelectTrigger id="endMonth">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((month) => (
                    <SelectItem
                      key={month}
                      value={month}
                      disabled={MONTHS.indexOf(month) < MONTHS.indexOf(startMonth)}
                    >
                      {MONTH_LABELS[month]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="contracted"
              checked={isContracted}
              onCheckedChange={(checked) => setIsContracted(checked === true)}
            />
            <Label htmlFor="contracted" className="font-normal">
              Contracted spend
            </Label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Explain the business need..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Create Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
