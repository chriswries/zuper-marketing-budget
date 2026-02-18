

## Fix: Delete Line Item Approval Not Removing Item from Forecast

### Problem
After Finance approves a deletion request, the line item remains in `/forecast` with a "Deletion pending" tag instead of being removed.

### Root Cause
The `forecastRowActionResolver.ts` uses `loadForecastForFY()` which is a **synchronous** function that only returns data from an in-memory cache. When the resolver runs (triggered by a status change detected in `RequestsContext`), the forecast cache is often empty -- especially if the user navigated away from `/forecast` to `/requests` to perform the approval. When `loadForecastForFY()` returns `null`, the resolver silently fails with `"Forecast data not found"` and the line item is never removed.

The same issue affects `saveForecastForFY()` -- it updates the cache and writes to the database, but this is fine *if* we can load the data first.

### Solution
Convert the resolver functions to be **async** so they use `loadForecastForFYAsync()` (which reads from the database) instead of the synchronous cache-only `loadForecastForFY()`. This ensures the resolver always has access to the forecast data regardless of what page the user is on.

### Changes

#### 1. `src/lib/forecastRowActionResolver.ts`
- Change `loadForecastForRequest()` to be async, using `loadForecastForFYAsync()` instead of `loadForecastForFY()`
- Make all resolver functions async (`resolveCancelRequestApproved`, `resolveCancelRequestRejected`, `resolveDeleteLineItemApproved`, `resolveDeleteLineItemRejected`, `resolveForecastRowActionRequest`)
- Update return types to `Promise<ResolutionResult>` and `Promise<boolean>`

#### 2. `src/contexts/RequestsContext.tsx`
- Update the status transition `useEffect` to properly `await` the now-async `resolveForecastRowActionRequest()`
- Wrap the resolution loop in an async function since `useEffect` callbacks can't be async directly
- After successful resolution of a `delete_line_item` approval, invalidate the forecast cache so the `/forecast` page picks up the change on next render

### Technical Details

The key change in `forecastRowActionResolver.ts`:

```typescript
// BEFORE (synchronous, cache-only -- fails when cache is empty)
function loadForecastForRequest(request: SpendRequest): CostCenter[] | null {
  if (request.originFiscalYearId) {
    return loadForecastForFY(request.originFiscalYearId);
  }
  return null;
}

// AFTER (async, reads from database)
async function loadForecastForRequest(request: SpendRequest): Promise<CostCenter[] | null> {
  if (request.originFiscalYearId) {
    return loadForecastForFYAsync(request.originFiscalYearId);
  }
  return null;
}
```

In `RequestsContext.tsx`, the status transition effect becomes:

```typescript
useEffect(() => {
  const resolveTransitions = async () => {
    for (const request of requests) {
      const prevStatus = prevStatusesRef.current[request.id];
      if (prevStatus && prevStatus !== request.status) {
        await resolveForecastRowActionRequest(request, prevStatus, updateRequest);
      }
    }
  };
  resolveTransitions();

  // Update previous statuses
  const newStatuses: Record<string, RequestStatus> = {};
  for (const request of requests) {
    newStatuses[request.id] = request.status;
  }
  prevStatusesRef.current = newStatuses;
}, [requests]);
```

### Data Fix
The currently stuck "IDC" line item in the FY2026 forecast needs its orphaned `deletionStatus` and `deletionRequestId` cleared via a SQL update on the `fy_forecasts` table (same pattern as previous cleanups). Alternatively, once the code fix is deployed, re-approving or re-triggering the flow would also work.

### Risk
- Low: only changes the data loading mechanism from sync-cache to async-database
- All existing resolver logic (splice, revert, clear flags) remains unchanged
- The forecast page already handles cache invalidation via realtime subscriptions
