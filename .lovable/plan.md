

## Summary

Update the Edit Budget Settings dialog to:
1. Simplify the per-row computed display to show only the dollar amount (remove percentage)
2. Make the footer totals display percentages when the global mode is set to `%`

## Changes

### File: `src/components/budget/EditAllocationsDialog.tsx`

#### Change 1: Simplify per-row computed display (Line 338)

**Current:**
```tsx
<div className="text-sm text-muted-foreground w-32 text-right">
  {formatCurrency(row.computedAmount)} ({row.computedPercent.toFixed(1)}%)
</div>
```

**Updated:**
```tsx
<div className="text-sm text-muted-foreground w-32 text-right">
  {formatCurrency(row.computedAmount)}
</div>
```

This removes the percentage display from each cost center row, showing only the dollar amount (e.g., "$138,000" instead of "$138,000 (6.0%)").

#### Change 2: Make footer totals respect global mode (Lines 363-372)

**Current:**
```tsx
<div className="flex items-center justify-between text-sm">
  <span>Total Allocated:</span>
  <span className={isBalanced ? 'text-foreground' : 'text-destructive font-medium'}>
    {formatCurrency(totalAllocated)}
  </span>
</div>
<div className="flex items-center justify-between text-sm">
  <span>Target Budget:</span>
  <span>{formatCurrency(targetBudget)}</span>
</div>
```

**Updated:**
```tsx
<div className="flex items-center justify-between text-sm">
  <span>Total Allocated:</span>
  <span className={isBalanced ? 'text-foreground' : 'text-destructive font-medium'}>
    {globalMode === '%' 
      ? `${(targetBudget > 0 ? (totalAllocated / targetBudget) * 100 : 0).toFixed(1)}%`
      : formatCurrency(totalAllocated)}
  </span>
</div>
<div className="flex items-center justify-between text-sm">
  <span>Target Budget:</span>
  <span>{globalMode === '%' ? '100%' : formatCurrency(targetBudget)}</span>
</div>
```

When `globalMode === '%'`:
- **Total Allocated** shows the percentage of target budget allocated (e.g., "100.0%")
- **Target Budget** shows "100%" (since target is always 100% of itself)

When `globalMode === '$'`:
- Both values continue to show dollar amounts as before

#### Change 3: Update the over/under alert to match mode (Lines 374-384)

The alert message showing "Over by $X" or "Under by $X" should also respect the global mode:

**Current:**
```tsx
{difference > 0
  ? `Over by ${formatCurrency(difference)}`
  : `Under by ${formatCurrency(Math.abs(difference))}`}
. Allocations must equal the target budget (±$1).
```

**Updated:**
```tsx
{difference > 0
  ? `Over by ${globalMode === '%' 
      ? `${((difference / targetBudget) * 100).toFixed(1)}%` 
      : formatCurrency(difference)}`
  : `Under by ${globalMode === '%' 
      ? `${((Math.abs(difference) / targetBudget) * 100).toFixed(1)}%` 
      : formatCurrency(Math.abs(difference))}`}
. Allocations must equal the target budget {globalMode === '%' ? '(±0.1%)' : '(±$1)'}.
```

## Visual Result

**In $ mode:**
```
Cost Centers                        [$|%] [+ Add]
┌──────────────────────────────────────────────────┐
│ [↑↓] [Marketing        ] [$250000 ]    $250,000 │
│ [↑↓] [Sales            ] [$350000 ]    $350,000 │
└──────────────────────────────────────────────────┘

Total Allocated:                         $600,000
Target Budget:                           $600,000
```

**In % mode:**
```
Cost Centers                        [$|%] [+ Add]
┌──────────────────────────────────────────────────┐
│ [↑↓] [Marketing        ] [% 41.67 ]    $250,000 │
│ [↑↓] [Sales            ] [% 58.33 ]    $350,000 │
└──────────────────────────────────────────────────┘

Total Allocated:                            100.0%
Target Budget:                               100%
```

