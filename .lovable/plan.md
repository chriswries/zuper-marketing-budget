
# Plan: Fix First-Column Sticky Behavior in Chrome

## Problem Diagnosis

You confirmed:
- Browser: **Chrome**
- Vertical scroll (sticky header row) works correctly
- Horizontal scroll causes the **entire page to scroll**, not just the table content
- First column never sticks because the table's scroll container isn't the element being scrolled

**Root Cause**: The table uses `min-w-max w-max` sizing, which makes it as wide as its content. While the scroll wrapper has `overflow-x-auto`, the parent layout containers lack proper width constraints, causing the table's width to push the entire page layout wider. When you swipe horizontally on a trackpad, the browser scrolls the **page** (not the table's internal scroll container), so the sticky `left: 0` positioning has no effect.

The DOM hierarchy is:
```
SidebarProvider (flex, no overflow constraint) 
  -> SidebarInset (<main>, flex-col, no overflow constraint)
    -> AppLayout's <main> (overflow-x-clip, overflow-y-auto)
      -> Budget page content
        -> SheetTable scroll wrapper (overflow-x-auto, overflow-y-auto)
          -> Table (min-w-max w-max)
```

The `overflow-x-clip` on AppLayout's main should prevent page scroll, but `min-w-max` on the table can still push the flex containers wider before the clip takes effect.

## Solution

Add explicit width containment to the SheetTable scroll wrapper so it cannot grow beyond its parent, forcing all horizontal overflow to stay inside the wrapper (where `overflow-x-auto` creates the internal scrollbar).

### Changes to `src/components/sheet/SheetTable.tsx`

**Line ~405**: Update the scroll container's className to add `max-w-full` which ensures the container never grows beyond its parent's width, regardless of how wide the table content is:

```tsx
// Current:
className="relative min-w-0 w-full overflow-x-auto overflow-y-auto isolate rounded-md border bg-background max-h-[calc(100vh-220px)]"

// Change to:
className="relative min-w-0 w-full max-w-full overflow-x-auto overflow-y-auto isolate rounded-md border bg-background max-h-[calc(100vh-220px)]"
```

The `max-w-full` ensures the scroll container is capped at its parent's width, forcing any table overflow to be handled internally via `overflow-x-auto` rather than pushing the layout wider.

## Technical Details

The combination of:
- `min-w-0`: Allows the flex item to shrink below its content size
- `w-full`: Takes available width
- `max-w-full` (new): Prevents growing beyond parent width
- `overflow-x-auto`: Creates internal horizontal scroll when content overflows

This ensures the table's `min-w-max w-max` sizing is fully contained within the scroll wrapper, and horizontal trackpad swipes scroll the wrapper (not the page).

## Verification Steps

After the fix, on `/budget` and `/forecast`:

1. **Horizontal scroll inside table**: Two-finger trackpad swipe should scroll only the table content, with the first column staying fixed at `left: 0`
2. **First column sticky**: The "Cost Center / Line Item" column should remain visible while other columns scroll underneath it
3. **Vertical scroll still works**: Header row should remain sticky when scrolling vertically
4. **Row hover and EditableCell**: These should continue working as before
