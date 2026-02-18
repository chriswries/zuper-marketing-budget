

## Fix: Spend Requests Failing to Save Due to Missing `requesterId`

### Problem
When a manager deletes a line item in /forecast, the "Deletion pending" tag appears but no approval request shows on /requests. The database logs reveal:

```
new row for relation "spend_requests" violates check constraint "check_spend_request_has_requester"
```

A CHECK constraint on the `spend_requests` table requires the JSONB `data` column to contain a `requesterId` key, but this field is never populated anywhere in the codebase. This means **every spend request INSERT has been silently failing** -- not just deletions, but also new line item requests, adjustment requests, and cancellation requests.

The optimistic UI update makes it look like it worked, but the database rejects the row, the error is caught silently, and the optimistic state is reverted on page reload.

### Root Cause
A migration (`20260110004329`) added the constraint `CHECK (data ? 'requesterId')` to enforce that every spend request tracks who created it. However, the `SpendRequest` TypeScript type never included a `requesterId` field, so no code ever sets it.

### Solution
Add `requesterId` to the `SpendRequest` type and populate it with `auth.uid()` (the current user's ID) whenever a request is created. This fixes all request creation flows.

### Changes

#### 1. `src/types/requests.ts`
Add `requesterId` as an optional field to the `SpendRequest` interface:
```typescript
requesterId?: string;
```

#### 2. `src/contexts/AuthContext.tsx` (read only)
Need to check how to access the current user ID. The `useAuth()` hook likely provides `user.id`.

#### 3. `src/pages/Forecast.tsx`
Update all `addRequest()` calls (there are 3 locations: new line item creation, adjustment request creation, and row action submit) to include `requesterId` from the authenticated user's ID. Since Forecast.tsx already imports from AuthContext indirectly via other contexts, we need to add `useAuth` or pass the user ID through.

Specifically:
- **`handleCreateLineItem`** (line ~321): Add `requesterId: userId` to the new request object
- **Row action submit / handleRowActionSubmit`** (line ~783): Add `requesterId: userId` to the request object
- **Adjustment justification handler** (need to find): Add `requesterId: userId`

#### 4. `src/components/requests/CreateRequestDialog.tsx`
If this component also creates requests, add `requesterId` there too.

#### 5. Data Fix: Clean Up Orphaned Forecast Data
The IDC line item in the FY2026 forecast currently has `deletionStatus: "pending"` and `deletionRequestId` pointing to a non-existent request. Run a SQL update to clear these orphaned flags from the `fy_forecasts` table, similar to the previous budget cleanup.

### Technical Details

- The `requesterId` will be set to `supabase.auth.getUser()` result or from the AuthContext's `user.id`
- The field flows through `requestToRow()` automatically since it strips only `id`, `status`, `originFiscalYearId`, and `deletedAt` -- everything else (including `requesterId`) goes into the `data` JSONB column
- The CHECK constraint will then be satisfied and INSERTs will succeed
- The RLS UPDATE policy also references `data->>'requesterId'` for access control, so this fix also enables proper per-user update permissions

### Verification
After the fix:
1. As a simulated manager, delete a line item in /forecast
2. Confirm the deletion request appears on /requests
3. Confirm the request can be approved/rejected by CMO and Finance roles
