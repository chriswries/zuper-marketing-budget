

## Fix: Clear Orphaned "Approval Pending" Status from FY2026 Line Items

### Problem
Every line item in the FY2026 budget displays "approval pending" because each has `approvalStatus: "pending"` and an `approvalRequestId` stored in its data. However, the `spend_requests` table is completely empty -- no matching approval requests exist. This creates a broken state where:
- Line items show pending badges but no one can approve them
- Switching to Manager/CMO/Finance roles shows no actionable requests

### Root Cause
The line items were likely created with approval metadata (`approvalStatus`, `approvalRequestId`) but the corresponding spend request records were never persisted to the database (or were deleted/lost).

### Solution
Write a data cleanup operation that strips the orphaned approval fields (`approvalStatus` and `approvalRequestId`) from every line item in the FY2026 fiscal year JSONB data. This is a one-time data fix.

### Steps

1. **Run a SQL UPDATE** against the `fiscal_years` table to remove `approvalStatus` and `approvalRequestId` from every line item inside the `data->'costCenters'` JSONB structure for FY2026.

   The update will iterate through each cost center and each line item, removing the two orphaned keys while preserving all other line item data.

2. **No code changes needed** -- the UI already correctly reads these fields and will stop showing "approval pending" once the data is cleaned.

### Technical Details

The SQL will use `jsonb_set` with a subquery that rebuilds the `costCenters` array, stripping `approvalStatus` and `approvalRequestId` from each line item object. Specifically:

```sql
UPDATE fiscal_years
SET data = jsonb_set(
  data,
  '{costCenters}',
  (
    SELECT jsonb_agg(
      jsonb_set(
        cc,
        '{lineItems}',
        (
          SELECT jsonb_agg(li - 'approvalStatus' - 'approvalRequestId')
          FROM jsonb_array_elements(cc->'lineItems') li
        )
      )
    )
    FROM jsonb_array_elements(data->'costCenters') cc
  )
)
WHERE id = 'aa8ac05a-f1f6-4518-9614-40094e284217';
```

This removes only the two orphaned keys from each line item, leaving all other data (name, vendor, budgetValues, etc.) intact.

### Risk
- Low risk: only modifies two metadata fields on line items
- The fiscal year status remains "planning" so no locked data is affected
- No code changes required

