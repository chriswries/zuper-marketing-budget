
# Remove "Default" Sort Option and Default to "Name (A→Z)"

## Overview

Remove the "Default" sort option from both cost center and line item sort dropdowns, and change the default sort to "Name (A→Z)" on the Budget and Forecast pages.

## Impact Analysis

| Aspect | Assessment |
|--------|------------|
| Data Safety | No impact - this only changes display order |
| Scope | Single file change (`SheetTable.tsx`) |
| Pages Affected | Budget + Forecast (both use `SheetTable`) |
| Breaking Changes | None |
| Reversibility | Easily reversible |

## Technical Changes

### File: `src/components/sheet/SheetTable.tsx`

#### 1. Update State Initialization (line 145-146)

```typescript
// Before
const [costCenterSort, setCostCenterSort] = useState<'default' | 'name' | 'fy-high' | 'fy-low'>('default');
const [lineItemSort, setLineItemSort] = useState<'default' | 'name' | 'fy-high' | 'fy-low'>('default');

// After
const [costCenterSort, setCostCenterSort] = useState<'name' | 'fy-high' | 'fy-low'>('name');
const [lineItemSort, setLineItemSort] = useState<'name' | 'fy-high' | 'fy-low'>('name');
```

#### 2. Remove "Default" from Cost Center Dropdown (lines 378-383)

```typescript
// Before
<SelectContent>
  <SelectItem value="default">Default</SelectItem>
  <SelectItem value="name">Name (A→Z)</SelectItem>
  <SelectItem value="fy-high">FY Total (High→Low)</SelectItem>
  <SelectItem value="fy-low">FY Total (Low→High)</SelectItem>
</SelectContent>

// After
<SelectContent>
  <SelectItem value="name">Name (A→Z)</SelectItem>
  <SelectItem value="fy-high">FY Total (High→Low)</SelectItem>
  <SelectItem value="fy-low">FY Total (Low→High)</SelectItem>
</SelectContent>
```

#### 3. Remove "Default" from Line Items Dropdown (lines 392-397)

Same pattern as above - remove the `<SelectItem value="default">Default</SelectItem>` line.

## Notes

- The sorting logic already handles the `name` case correctly (lines 239-240, 259-260)
- No other files need to be modified since sorting is fully encapsulated in `SheetTable`
- The Actuals and Variance Report pages use their own independent sorting (already defaults to alphabetical there)

## Acceptance Criteria

1. Budget page opens with cost centers sorted A→Z by name
2. Budget page opens with line items sorted A→Z by name  
3. Forecast page opens with cost centers sorted A→Z by name
4. Forecast page opens with line items sorted A→Z by name
5. "Default" option no longer appears in either dropdown
6. Sorting still works correctly when switching between options
