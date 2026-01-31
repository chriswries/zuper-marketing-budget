

# Rebuild SheetTable Sticky Column and Horizontal Scroll

## Problem Summary

The current implementation has z-index layering issues that cause columns to "bleed through" the sticky first column during horizontal scroll:

| Element | Current Z-Index | Required Z-Index |
|---------|-----------------|------------------|
| Top-left header cell | `z-30` | `z-30` (correct) |
| Other header cells | `z-20` | `z-10` |
| First column body cells | `z-10` | `z-20` |

The header cells are currently at `z-20`, which is **equal to or above** the first column body cells at `z-10`. This means header cells can appear in front of the first column during scroll.

Additionally:
- The scroll container lacks `isolate` for proper stacking context
- Table uses `min-w-full` which can prevent horizontal overflow
- First column labels use `break-words` allowing wrapping instead of staying single-line

## Solution

### File: `src/components/sheet/SheetTable.tsx`

#### Change 1: Add `isolate` to scroll container (Line 405)

Add `isolate` to create a proper stacking context for z-index layering:

```tsx
// Before
className="relative min-w-0 w-full overflow-x-auto overflow-y-auto rounded-md border bg-background max-h-[calc(100vh-220px)]"

// After
className="relative min-w-0 w-full overflow-x-auto overflow-y-auto isolate rounded-md border bg-background max-h-[calc(100vh-220px)]"
```

#### Change 2: Fix table sizing (Line 422)

Remove `min-w-full` and keep `table-fixed` since column widths are explicitly defined:

```tsx
// Before
<Table className="w-max min-w-full table-fixed border-separate border-spacing-0">

// After
<Table className="min-w-max w-max table-fixed border-separate border-spacing-0">
```

#### Change 3: Fix header cell z-indexes (Lines 428, 432-434, 443, 447)

Change non-top-left header cells from `z-20` to `z-10`:

- Line 428: `z-20` to `z-10` (Vendor header)
- Line 434: `z-20` to `z-10` (Month headers)
- Line 443: `z-20` to `z-10` (FY Total header)
- Line 447: `z-20` to `z-10` (Action column header)

#### Change 4: Fix first column body z-indexes (Lines 473, 521, 1000)

Change first column body cells from `z-10` to `z-20`:

- Line 473: `z-10` to `z-20` (Cost center row first cell)
- Line 521: `z-10` to `z-20` (Line item row first cell)
- Line 1000: `z-10` to `z-20` (Grand total row first cell)

#### Change 5: First column labels - prevent wrapping (Lines 483, 525)

Replace `whitespace-normal break-words` with `whitespace-nowrap truncate`:

- Line 483: Cost center name span
- Line 525: Line item name span

This keeps labels single-line with ellipsis for overflow.

## Z-Index Layering After Fix

| Element | Z-Index | Background | Behavior |
|---------|---------|------------|----------|
| Top-left header (sticky top + left) | `z-30` | `bg-muted` | Stays above everything |
| Other header cells (sticky top) | `z-10` | `bg-muted` | Below first column during horizontal scroll |
| First column body cells (sticky left) | `z-20` | `bg-muted`/`bg-background`/`bg-accent` | Above scrolling columns, below top-left |
| Non-sticky body cells | none | row-based | Scroll under sticky elements |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/sheet/SheetTable.tsx` | 8 targeted line edits as described above |

## Summary of Line Changes

| Line | Element | Change |
|------|---------|--------|
| 405 | Scroll container | Add `isolate` |
| 422 | Table element | `min-w-full` to `min-w-max` |
| 428 | Vendor header | `z-20` to `z-10` |
| 434 | Month headers | `z-20` to `z-10` |
| 443 | FY Total header | `z-20` to `z-10` |
| 447 | Action header | `z-20` to `z-10` |
| 473 | Cost center first cell | `z-10` to `z-20` |
| 483 | Cost center name | `whitespace-normal break-words` to `whitespace-nowrap truncate` |
| 521 | Line item first cell | `z-10` to `z-20` |
| 525 | Line item name | `whitespace-normal break-words` to `whitespace-nowrap truncate` |
| 1000 | Grand total first cell | `z-10` to `z-20` |

## What This Does NOT Change

- Data fetching, schemas, or business logic
- Column order, labels, or features
- EditableCell behavior (already correctly uses local state)
- Row hover/striping (preserved)
- Non-sticky cell backgrounds (not adding unnecessary `bg-background`)

## Verification Checklist

1. Navigate to `/budget` and `/forecast`
2. Shrink browser window to force horizontal overflow
3. Scroll horizontally - columns must disappear UNDER the first column (no bleed-through)
4. Scroll vertically - header must stay sticky at top
5. Hover over rows - no flicker/ghosting under sticky column
6. Click into an editable cell, type 15+ characters - focus/cursor must remain stable
7. Test in dark mode - sticky backgrounds must remain opaque

