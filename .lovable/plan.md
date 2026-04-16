
## Root cause

When users add a new line item from the Forecast page (e.g., "UGC – Noe Madrigal", "Rachel Anderson"):

1. ✅ A `spend_request` is correctly created (visible in /requests as "approved")
2. ✅ The line item appears in local React state on the creator's screen
3. ❌ **The line item is NEVER inserted into the `line_items` database table**
4. ❌ Its `monthly_values` upsert silently fails (foreign key violation against the missing `line_items` row)

I confirmed this in the database:
- Spend requests `73376789…` (UGC) and `a7fbff8e…` (Rachel) exist with `status: approved` and reference `origin_line_item_id` UUIDs
- Querying `line_items` for those UUIDs returns 0 rows
- Querying `monthly_values` for those UUIDs returns 0 rows

The bug is in `src/lib/forecastStore.ts → saveForecastForFY`. It only:
- Diffs and upserts `monthly_values` rows
- Deletes removed `line_items`
- **Never INSERTs new `line_items` rows that exist in current state but not in old cache**

The Budget page works because it uses `FiscalYearBudgetContext.persistCostCentersAndLineItems`, which correctly inserts new line items. The Forecast store was never updated to do the same.

## The fix

Update `src/lib/forecastStore.ts → saveForecastForFY` to detect new line items (in current state but not in old cache) and insert them into the `line_items` table **before** upserting their `monthly_values`. Also persist edits (name, vendor, owner, flags, contract fields, status fields) for existing line items so non-monetary edits aren't lost.

### Steps

1. **Detect new line items** — for each `li` in current `costCenters`, if `li.id` is not in `oldLIIds`, queue an INSERT into `line_items` with all required columns (`id`, `cost_center_id`, `fiscal_year_id`, `name`, `vendor_name`, `vendor_id`, `owner_id`, `is_contracted`, `is_accrual`, `is_software_subscription`, contract fields, `approval_status`, `approval_request_id`, `adjustment_*`, `deletion_*`, `cancellation_*`).

2. **Detect existing line items that changed metadata** — diff name/vendor/owner/flags/status fields and queue UPDATEs.

3. **Order operations correctly:**
   - INSERT new line items first (await)
   - Then UPSERT monthly_values (the FK now resolves)
   - Then UPDATE changed metadata
   - Then DELETE removed line items
   - Surface errors instead of swallowing them silently — log to console with detail and don't update cache if the insert fails (so retry works)

4. **One-time backfill for the two orphaned approved requests** — write a migration or use the existing relational tables to insert the two missing `line_items` rows (UGC – Noe Madrigal under cost center `5600 Partner Marketing`, Rachel Anderson under `5800 Public Relations`) and their corresponding `monthly_values` so the user's existing approved data appears immediately. The amounts come from the spend_requests (`$10,800` and `$45,000`) and original months — but since per-month allocation isn't preserved on the request, I'll need to ask which months the user wants those amounts in (or distribute them sensibly).

## Question

For the two already-approved requests that were lost (UGC – Noe Madrigal $10,800; Rachel Anderson $45,000), do you want me to:

- **(a)** Backfill them automatically by putting the full amount in the `start_month` from the request (UGC: Mar = $10,800; Rachel: Feb = $45,000)
- **(b)** Spread them evenly across the request's date range (UGC: Mar only; Rachel: Feb–Jan = $3,750/month)
- **(c)** Leave them out — user will re-create them in Forecast once the bug is fixed

I'll proceed with the code fix regardless; this only affects the recovery of the two already-lost items.

## Files to change

- `src/lib/forecastStore.ts` — add INSERT for new line items + UPDATE for changed metadata in `saveForecastForFY`
- (Optional) one SQL migration to backfill the two orphaned line items, depending on your answer above

## Acceptance criteria

- Creating a new line item in Forecast persists to `line_items` and `monthly_values` tables
- After page refresh, the new line item appears in /forecast
- Existing approved requests' line items appear once backfilled
- No silent failures — errors surface to the user via toast
