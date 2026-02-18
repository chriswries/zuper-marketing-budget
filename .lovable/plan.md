

## Fix: Forecast Initial Load Overwrites Deletions by Recreating from Budget

### Problem
The deletion resolver works correctly and removes the line item from the database. But when the user navigates back to `/forecast`, the component's initial load effect (line 172-187) uses `loadForecastForFY(fyId)` — a synchronous, cache-only function. Since the cache was invalidated by the realtime subscription, it returns `null`. The code then incorrectly assumes no forecast exists and recreates one from the budget data, which still contains the deleted line item.

### Root Cause
Line 174: `const fyForecast = loadForecastForFY(fyId)` is synchronous and cache-only. If the cache is empty, it returns `null` and the code falls into the "initialize from budget" branch (line 177-181), overwriting the actual forecast in the database.

### Solution
Change the initial load effect to use the async `loadForecastForFYAsync(fyId)` instead. This reads from the database when the cache is empty, ensuring the component always gets the actual persisted forecast data.

### Changes

**`src/pages/Forecast.tsx` (lines 171-187)** -- Make the FY load effect async:

```typescript
// Reload cost centers when FY changes
useEffect(() => {
  if (isActiveFY && fyId) {
    // Try cache first for instant display
    const cached = loadForecastForFY(fyId);
    if (cached) {
      setCostCenters(cached);
      return;
    }
    // Cache miss — load from database
    loadForecastForFYAsync(fyId).then((forecast) => {
      if (forecast) {
        setCostCenters(forecast);
      } else if (selectedFiscalYear) {
        // Only initialize from budget if truly no forecast exists in DB
        const newForecast = createForecastCostCentersFromBudget(selectedFiscalYear);
        saveForecastForFY(fyId, newForecast);
        setCostCenters(newForecast);
      }
    });
  } else {
    setCostCenters([]);
  }
}, [isActiveFY, fyId, selectedFiscalYear]);
```

Also add `loadForecastForFYAsync` to the imports from `forecastStore`.

**Data Cleanup**: Remove the IDC line item from the database since its deletion was already approved (4 times).

### Why the sync effect fix alone was insufficient
The sync effect (line 196) correctly handles `deletionRequestId` and removes the item from local state. But by the time it runs, the initial load effect has already recreated the forecast from budget (without any `deletionRequestId` set), so there's nothing for the sync effect to match against.

