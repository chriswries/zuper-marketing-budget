

# Fix Vertical Scrolling in Edit Budget Settings Dialog (Take 2)

## Root Cause Analysis

Looking at the screenshot, the dialog shows 4 cost centers but there are 10 total (each at 10% = $230,000). The ScrollArea is not scrolling because:

1. **Missing overflow-y on Viewport**: The Radix UI `ScrollAreaPrimitive.Viewport` needs `overflow-y: auto` or `overflow-y: scroll` to enable scrolling
2. **Height inheritance issue**: The Viewport needs to inherit the max-height constraint properly

The previous fix added `[&>div]:!block` which addresses display issues, but didn't add the actual overflow scrolling behavior.

## Solution

### File: `src/components/ui/scroll-area.tsx`

Add `overflow-y-scroll` to the Viewport element. This is the proper fix that ensures scrolling works in all ScrollArea usages.

**Current (line 11):**
```tsx
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] [&>div]:!block">
```

**Change to:**
```tsx
<ScrollAreaPrimitive.Viewport className="h-full w-full rounded-[inherit] overflow-y-scroll [&>div]:!block">
```

### Why This Works

- `overflow-y-scroll`: Forces the viewport to be scrollable when content exceeds height
- The Radix ScrollArea will then detect this and show its styled scrollbar
- This is consistent with Radix UI's expected behavior for ScrollArea

## Alternative Approach (if above doesn't work)

If the Radix-level fix doesn't work due to how the primitive handles overflow, we can bypass ScrollArea entirely in this specific dialog and use native scrolling:

### File: `src/components/budget/EditAllocationsDialog.tsx`

Replace ScrollArea with a native scrollable div:

**Current (lines 269-270):**
```tsx
<ScrollArea className="max-h-[300px] border rounded-md">
  <div className="p-4 space-y-3">
```

**Change to:**
```tsx
<div className="max-h-[300px] overflow-y-auto border rounded-md">
  <div className="p-4 space-y-3">
```

And update the closing tag accordingly.

## Recommended Approach

Try **both fixes**:
1. First update `scroll-area.tsx` with `overflow-y-scroll` (benefits all ScrollArea usages)
2. If that still fails, fall back to native scrolling in the dialog itself

## Files to Modify

| File | Change |
|------|--------|
| `src/components/ui/scroll-area.tsx` | Add `overflow-y-scroll` to Viewport |
| `src/components/budget/EditAllocationsDialog.tsx` | Fallback: replace ScrollArea with native `overflow-y-auto` div if needed |

## Acceptance Criteria

1. Cost centers list scrolls when more than ~4-5 items are visible
2. Scrollbar appears on the right side
3. User can scroll to see and edit all 10 cost centers
4. Other ScrollArea usages in the app continue to work

