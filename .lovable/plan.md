

## Fix: Prevent Persist Effect from Overwriting DB with Stale Cache Data

### Problem (the real root cause this time)

There are two interacting bugs:

1. **Persist effect race condition**: The persist effect (line 196-201) fires on every `costCenters` state change, including when loading from stale cache. This means: cache loads IDC -> sets costCenters -> persist effect writes IDC back to DB -> DB cleanup is overwritten.

2. **Lost deletion flags**: The IDC line item no longer has `deletionRequestId` or `deletionStatus` set on it (they were stripped in previous cleanup cycles). So the sync effect (line 249) can never match it against a request and remove it.

### Solution

**Add an `initialLoadDone` ref** that prevents the persist effect from firing until the async database load has completed. This ensures the persist effect only saves intentional user edits, not stale cache data.

### Changes

**`src/pages/Forecast.tsx`**

1. Add a ref to track whether initial load is complete:
```typescript
const initialLoadDoneRef = useRef(false);
```

2. Update the initial load effect to set the flag AFTER data is loaded:
```typescript
useEffect(() => {
  if (isActiveFY && fyId) {
    initialLoadDoneRef.current = false; // Reset on FY change
    
    const cached = loadForecastForFY(fyId);
    if (cached) {
      setCostCenters(cached);
      initialLoadDoneRef.current = true;
      return;
    }
    
    loadForecastForFYAsync(fyId).then((forecast) => {
      if (forecast) {
        setCostCenters(forecast);
      } else if (selectedFiscalYear) {
        const newForecast = createForecastCostCentersFromBudget(selectedFiscalYear);
        saveForecastForFY(fyId, newForecast);
        setCostCenters(newForecast);
      }
      initialLoadDoneRef.current = true;
    });
  } else {
    setCostCenters([]);
    initialLoadDoneRef.current = false;
  }
}, [isActiveFY, fyId, selectedFiscalYear]);
```

3. Guard the persist effect with the flag:
```typescript
useEffect(() => {
  if (isActiveFY && fyId && costCenters.length > 0 && initialLoadDoneRef.current) {
    saveForecastForFY(fyId, costCenters);
  }
}, [costCenters, isActiveFY, fyId]);
```

4. Also set the flag after the sync effect updates state (since it calls `setCostCenters` which triggers the persist effect -- that's fine because the sync effect runs AFTER load):
```typescript
// No change needed here -- the sync effect runs after the load effect,
// and initialLoadDoneRef is already true by then.
```

**Data cleanup (SQL)**: Remove IDC from the database one final time. This time it will stick because the persist effect is guarded.

### Why previous fixes failed

| Attempt | What it did | Why it failed |
|---------|------------|---------------|
| Made resolver async | Resolver now correctly deletes from DB | Persist effect writes stale local state back |
| Added deletionRequestId sync logic | Sync effect checks for deletion flags | IDC has no deletion flags (stripped earlier) |
| Made initial load async | Avoids recreating from budget | Cache still has IDC; persist effect writes it back |
| SQL cleanups (4x) | Removed IDC from DB directly | Persist effect immediately overwrites from in-memory state |

This fix addresses the actual root cause: the persist effect must not fire until the component has loaded authoritative data from the database.
