
## What’s actually happening (based on your latest details + code review)

You confirmed in Chrome:
- The **page** gets a horizontal scrollbar.
- Trackpad horizontal swipe scrolls the **page**, not the table container.
- Therefore the first column can’t “stick” relative to the expected scroll container, because the scroll is happening on the wrong element.

From inspecting `SheetTable.tsx`, the table is correctly placed inside a div with:
- `overflow-x-auto` (good)
- `min-w-0 w-full max-w-full` (good)

So the persistent issue is not inside the `SheetTable` scroll container anymore.

### Root cause
The **overall layout is still allowing horizontal overflow at the page level**.

A key red flag in the layout stack:
- `AppLayout`’s `<main>` has `min-w-0 overflow-x-clip` (good)
- But `SidebarInset` (from `src/components/ui/sidebar.tsx`) is a `flex-1` container **without `min-w-0`**, meaning in a flex layout it can still be forced wider than the viewport by wide descendants (like our `w-max` table). When that happens, the browser creates a **page-level horizontal overflow**, and trackpad horizontal gestures scroll the page instead of the intended inner div.

In flexbox, this is a classic issue: you often need `min-w-0` on the flex child that should be allowed to shrink; otherwise it can overflow and create page scrollbars even if inner children have overflow scrolling.

## The fix (minimal, layout-correct, and should make sticky work again)

### Change 1 — Make the main content flex child shrinkable
**File:** `src/components/ui/sidebar.tsx`  
**Component:** `SidebarInset`

Add `min-w-0` to the SidebarInset’s root class list:
- Current: `"relative flex min-h-svh flex-1 flex-col bg-background ..."`
- Updated: add `min-w-0` (and optionally `max-w-full` for extra containment)

This prevents the app’s content area (where the tables render) from expanding the entire page width.

### Change 2 — Hard-stop page-level horizontal overflow (scoped to the app wrapper)
If Change 1 alone doesn’t fully eliminate the page scrollbar (sometimes a fixed-position or border/shadow combo can still create a 1–2px overflow), we’ll add a safety belt:

**Option A (preferred):** Add `overflow-x-hidden` to the app wrapper in `SidebarProvider` (same file).
- The wrapper is currently:
  - `"group/sidebar-wrapper flex min-h-svh w-full ..."`
- Add `min-w-0 overflow-x-hidden` there as well.

This keeps all horizontal overflow contained inside intended scroll regions (like the SheetTable scroll div), and stops Chrome from ever scrolling the page horizontally.

**Why not rely on `overflow-x-clip` in `AppLayout`?**
Because that only applies to the `<main>` content column, not necessarily to the full page / root scrolling element. If the flex container that houses `<main>` is wider than viewport, the browser will still create a horizontal scrollbar at the document level.

## Why this will restore the expected behavior

Once the page no longer overflows horizontally:
- Trackpad horizontal swipes will scroll the **nearest horizontal scroll container under the pointer** (your SheetTable wrapper with `overflow-x-auto`)
- `position: sticky; left: 0` will then work correctly because the scroll is happening inside the table’s scroll context
- The first column will remain fixed while other columns scroll under it (with the existing z-index + opaque background setup you already have)

## Verification checklist (Chrome)

On `/budget` and `/forecast` after the change:
1. Confirm **no page-level horizontal scrollbar** appears (important).
2. Put cursor over the SheetTable and two-finger swipe left/right:
   - Only the table scrolls horizontally
   - First column stays pinned
3. Vertical scroll still works:
   - Header row remains sticky
4. Confirm no regressions:
   - Row hover still highlights correctly
   - EditableCell focus/cursor remains stable while horizontally scrolling

## Files we will edit
- `src/components/ui/sidebar.tsx`
  - Update `SidebarInset` classes to include `min-w-0` (and likely `max-w-full`)
  - If needed, update the SidebarProvider wrapper to include `overflow-x-hidden` (and `min-w-0`)

## Notes / constraints
- We will not change the SheetTable sticky architecture, z-index, or background rules unless the page-scrollbar issue is fully resolved and sticky still fails (unlikely once horizontal overflow is correctly contained).
- This change is safe for the rest of the app because it only affects how the main content area participates in flex sizing; it doesn’t remove any necessary scroll regions.

