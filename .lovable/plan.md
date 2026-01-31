
# Plan: Move Allocation Mode Control to List Level

## Current Behavior
Each cost center row has its own dropdown to toggle between `$` (dollar) and `%` (percentage) input modes. This creates visual clutter and requires users to change each row individually if they want to work in a different mode.

## Desired Behavior
A single global toggle at the top of the cost centers list that switches ALL cost centers between `$` and `%` modes simultaneously.

## Changes

### File: `src/components/budget/EditAllocationsDialog.tsx`

1. **Add global mode state**
   - Add a new state variable: `const [globalMode, setGlobalMode] = useState<'$' | '%'>('$');`
   - Remove the `mode` property from the `AllocationRow` interface (it will be derived from the global state)

2. **Update `AllocationRow` interface**
   - Remove `mode: '$' | '%'` field since mode is now global
   - Keep `value` which will be interpreted based on the global mode

3. **Update row initialization**
   - When dialog opens, initialize all rows with dollar values (current behavior)
   - When global mode changes, convert all row values at once

4. **Replace per-row mode selector with global control**
   - Move the `$` / `%` Select dropdown from inside each row to the header area next to "Cost Centers" label
   - Position it inline with the "Add" button

5. **Update `handleModeChange` to be global**
   - Rename to `handleGlobalModeChange`
   - When mode changes, convert ALL rows' values simultaneously:
     - `$` to `%`: `newValue = (dollarValue / targetBudget) * 100`
     - `%` to `$`: `newValue = (percentValue / 100) * targetBudget`

6. **Update `computedRows` logic**
   - Use the global `globalMode` instead of per-row `row.mode` to compute amounts

7. **Update row rendering**
   - Remove the per-row Select dropdown
   - The value input remains but is interpreted based on globalMode
   - Add a subtle indicator showing the current mode (e.g., prefix the input with `$` or `%` symbol)

## UI Layout After Change

```text
Target Budget (USD)
[ $1,000,000 ]

Cost Centers                        [$|%] [+ Add]
┌──────────────────────────────────────────────────┐
│ [↑↓] [Marketing        ] [   250000 ] $250k 25% │
│ [↑↓] [Sales            ] [   350000 ] $350k 35% │
│ [↑↓] [Engineering      ] [   400000 ] $400k 40% │
└──────────────────────────────────────────────────┘
```

The mode toggle appears once at the list header level, affecting how all values are entered and displayed.

## Technical Details

- The computed display on the right side of each row will continue to show both the dollar amount and percentage for clarity
- When adding a new cost center, its initial value will be `0` (interpreted in the current global mode)
- Value conversion uses the same rounding logic currently in place
- Auto-select on focus behavior for inputs is preserved
