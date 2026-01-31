
## Diagnosis (based on code + your Safari result)

You confirmed:
- Browser: **Safari**
- **Sticky header works**
- Row hover works
- EditableCell is stable
- Horizontal scroll moves the **entire table**, meaning the “sticky left” cells are behaving like normal cells (not sticking).

In the current `SheetTable.tsx`, the first-column sticky cells (`<th>` and `<td>`) have `sticky left-0 …` but they also now have **`overflow-hidden` applied directly on the sticky cells** (from the last diff you pasted).

Safari has long-standing, inconsistent behavior where `position: sticky` on table cells (especially `left` sticky) can fail when the sticky element itself (or sometimes its table-related ancestors) has certain properties. One of the most common “silent killers” is **setting `overflow: hidden` on the sticky element**. In Chromium it usually still works; in Safari it often disables sticky positioning entirely or causes it to behave like `position: static`.

So the most likely root cause (given your exact symptoms and Safari) is:
- **`overflow-hidden` on the sticky first-column `<th>/<td>` is breaking Safari’s left-sticky behavior.**

The header being sticky still working is consistent with this: Safari often tolerates `top: 0` stickies better than `left: 0` stickies in tables, and the failure can be more sensitive for left-sticky.

## What I will change (minimal, targeted, keeps your bg/hover fixes)

### Goal
- Restore true left-sticky behavior in Safari
- Keep: opaque cell backgrounds + `group-hover` hover + correct z-index stacking + single scroll container + editable stability
- Keep the canonical structure already present:
  - single scroll wrapper: `overflow-x-auto isolate`
  - table sizing: `min-w-max w-max`
  - z-index: `z-30` top-left, `z-20` first col body, `z-10` other headers

### Change Set A — Remove `overflow-hidden` from the sticky `<th>/<td>` cells (Safari fix)
**File:** `src/components/sheet/SheetTable.tsx`

Remove `overflow-hidden` from:
- Top-left header cell (`TableHead` “Cost Center / Line Item”)
- Sticky first column body cells:
  - Cost center row first cell
  - Line item row first cell
  - Grand total first cell

This restores Safari’s ability to apply `position: sticky; left: 0` on those cells.

### Change Set B — Preserve truncation without using `overflow-hidden` on sticky cells
Still in `SheetTable.tsx`, ensure truncation happens on an inner wrapper instead of the `<td>/<th>`:

- Keep `whitespace-nowrap truncate` on the `<span>` as you already have.
- Add (if needed) `min-w-0` to the immediate flex child that contains the text (you already have `min-w-0` in some places).
- If truncation is still not reliable, add `overflow-hidden` to the **inner** container (e.g., the `<div className="flex-1 min-w-0">`), not the sticky `<td>` itself.

This keeps the cell sticky-compatible while still ensuring long names don’t expand the column.

### Change Set C — Verify no other “sticky killers” exist in the chain
From code review:
- Scroll container is correct: `min-w-0 w-full overflow-x-auto … isolate`
- AppLayout prevents page-level horizontal panning via `overflow-x-clip` but allows nested scrolling; that’s fine.
- The `Table` primitive does **not** wrap in any overflow container (good).
- Table uses `border-separate border-spacing-0` (good for sticky boundaries).

I will **not** refactor scroll containers or z-index unless I find a concrete second issue while implementing A/B.

## How we’ll verify (specifically for your desired behavior)

On `/budget` and `/forecast` after the change:

1) **Horizontal scroll inside the table wrapper**
- Shrink viewport so overflow exists
- Scroll horizontally
- Expected:
  - First column remains fixed
  - Vendor/month columns move left/right
  - As they pass under the first column they should be hidden behind it (with the correct z-index + opaque backgrounds)

2) **Sticky header still works**
- Scroll vertically inside the table container
- Header remains pinned

3) **Hover still works**
- Row hover visible across all cells via `group-hover:bg-muted` (opaque)

4) **EditableCell stability**
- Click a month cell, type 15+ characters
- Cursor/focus remains stable

## Files to change
1) `src/components/sheet/SheetTable.tsx`
- Remove `overflow-hidden` from the sticky first-column `<th>/<td>` cells (Safari compatibility)
- If needed, move truncation/clipping to inner wrappers instead of the sticky cell element

## Why this should fix it
Safari is the key detail. The last diff added `overflow-hidden` to sticky cells explicitly. That’s a very common reason for “sticky left doesn’t stick” in Safari tables. Removing it while keeping inner-content truncation is the minimal, most likely fix that preserves all your other constraints.

