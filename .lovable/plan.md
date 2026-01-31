

# Edit Budget Settings Dialog Improvements

## Overview

Three UX improvements to the Edit Budget Settings dialog in `/budget`:

1. **Fix vertical scrolling** for cost centers list
2. **Auto-convert values** when switching between $ and % modes
3. **Auto-select input content** when clicking allocation cells

## Technical Analysis

### Issue 1: Vertical Scrolling

**Current State:**
- The `ScrollArea` component is present (line 248)
- It uses `flex-1` to fill available space
- However, the ScrollArea needs an explicit max-height to enable scrolling when content overflows

**Fix:**
- Add a `max-h-[300px]` (or similar) constraint to the ScrollArea to ensure scrolling activates when there are many cost centers
- This gives room for ~5-6 cost centers visible with scroll for more

### Issue 2: Auto-Convert Values on Mode Switch

**Current State:**
- When user switches from `$` to `%`, the raw value stays unchanged
- E.g., if value is `500000` ($500K), switching to % treats it as 500000% (obviously wrong)

**Fix:**
- In the `onValueChange` handler for mode, calculate the converted value:
  - `$ → %`: New value = `(currentDollarValue / targetBudget) * 100`
  - `% → $`: New value = `(currentPercentValue / 100) * targetBudget`
- Round appropriately for cleaner display (2 decimal places for %, whole numbers for $)

**Implementation:**
```typescript
const handleModeChange = (rowId: string, newMode: '$' | '%') => {
  setRows((prev) =>
    prev.map((r) => {
      if (r.id !== rowId) return r;
      
      let newValue: number;
      if (r.mode === '$' && newMode === '%') {
        // Convert $ to %
        newValue = targetBudget > 0 ? (r.value / targetBudget) * 100 : 0;
        newValue = Math.round(newValue * 100) / 100; // 2 decimal places
      } else if (r.mode === '%' && newMode === '$') {
        // Convert % to $
        newValue = Math.round((r.value / 100) * targetBudget);
      } else {
        newValue = r.value;
      }
      
      return { ...r, mode: newMode, value: newValue };
    })
  );
};
```

### Issue 3: Auto-Select on Focus

**Current State:**
- Clicking the value input places cursor at end of text
- User must manually select-all to replace value

**Fix:**
- Add `onFocus={(e) => e.target.select()}` to the value input
- This auto-selects all content when the field receives focus

## Files to Modify

| File | Change |
|------|--------|
| `src/components/budget/EditAllocationsDialog.tsx` | All three improvements |

## Detailed Changes

### 1. ScrollArea Height Constraint

Line 248: Add explicit max-height
```tsx
// Before
<ScrollArea className="flex-1 border rounded-md">

// After  
<ScrollArea className="flex-1 max-h-[300px] border rounded-md">
```

### 2. Mode Switch Handler

Replace inline `onValueChange` (line 291) with a dedicated handler that converts values:

```tsx
const handleModeChange = (rowId: string, newMode: '$' | '%') => {
  setRows((prev) =>
    prev.map((r) => {
      if (r.id !== rowId) return r;
      
      let newValue: number;
      if (r.mode === '$' && newMode === '%') {
        newValue = targetBudget > 0 
          ? Math.round((r.value / targetBudget) * 100 * 100) / 100 
          : 0;
      } else if (r.mode === '%' && newMode === '$') {
        newValue = Math.round((r.value / 100) * targetBudget);
      } else {
        newValue = r.value;
      }
      
      return { ...r, mode: newMode, value: newValue };
    })
  );
};
```

### 3. Auto-Select on Focus

Line 303-307: Add onFocus handler
```tsx
// Before
<Input
  type="number"
  value={row.value}
  onChange={(e) => updateRow(row.id, { value: Number(e.target.value) || 0 })}
  className="w-24"
/>

// After
<Input
  type="number"
  value={row.value}
  onChange={(e) => updateRow(row.id, { value: Number(e.target.value) || 0 })}
  onFocus={(e) => e.target.select()}
  className="w-24"
/>
```

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Target budget is $0 | Converting $ to % results in 0% |
| Very small percentages | Preserved to 2 decimal places |
| Switching back and forth | May have minor rounding differences (acceptable) |
| Empty value field | Converts to 0 in either mode |

## Acceptance Criteria

1. Cost centers list scrolls vertically when more than ~5-6 entries
2. Scrollbar appears when content overflows
3. Switching $ to % converts value correctly (e.g., $500K of $1M → 50%)
4. Switching % to $ converts value correctly (e.g., 25% of $1M → $250K)
5. Clicking allocation value input auto-selects all text
6. Auto-select works for both $ and % modes

