import { useState, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CostCenter, LineItem, Month, MONTHS, MONTH_LABELS, MonthlyValues } from '@/types/budget';

type ScheduleType = 'one-time' | 'recurring' | 'spread';

interface AddLineItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  costCenters: CostCenter[];
  lockedMonths: Set<Month>;
  onCreateLineItem: (costCenterId: string, lineItem: LineItem) => void;
}

function createEmptyMonthlyValues(): MonthlyValues {
  return {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
}

export function AddLineItemDialog({
  open,
  onOpenChange,
  costCenters,
  lockedMonths,
  onCreateLineItem,
}: AddLineItemDialogProps) {
  // Form state
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [name, setName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [isContracted, setIsContracted] = useState(false);
  const [isAccrual, setIsAccrual] = useState(false);
  const [isSoftwareSubscription, setIsSoftwareSubscription] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('one-time');

  // Schedule fields
  const [oneTimeMonth, setOneTimeMonth] = useState<Month | ''>('');
  const [oneTimeAmount, setOneTimeAmount] = useState('');
  const [recurringStartMonth, setRecurringStartMonth] = useState<Month | ''>('');
  const [recurringEndMonth, setRecurringEndMonth] = useState<Month | ''>('');
  const [recurringMonthlyAmount, setRecurringMonthlyAmount] = useState('');
  const [spreadStartMonth, setSpreadStartMonth] = useState<Month | ''>('');
  const [spreadEndMonth, setSpreadEndMonth] = useState<Month | ''>('');
  const [spreadTotalAmount, setSpreadTotalAmount] = useState('');

  // Get unlocked months
  const unlockedMonths = useMemo(() => {
    return MONTHS.filter((m) => !lockedMonths.has(m));
  }, [lockedMonths]);

  // Get valid end months (>= start month in fiscal order)
  const getValidEndMonths = (startMonth: Month | ''): Month[] => {
    if (!startMonth) return [];
    const startIndex = MONTHS.indexOf(startMonth);
    return MONTHS.slice(startIndex).filter((m) => !lockedMonths.has(m));
  };

  const recurringValidEndMonths = getValidEndMonths(recurringStartMonth);
  const spreadValidEndMonths = getValidEndMonths(spreadStartMonth);

  // Calculate forecast values based on schedule
  const calculateForecastValues = (): MonthlyValues => {
    const values = createEmptyMonthlyValues();

    if (scheduleType === 'one-time') {
      const month = oneTimeMonth as Month;
      const amount = parseFloat(oneTimeAmount) || 0;
      if (month && !lockedMonths.has(month)) {
        values[month] = Math.round(amount);
      }
    } else if (scheduleType === 'recurring') {
      const startIdx = MONTHS.indexOf(recurringStartMonth as Month);
      const endIdx = MONTHS.indexOf(recurringEndMonth as Month);
      const amount = parseFloat(recurringMonthlyAmount) || 0;
      
      if (startIdx >= 0 && endIdx >= startIdx) {
        for (let i = startIdx; i <= endIdx; i++) {
          const month = MONTHS[i];
          if (!lockedMonths.has(month)) {
            values[month] = Math.round(amount);
          }
        }
      }
    } else if (scheduleType === 'spread') {
      const startIdx = MONTHS.indexOf(spreadStartMonth as Month);
      const endIdx = MONTHS.indexOf(spreadEndMonth as Month);
      const total = parseFloat(spreadTotalAmount) || 0;
      
      if (startIdx >= 0 && endIdx >= startIdx) {
        // Count unlocked months in range
        const monthsInRange: Month[] = [];
        for (let i = startIdx; i <= endIdx; i++) {
          const month = MONTHS[i];
          if (!lockedMonths.has(month)) {
            monthsInRange.push(month);
          }
        }
        
        if (monthsInRange.length > 0) {
          const perMonth = Math.floor(total / monthsInRange.length);
          let remainder = Math.round(total) - (perMonth * monthsInRange.length);
          
          monthsInRange.forEach((month, idx) => {
            // Put remainder in last month
            values[month] = perMonth + (idx === monthsInRange.length - 1 ? remainder : 0);
          });
        }
      }
    }

    return values;
  };

  // Validation
  const isValid = useMemo(() => {
    if (!costCenterId || !name.trim()) return false;

    if (scheduleType === 'one-time') {
      return oneTimeMonth !== '' && parseFloat(oneTimeAmount) > 0;
    } else if (scheduleType === 'recurring') {
      return (
        recurringStartMonth !== '' &&
        recurringEndMonth !== '' &&
        parseFloat(recurringMonthlyAmount) > 0
      );
    } else if (scheduleType === 'spread') {
      return (
        spreadStartMonth !== '' &&
        spreadEndMonth !== '' &&
        parseFloat(spreadTotalAmount) > 0
      );
    }
    return false;
  }, [
    costCenterId,
    name,
    scheduleType,
    oneTimeMonth,
    oneTimeAmount,
    recurringStartMonth,
    recurringEndMonth,
    recurringMonthlyAmount,
    spreadStartMonth,
    spreadEndMonth,
    spreadTotalAmount,
  ]);

  const resetForm = () => {
    setCostCenterId('');
    setName('');
    setVendorName('');
    setIsContracted(false);
    setIsAccrual(false);
    setIsSoftwareSubscription(false);
    setScheduleType('one-time');
    setOneTimeMonth('');
    setOneTimeAmount('');
    setRecurringStartMonth('');
    setRecurringEndMonth('');
    setRecurringMonthlyAmount('');
    setSpreadStartMonth('');
    setSpreadEndMonth('');
    setSpreadTotalAmount('');
  };

  const handleSubmit = () => {
    if (!isValid) return;

    const forecastValues = calculateForecastValues();

    const lineItem: LineItem = {
      id: crypto.randomUUID(),
      costCenterId,
      name: name.trim(),
      vendor: vendorName.trim()
        ? { id: crypto.randomUUID(), name: vendorName.trim() }
        : null,
      ownerId: null,
      isContracted,
      isAccrual,
      isSoftwareSubscription,
      budgetValues: createEmptyMonthlyValues(),
      forecastValues,
      actualValues: createEmptyMonthlyValues(),
    };

    onCreateLineItem(costCenterId, lineItem);
    resetForm();
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm();
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add line item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Cost Center */}
          <div className="space-y-2">
            <Label htmlFor="cost-center">Cost center *</Label>
            <Select value={costCenterId} onValueChange={setCostCenterId}>
              <SelectTrigger id="cost-center">
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

          {/* Line Item Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Line item name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Google Ads Q3"
            />
          </div>

          {/* Vendor Name */}
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor name</Label>
            <Input
              id="vendor"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g., Google"
            />
          </div>

          {/* Flags */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Checkbox
                id="contracted"
                checked={isContracted}
                onCheckedChange={(checked) => setIsContracted(checked === true)}
              />
              <Label htmlFor="contracted" className="cursor-pointer">
                Contracted
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="accrual"
                checked={isAccrual}
                onCheckedChange={(checked) => setIsAccrual(checked === true)}
              />
              <Label htmlFor="accrual" className="cursor-pointer">
                Accrual
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="software-subscription"
                checked={isSoftwareSubscription}
                onCheckedChange={(checked) => setIsSoftwareSubscription(checked === true)}
              />
              <Label htmlFor="software-subscription" className="cursor-pointer">
                Software Subscription
              </Label>
            </div>
          </div>

          {/* Schedule Type */}
          <div className="space-y-3">
            <Label>Schedule type *</Label>
            <RadioGroup
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as ScheduleType)}
              className="space-y-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="one-time" id="one-time" />
                <Label htmlFor="one-time" className="cursor-pointer font-normal">
                  One-time
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="recurring" id="recurring" />
                <Label htmlFor="recurring" className="cursor-pointer font-normal">
                  Recurring monthly
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="spread" id="spread" />
                <Label htmlFor="spread" className="cursor-pointer font-normal">
                  Spread total evenly
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Schedule Fields - One-time */}
          {scheduleType === 'one-time' && (
            <div className="space-y-3 pl-4 border-l-2 border-muted">
              <div className="space-y-2">
                <Label htmlFor="one-time-month">Month *</Label>
                <Select value={oneTimeMonth} onValueChange={(v) => setOneTimeMonth(v as Month)}>
                  <SelectTrigger id="one-time-month">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {unlockedMonths.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MONTH_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="one-time-amount">Amount ($) *</Label>
                <Input
                  id="one-time-amount"
                  type="number"
                  min="0"
                  value={oneTimeAmount}
                  onChange={(e) => setOneTimeAmount(e.target.value)}
                  placeholder="10000"
                />
              </div>
            </div>
          )}

          {/* Schedule Fields - Recurring */}
          {scheduleType === 'recurring' && (
            <div className="space-y-3 pl-4 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="recurring-start">Start month *</Label>
                  <Select
                    value={recurringStartMonth}
                    onValueChange={(v) => {
                      setRecurringStartMonth(v as Month);
                      setRecurringEndMonth(''); // Reset end month
                    }}
                  >
                    <SelectTrigger id="recurring-start">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {unlockedMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MONTH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurring-end">End month *</Label>
                  <Select
                    value={recurringEndMonth}
                    onValueChange={(v) => setRecurringEndMonth(v as Month)}
                    disabled={!recurringStartMonth}
                  >
                    <SelectTrigger id="recurring-end">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent>
                      {recurringValidEndMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MONTH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="recurring-amount">Monthly amount ($) *</Label>
                <Input
                  id="recurring-amount"
                  type="number"
                  min="0"
                  value={recurringMonthlyAmount}
                  onChange={(e) => setRecurringMonthlyAmount(e.target.value)}
                  placeholder="5000"
                />
              </div>
            </div>
          )}

          {/* Schedule Fields - Spread */}
          {scheduleType === 'spread' && (
            <div className="space-y-3 pl-4 border-l-2 border-muted">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="spread-start">Start month *</Label>
                  <Select
                    value={spreadStartMonth}
                    onValueChange={(v) => {
                      setSpreadStartMonth(v as Month);
                      setSpreadEndMonth(''); // Reset end month
                    }}
                  >
                    <SelectTrigger id="spread-start">
                      <SelectValue placeholder="Start" />
                    </SelectTrigger>
                    <SelectContent>
                      {unlockedMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MONTH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spread-end">End month *</Label>
                  <Select
                    value={spreadEndMonth}
                    onValueChange={(v) => setSpreadEndMonth(v as Month)}
                    disabled={!spreadStartMonth}
                  >
                    <SelectTrigger id="spread-end">
                      <SelectValue placeholder="End" />
                    </SelectTrigger>
                    <SelectContent>
                      {spreadValidEndMonths.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MONTH_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="spread-total">Total amount ($) *</Label>
                <Input
                  id="spread-total"
                  type="number"
                  min="0"
                  value={spreadTotalAmount}
                  onChange={(e) => setSpreadTotalAmount(e.target.value)}
                  placeholder="60000"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Add line item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
