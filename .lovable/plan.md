
# Fix Horizontal Scrolling with Locked First Column in Budget Table

## Problem

The Budget sheet table should allow horizontal scrolling through month columns while keeping the first column (Cost Center / Line Item) fixed in place. Currently, the table doesn't scroll horizontally because:

1. **Parent overflow conflict**: The `AppLayout` component has `overflow-x-hidden` on the main content area (line 20), which clips horizontal content before the table's scroll container can handle it
2. The table's scroll container has `overflow-x-auto` but can't scroll when the parent clips

## Current Implementation (Already Correct)

The `SheetTable.tsx` already has the correct sticky column setup:
- First column header: `sticky left-0 z-30` 
- First column cells: `sticky left-0 z-10`
- Shadow effect for visual separation: `shadow-[2px_0_4px_-1px_rgba(0,0,0,0.1)]`
- CSS responsive width: `sheet-first-col` class with `clamp(280px, 35vw, 640px)`

## Solution

Allow the table container to overflow horizontally within its own bounds while preventing page-level horizontal panning.

### File: `src/components/layout/AppLayout.tsx`

**Change:** Replace `overflow-x-hidden` with `overflow-x-clip` on the main element.

The difference:
- `overflow-x-hidden`: Clips content and prevents any overflow, including from child scroll containers
- `overflow-x-clip`: Clips content at the element's padding box but allows descendant elements with their own overflow handling to scroll

```tsx
// Before (line 20)
<main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6">

// After
<main className="flex-1 min-w-0 overflow-y-auto overflow-x-clip p-4 md:p-6">
```

## How It Works After Fix

1. User navigates to `/budget`
2. Table renders with all 12 month columns + vendor + FY total
3. When horizontal space is limited, user can:
   - Use trackpad two-finger horizontal swipe
   - Hold Shift + scroll wheel (already implemented)
   - Use the horizontal scrollbar
4. First column stays fixed on the left
5. Other columns scroll behind the first column's right edge
6. Shadow on first column provides visual separation

## Files to Modify

| File | Change |
|------|--------|
| `src/components/layout/AppLayout.tsx` | Change `overflow-x-hidden` to `overflow-x-clip` |

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Narrow viewport | Horizontal scroll activates, first column stays fixed |
| Wide viewport | No scroll needed, all columns visible |
| Mobile devices | Touch horizontal scroll works with fixed first column |
| Many line items | Both vertical and horizontal scroll work independently |

## Acceptance Criteria

1. Table horizontally scrolls when viewport is narrower than table width
2. First column (Cost Center / Line Item) stays fixed on left edge
3. Other columns disappear behind the first column as user scrolls right
4. Shadow on first column provides clear visual separation
5. Page-level horizontal scroll is still prevented (no accidental panning)
6. Vertical scrolling continues to work correctly
