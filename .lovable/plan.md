

## Fix: Empty `value` on `<SelectItem>` crashes import page

### Problem
In `src/pages/ActualsImport.tsx`, four `<SelectItem value="">None</SelectItem>` elements use an empty string as the value prop. Radix UI's Select component throws an error for empty-string values because it reserves `""` for "no selection" / placeholder display.

### Solution
Replace `value=""` with a sentinel string `"__none__"` (matching the pattern already used in `src/components/import/MappingStep.tsx`). Update the corresponding state checks so that `"__none__"` is treated as "no column selected."

### Changes

**`src/pages/ActualsImport.tsx`**:
1. Add a constant: `const NONE_VALUE = "__none__";`
2. Replace all 4 occurrences of `<SelectItem value="">None</SelectItem>` with `<SelectItem value={NONE_VALUE}>None</SelectItem>`
3. Update any state comparisons that check `=== ""` for those optional column fields to check `=== NONE_VALUE` or use `!== NONE_VALUE` before using the value

No other files need changes.

