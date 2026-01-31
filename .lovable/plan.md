

# Fix Vertical Scrolling in Edit Budget Settings Dialog

## Problem Diagnosis

The `ScrollArea` component is not scrolling because of two issues:

1. **Missing overflow style on Viewport**: The Radix UI `ScrollAreaPrimitive.Viewport` needs explicit `overflow-y-auto` (or `overflow-y-scroll`) to enable native scrolling behavior that the component enhances
2. **Flexbox layout conflict**: The parent container uses `flex-1` which competes with the `max-h-[300px]` constraint

## Solution

### Option A: Fix the ScrollArea Component (Recommended)

Update the `scroll-area.tsx` component to add proper overflow handling to the Viewport. This is the standard fix for Radix ScrollArea and will benefit all usages across the app.

**File:** `src/components/ui/scroll-area.tsx`

Change line 11 from:
```tsx
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit]">
```

To:
```tsx
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
```

The `[&>div]:!block` ensures the inner content div doesn't use `display: table` which can break height calculations.

### Option B: Simplify Layout in Dialog (Also Needed)

Remove the conflicting `flex-1` from the ScrollArea's parent container and rely solely on `max-h-[300px]` for height control.

**File:** `src/components/budget/EditAllocationsDialog.tsx`

**Change 1 - Line 260:** Remove `flex-1 overflow-hidden flex flex-col` from the parent div:
```tsx
// Before
<div className="space-y-2 flex-1 overflow-hidden flex flex-col">

// After  
<div className="space-y-2">
```

**Change 2 - Line 269:** Ensure ScrollArea has explicit height:
```tsx
// Before
<ScrollArea className="flex-1 max-h-[300px] border rounded-md">

// After
<ScrollArea className="max-h-[300px] border rounded-md">
```

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ui/scroll-area.tsx` | Add content block fix to Viewport |
| `src/components/budget/EditAllocationsDialog.tsx` | Simplify parent container layout |

## Why the Previous Fix Didn't Work

The `max-h-[300px]` was correctly added, but:
1. The Radix ScrollArea Viewport was rendering its content in a way that prevented proper overflow detection
2. The parent `flex-1` container was allowing the space to expand, so the ScrollArea never actually hit its max-height constraint in some viewport sizes

## Acceptance Criteria

1. Cost centers list shows scrollbar when more than ~5-6 items
2. User can scroll up/down through the full list
3. Scrollbar appears on the right side of the list
4. Other dialogs using ScrollArea continue to work correctly

