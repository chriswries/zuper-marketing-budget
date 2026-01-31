import { useState, useMemo, useEffect } from 'react';
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
import { CostCenter, LineItem, Month, MONTHS, MONTH_LABELS, MonthlyValues, calculateFYTotal } from '@/types/budget';

type ScheduleType = 'one-time' | 'recurring' | 'spread' | 'custom';

export interface DuplicateNameCheckResult {
  duplicate: boolean;
  existingCostCenterName?: string;
  existingLineItemName?: string;
}

export interface EditLineItemData {
  costCenterId: string;
  costCenterName: string;
  lineItem: LineItem;
}

interface EditLineItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EditLineItemData | null;
  costCenters: CostCenter[];
  lockedMonths: Set<Month>;
  onSave: (costCenterId: string, updatedLineItem: LineItem, newCostCenterId?: string) => void;
  /** Optional callback to check for duplicate line item names */
  checkDuplicateName?: (name: string, excludeLineItemId: string) => DuplicateNameCheckResult;
  /** The sheet type determines which values to edit */
  valueType: 'budgetValues' | 'forecastValues';
}

function createEmptyMonthlyValues(): MonthlyValues {
  return {
    feb: 0, mar: 0, apr: 0, may: 0, jun: 0, jul: 0,
    aug: 0, sep: 0, oct: 0, nov: 0, dec: 0, jan: 0,
  };
}

// Detect what type of schedule was used based on monthly values
function detectScheduleType(values: MonthlyValues, lockedMonths: Set<Month>): {
  type: ScheduleType;
  oneTimeMonth?: Month;
  oneTimeAmount?: number;
  recurringStartMonth?: Month;
  recurringEndMonth?: Month;
  recurringMonthlyAmount?: number;
  spreadStartMonth?: Month;
  spreadEndMonth?: Month;
  spreadTotalAmount?: number;
} {
  const nonZeroMonths = MONTHS.filter(m => values[m] > 0);
  
  if (nonZeroMonths.length === 0) {
    return { type: 'custom' };
  }
  
  if (nonZeroMonths.length === 1) {
    const month = nonZeroMonths[0];
    return {
      type: 'one-time',
      oneTimeMonth: month,
      oneTimeAmount: values[month],
    };
  }
  
  // Check if all non-zero values are the same (recurring)
  const amounts = nonZeroMonths.map(m => values[m]);
  const allSame = amounts.every(a => a === amounts[0]);
  
  // Check if months are consecutive
  const startIdx = MONTHS.indexOf(nonZeroMonths[0]);
  const endIdx = MONTHS.indexOf(nonZeroMonths[nonZeroMonths.length - 1]);
  const isConsecutive = nonZeroMonths.length === (endIdx - startIdx + 1);
  
  if (allSame && isConsecutive) {
    return {
      type: 'recurring',
      recurringStartMonth: nonZeroMonths[0],
      recurringEndMonth: nonZeroMonths[nonZeroMonths.length - 1],
      recurringMonthlyAmount: amounts[0],
    };
  }
  
  if (isConsecutive) {
    // Could be spread - total divided among months
    return {
      type: 'spread',
      spreadStartMonth: nonZeroMonths[0],
      spreadEndMonth: nonZeroMonths[nonZeroMonths.length - 1],
      spreadTotalAmount: amounts.reduce((a, b) => a + b, 0),
    };
  }
  
  // Otherwise it's custom
  return { type: 'custom' };
}

export function EditLineItemDialog({
  open,
  onOpenChange,
  data,
  costCenters,
  lockedMonths,
  onSave,
  checkDuplicateName,
  valueType,
}: EditLineItemDialogProps) {
  // Form state
  const [costCenterId, setCostCenterId] = useState<string>('');
  const [name, setName] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [isContracted, setIsContracted] = useState(false);
  const [isAccrual, setIsAccrual] = useState(false);
  const [isSoftwareSubscription, setIsSoftwareSubscription] = useState(false);
  const [scheduleType, setScheduleType] = useState<ScheduleType>('custom');

  // Schedule fields
  const [oneTimeMonth, setOneTimeMonth] = useState<Month | ''>('');
  const [oneTimeAmount, setOneTimeAmount] = useState('');
  const [recurringStartMonth, setRecurringStartMonth] = useState<Month | ''>('');
  const [recurringEndMonth, setRecurringEndMonth] = useState<Month | ''>('');
  const [recurringMonthlyAmount, setRecurringMonthlyAmount] = useState('');
  const [spreadStartMonth, setSpreadStartMonth] = useState<Month | ''>('');
  const [spreadEndMonth, setSpreadEndMonth] = useState<Month | ''>('');
  const [spreadTotalAmount, setSpreadTotalAmount] = useState('');
  
  // Custom values (for custom mode)
  const [customValues, setCustomValues] = useState<MonthlyValues>(createEmptyMonthlyValues());

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

  // Populate form when dialog opens
  useEffect(() => {
    if (open && data) {
      const { lineItem, costCenterId: ccId } = data;
      setCostCenterId(ccId);
      setName(lineItem.name);
      setVendorName(lineItem.vendor?.name ?? '');
      setIsContracted(lineItem.isContracted);
      setIsAccrual(lineItem.isAccrual);
      setIsSoftwareSubscription(lineItem.isSoftwareSubscription);
      
      // Get the current values based on the sheet type
      const currentValues = lineItem[valueType];
      setCustomValues({ ...currentValues });
      
      // Detect schedule type from current values
      const detected = detectScheduleType(currentValues, lockedMonths);
      setScheduleType(detected.type);
      
      if (detected.type === 'one-time') {
        setOneTimeMonth(detected.oneTimeMonth ?? '');
        setOneTimeAmount(detected.oneTimeAmount?.toString() ?? '');
      } else if (detected.type === 'recurring') {
        setRecurringStartMonth(detected.recurringStartMonth ?? '');
        setRecurringEndMonth(detected.recurringEndMonth ?? '');
        setRecurringMonthlyAmount(detected.recurringMonthlyAmount?.toString() ?? '');
      } else if (detected.type === 'spread') {
        setSpreadStartMonth(detected.spreadStartMonth ?? '');
        setSpreadEndMonth(detected.spreadEndMonth ?? '');
        setSpreadTotalAmount(detected.spreadTotalAmount?.toString() ?? '');
      }
    }
  }, [open, data, valueType, lockedMonths]);

  // Calculate values based on schedule
  const calculateValues = (): MonthlyValues => {
    if (scheduleType === 'custom') {
      return { ...customValues };
    }
    
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
          const remainder = Math.round(total) - (perMonth * monthsInRange.length);
          
          monthsInRange.forEach((month, idx) => {
            // Put remainder in last month
            values[month] = perMonth + (idx === monthsInRange.length - 1 ? remainder : 0);
          });
        }
      }
    }

    return values;
  };

  // Check for duplicate name
  const duplicateCheck = useMemo<DuplicateNameCheckResult>(() => {
    if (!checkDuplicateName || !data || !name.trim()) {
      return { duplicate: false };
    }
    return checkDuplicateName(name, data.lineItem.id);
  }, [checkDuplicateName, name, data]);

  // Compute the total for the preview
  const previewTotal = useMemo(() => {
    const values = calculateValues();
    return calculateFYTotal(values);
  }, [scheduleType, oneTimeMonth, oneTimeAmount, recurringStartMonth, recurringEndMonth, recurringMonthlyAmount, spreadStartMonth, spreadEndMonth, spreadTotalAmount, customValues]);

  // Validation
  const isValid = useMemo(() => {
    if (!costCenterId || !name.trim() || !vendorName.trim()) return false;
    
    // Block if duplicate name
    if (duplicateCheck.duplicate) return false;

    if (scheduleType === 'custom') {
      // Custom is always valid (can have zero values)
      return true;
    } else if (scheduleType === 'one-time') {
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
    vendorName,
    duplicateCheck.duplicate,
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

  const handleSubmit = () => {
    if (!isValid || !data) return;

    const calculatedValues = calculateValues();

    const updatedLineItem: LineItem = {
      ...data.lineItem,
      name: name.trim(),
      vendor: vendorName.trim()
        ? { id: data.lineItem.vendor?.id ?? crypto.randomUUID(), name: vendorName.trim() }
        : null,
      isContracted,
      isAccrual,
      isSoftwareSubscription,
      [valueType]: calculatedValues,
    };

    // If cost center changed, pass the new one
    const newCostCenterId = costCenterId !== data.costCenterId ? costCenterId : undefined;
    onSave(data.costCenterId, updatedLineItem, newCostCenterId);
    onOpenChange(false);
  };

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  if (!data) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit line item</DialogTitle>
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

          {/* Vendor Name */}
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor name *</Label>
            <Input
              id="vendor"
              value={vendorName}
              onChange={(e) => setVendorName(e.target.value)}
              placeholder="e.g., Google"
            />
          </div>

          {/* Line Item Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Line item name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Google Ads Q3"
              className={duplicateCheck.duplicate ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {duplicateCheck.duplicate && (
              <p className="text-sm text-destructive">
                Line item name already exists
                {duplicateCheck.existingCostCenterName && (
                  <> in "{duplicateCheck.existingCostCenterName}"</>
                )}
                . Please choose a unique name.
              </p>
            )}
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
              <div className="flex items-center gap-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="cursor-pointer font-normal">
                  Custom (edit per-month)
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

          {/* Schedule Fields - Custom */}
          {scheduleType === 'custom' && (
            <div className="space-y-3 pl-4 border-l-2 border-muted">
              <p className="text-sm text-muted-foreground">
                Enter values for each month. Locked months cannot be edited.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {MONTHS.map((m) => {
                  const isLocked = lockedMonths.has(m);
                  return (
                    <div key={m} className="space-y-1">
                      <Label htmlFor={`custom-${m}`} className="text-xs">
                        {MONTH_LABELS[m]} {isLocked && '🔒'}
                      </Label>
                      <Input
                        id={`custom-${m}`}
                        type="number"
                        min="0"
                        className="h-8 text-sm"
                        value={customValues[m]}
                        onChange={(e) =>
                          setCustomValues((prev) => ({
                            ...prev,
                            [m]: parseFloat(e.target.value) || 0,
                          }))
                        }
                        disabled={isLocked}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Total Preview */}
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              FY Total: <span className="font-medium text-foreground">{formatCurrency(previewTotal)}</span>
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
