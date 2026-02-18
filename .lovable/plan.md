

## Fix: Forecast Page Overwrites Resolver's Deletion

### Problem
After Finance approves a deletion request, the resolver correctly removes the line item from the database, but the Forecast page immediately overwrites it back because:

1. The resolver (in `RequestsContext`) removes the line item from `fy_forecasts` in the database
2. The Forecast page's sync `useEffect` (line 196) runs when `requests` changes, but it only handles `approvalRequestId` and `adjustmentRequestId` -- it never checks `deletionRequestId`
3. The persist `useEffect` (line 190) then writes the unchanged local `costCenters` state (still containing the deleted item) back to the database, overwriting the resolver's work

### Root Cause
The sync effect in `Forecast.tsx` (lines 196-306) is missing logic to handle the `deletionRequestId` case. When a deletion request reaches "approved" status, the sync effect should remove items whose linked deletion request is fully approved.

### Solution
Add deletion handling to the sync `useEffect` in `Forecast.tsx`. This is the most reliable fix because:
- The sync effect already handles the other two cases (new item approval, adjustment approval)
- It runs when `requests` changes, which happens when the approval status updates
- It directly modifies the local `costCenters` state, which then persists correctly

This also makes the `forecastRowActionResolver.ts` deletion logic redundant for the Forecast page (the resolver is still useful as a fallback for when the user is NOT on the Forecast page).

### Changes

#### 1. `src/pages/Forecast.tsx` -- Add deletion handling to sync effect (around line 283)

Inside the existing loop that iterates line items in the sync `useEffect`, add a check for `deletionRequestId`:

```
// Handle DELETION approval (deletionRequestId)
if (item.deletionRequestId) {
  const linkedRequest = requests.find((r) => r.id === item.deletionRequestId);
  if (linkedRequest) {
    const isApproved =
      linkedRequest.status === 'approved' ||
      (linkedRequest.approvalSteps?.length > 0 &&
       linkedRequest.approvalSteps.every((step) => step.status === 'approved'));

    if (isApproved) {
      // Deletion approved - remove line item
      changed = true;
      continue; // Skip adding to updatedItems
    }

    const isRejected =
      linkedRequest.status === 'rejected' ||
      linkedRequest.status === 'cancelled' ||
      linkedRequest.approvalSteps?.some((step) => step.status === 'rejected');

    if (isRejected) {
      // Deletion rejected - clear deletion flags, keep item
      changed = true;
      updatedItems.push({
        ...item,
        deletionStatus: undefined,
        deletionRequestId: undefined,
      });
      continue;
    }
  }
}
```

This mirrors the existing pattern used for `approvalRequestId` and `adjustmentRequestId`.

#### 2. Data Cleanup: Clear orphaned IDC data

Run a SQL update to remove the IDC line item from the `fy_forecasts` table since its deletion was already approved (request `abeec58d-55ff-4270-a9f2-15e46af514cd` has status "approved"):

```sql
UPDATE fy_forecasts
SET data = (
  SELECT jsonb_agg(
    CASE
      WHEN cc->>'id' = '7b31d57c-aff4-4ad9-84af-f5a36e546741'
      THEN jsonb_set(cc, '{lineItems}', (
        SELECT jsonb_agg(li)
        FROM jsonb_array_elements(cc->'lineItems') li
        WHERE li->>'id' != '7a8fd945-3ed3-4da0-a7e2-36e086e161fd'
      ))
      ELSE cc
    END
  )
  FROM jsonb_array_elements(data) cc
)
WHERE fiscal_year_id = 'aa8ac05a-f1f6-4518-9614-40094e284217';
```

### Risk
- Low: adds one more condition to an existing pattern in the sync effect
- The resolver in `forecastRowActionResolver.ts` remains as a fallback for when the Forecast page is not open
- Data cleanup only removes one already-approved-for-deletion line item
