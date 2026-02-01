

## Summary

Add a "Variable monthly" schedule type option to both the Add Line Item and Edit Line Item dialogs. This option will be positioned between "Recurring monthly" and "Spread total evenly", and when selected, will display a stacked list of all 12 months (Feb-Jan) with individual text entry fields for each.

## Changes

### File: `src/components/sheet/AddLineItemDialog.tsx`

#### Change 1: Update ScheduleType to include 'variable' (Line 23)

**Current:**
```tsx
type ScheduleType = 'one-time' | 'recurring' | 'spread';
```

**Updated:**
```tsx
type ScheduleType = 'one-time' | 'recurring' | 'variable' | 'spread';
```

#### Change 2: Add state for variable monthly values (after line 73)

Add new state to track per-month values for variable mode:

```tsx
const [variableValues, setVariableValues] = useState<MonthlyValues>(createEmptyMonthlyValues());
```

#### Change 3: Update calculateForecastValues to handle 'variable' type (Lines 90-141)

Add a new branch after the 'recurring' case to handle 'variable':

```tsx
} else if (scheduleType === 'variable') {
  // Copy variable values, but only for unlocked months
  MONTHS.forEach((month) => {
    if (!lockedMonths.has(month)) {
      values[month] = Math.round(variableValues[month] || 0);
    }
  });
}
```

#### Change 4: Update validation for 'variable' type (Lines 151-187)

Add validation for variable type - valid if at least one month has a value > 0:

```tsx
} else if (scheduleType === 'variable') {
  // Variable is valid if at least one unlocked month has a value
  return MONTHS.some((m) => !lockedMonths.has(m) && variableValues[m] > 0);
}
```

Also add `variableValues` to the dependency array.

#### Change 5: Reset variable values in resetForm (Lines 189-205)

Add reset for variable values:

```tsx
setVariableValues(createEmptyMonthlyValues());
```

#### Change 6: Add "Variable monthly" radio option (Lines 351-356)

Insert new radio option between "Recurring monthly" and "Spread total evenly":

```tsx
<div className="flex items-center gap-2">
  <RadioGroupItem value="variable" id="variable" />
  <Label htmlFor="variable" className="cursor-pointer font-normal">
    Variable monthly
  </Label>
</div>
```

#### Change 7: Add Variable monthly input section (after line 449, before Spread)

Add new UI section for variable monthly inputs:

```tsx
{/* Schedule Fields - Variable */}
{scheduleType === 'variable' && (
  <div className="space-y-3 pl-4 border-l-2 border-muted">
    <p className="text-sm text-muted-foreground">
      Enter different amounts for each month. Locked months cannot be edited.
    </p>
    <div className="space-y-2">
      {MONTHS.map((m) => {
        const isLocked = lockedMonths.has(m);
        return (
          <div key={m} className="flex items-center gap-3">
            <Label htmlFor={`variable-${m}`} className="w-12 text-sm">
              {MONTH_LABELS[m]} {isLocked && '🔒'}
            </Label>
            <Input
              id={`variable-${m}`}
              type="number"
              min="0"
              className="flex-1"
              placeholder="0"
              value={variableValues[m] || ''}
              onChange={(e) =>
                setVariableValues((prev) => ({
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
```

---

### File: `src/components/sheet/EditLineItemDialog.tsx`

#### Change 1: Update ScheduleType (Line 23)

**Current:**
```tsx
type ScheduleType = 'one-time' | 'recurring' | 'spread' | 'custom';
```

**Updated:**
```tsx
type ScheduleType = 'one-time' | 'recurring' | 'variable' | 'spread' | 'custom';
```

#### Change 2: Add state for variable values (after line 146)

```tsx
const [variableValues, setVariableValues] = useState<MonthlyValues>(createEmptyMonthlyValues());
```

#### Change 3: Update detectScheduleType to detect variable patterns (Lines 57-114)

Update the detection logic to identify variable patterns (non-consecutive months with varying amounts):

```tsx
// After checking for recurring, before returning custom:
// If non-consecutive or varying amounts, it could be variable
return { type: 'variable' };
```

The function should be updated to return 'variable' instead of 'custom' when the pattern doesn't match one-time, recurring, or spread.

#### Change 4: Update useEffect to handle variable type (Lines 163-195)

When 'variable' is detected, populate variableValues state:

```tsx
} else if (detected.type === 'variable') {
  setVariableValues({ ...currentValues });
}
```

#### Change 5: Update calculateValues to handle 'variable' (Lines 197-252)

Add handling for variable type:

```tsx
} else if (scheduleType === 'variable') {
  MONTHS.forEach((month) => {
    if (!lockedMonths.has(month)) {
      values[month] = Math.round(variableValues[month] || 0);
    }
  });
}
```

#### Change 6: Update validation for 'variable' (Lines 268-308)

Add validation:

```tsx
} else if (scheduleType === 'variable') {
  return true; // Variable is always valid (can have all zeros when editing)
}
```

Add `variableValues` to the dependency array.

#### Change 7: Reorder radio options (Lines 437-461)

Change the order and rename to have:
1. One-time
2. Recurring monthly
3. Variable monthly (NEW - between recurring and spread)
4. Spread total evenly
5. Custom (edit per-month)

```tsx
<div className="flex items-center gap-2">
  <RadioGroupItem value="variable" id="variable" />
  <Label htmlFor="variable" className="cursor-pointer font-normal">
    Variable monthly
  </Label>
</div>
```

#### Change 8: Add Variable monthly input section (after Recurring, before Spread)

Insert the same stacked month input list as in AddLineItemDialog:

```tsx
{/* Schedule Fields - Variable */}
{scheduleType === 'variable' && (
  <div className="space-y-3 pl-4 border-l-2 border-muted">
    <p className="text-sm text-muted-foreground">
      Enter different amounts for each month. Locked months cannot be edited.
    </p>
    <div className="space-y-2">
      {MONTHS.map((m) => {
        const isLocked = lockedMonths.has(m);
        return (
          <div key={m} className="flex items-center gap-3">
            <Label htmlFor={`variable-${m}`} className="w-12 text-sm">
              {MONTH_LABELS[m]} {isLocked && '🔒'}
            </Label>
            <Input
              id={`variable-${m}`}
              type="number"
              min="0"
              className="flex-1"
              placeholder="0"
              value={variableValues[m] || ''}
              onChange={(e) =>
                setVariableValues((prev) => ({
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
```

## Visual Result

The Schedule Type section in both dialogs will show:

```
Schedule type *
○ One-time
○ Recurring monthly  
○ Variable monthly      ← NEW OPTION
○ Spread total evenly
○ Custom (edit per-month)  ← Only in EditLineItemDialog
```

When "Variable monthly" is selected, the UI will show:

```
┌─────────────────────────────────────────┐
│ Enter different amounts for each month. │
│ Locked months cannot be edited.         │
│                                         │
│ Feb [__________________]                │
│ Mar [__________________]                │
│ Apr [__________________]                │
│ May [__________________]                │
│ Jun [__________________]                │
│ Jul [__________________]                │
│ Aug [__________________]                │
│ Sep [__________________]                │
│ Oct [__________________]                │
│ Nov [__________________]                │
│ Dec [__________________]                │
│ Jan [__________________]                │
└─────────────────────────────────────────┘
```

## Technical Notes

- The "Variable monthly" option allows users to enter different amounts for each month in a clean stacked vertical list format
- Locked months display a 🔒 icon and have their input fields disabled
- The existing "Custom (edit per-month)" option in EditLineItemDialog will remain as a fallback but uses a 3-column grid layout; the new "Variable monthly" uses a single-column stacked layout for easier data entry
- For AddLineItemDialog, validation requires at least one month to have an amount > 0
- For EditLineItemDialog, variable is always valid (allows all zeros when editing existing items)

