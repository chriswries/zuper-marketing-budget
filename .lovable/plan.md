

# Admin Line Item Name Editing

## Overview

Add the ability for admin users to edit line item names on both Budget and Forecast pages. This is an admin-only feature for fixing typos, standardizing naming conventions, or correcting errors without requiring a full delete-and-recreate workflow.

## UX Design

### Option A: Inline Icon Button (Recommended)
- Add a small pencil/edit icon next to the line item name (similar to the existing "Edit tags" button)
- Icon appears on row hover, only for admin users
- Clicking opens a small modal dialog for name editing
- Consistent with the existing "Edit tags" pattern users are already familiar with

### Option B: Double-click Inline Edit
- Double-clicking the line item name converts it to an input field
- Similar to how spreadsheet cells work (like `EditableCell`)
- More direct but less discoverable

### Recommendation
**Option A (Modal dialog)** is recommended because:
1. Consistent with existing patterns (Edit tags uses the same approach)
2. Provides space for validation feedback and error messages
3. Clearer admin-specific action (icon can include tooltip "Admin: Rename")
4. Avoids accidental edits from misclicks
5. Can show cost center context in the dialog header

### Modal Design
```text
+----------------------------------------+
|  Rename Line Item                  [X] |
|----------------------------------------|
|  Content & Creative > Google Ads Q3    |
|                                        |
|  New name *                            |
|  [________________________]            |
|  [Error: Name already exists in ...]   |
|                                        |
|           [Cancel]  [Save]             |
+----------------------------------------+
```

**Fields:**
- Title: "Rename Line Item"
- Subtitle: Shows cost center → current line item name
- Input: Pre-populated with current name
- Validation: Real-time duplicate check with helpful error message
- Buttons: Cancel / Save

### Visual Indicator
- Use `Pencil` icon from lucide-react
- Show on hover with `opacity-0 group-hover:opacity-100` transition
- Position: Immediately after line item name, before the Edit tags button
- Tooltip: "Admin: Rename line item"

## Technical Implementation

### New Component: `EditLineItemNameDialog`

**File:** `src/components/sheet/EditLineItemNameDialog.tsx`

**Props Interface:**
```typescript
export interface EditLineItemNameData {
  costCenterId: string;
  costCenterName: string;
  lineItem: LineItem;
}

interface EditLineItemNameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: EditLineItemNameData | null;
  onSave: (costCenterId: string, lineItemId: string, newName: string) => void;
  checkDuplicateName: (name: string, excludeLineItemId: string) => DuplicateLineItemResult;
}
```

**Features:**
- Pre-populate input with current name
- Real-time duplicate validation using `findDuplicateLineItemName`
- Disable Save button if name is empty or duplicate
- Show clear error message if duplicate found
- Auto-focus input on open

### SheetTable Changes

**File:** `src/components/sheet/SheetTable.tsx`

**New Props:**
```typescript
export interface EditLineItemNameArgs {
  costCenterId: string;
  costCenterName: string;
  lineItem: LineItem;
}

interface SheetTableProps {
  // ... existing props
  onEditLineItemName?: (args: EditLineItemNameArgs) => void;
  canEditLineItemName?: boolean;  // true only for admins
}
```

**UI Changes:**
- Add Pencil icon button next to line item name (before Tags button)
- Conditionally render based on `canEditLineItemName` prop
- Show on hover with tooltip "Admin: Rename line item"

### Budget Page Changes

**File:** `src/pages/Budget.tsx`

**State Additions:**
```typescript
const [editNameOpen, setEditNameOpen] = useState(false);
const [editNameData, setEditNameData] = useState<EditLineItemNameData | null>(null);
```

**New Handlers:**
```typescript
const handleEditLineItemName = useCallback((args: EditLineItemNameArgs) => {
  setEditNameData({
    costCenterId: args.costCenterId,
    costCenterName: args.costCenterName,
    lineItem: args.lineItem,
  });
  setEditNameOpen(true);
}, []);

const handleSaveLineItemName = useCallback((
  costCenterId: string, 
  lineItemId: string, 
  newName: string
) => {
  if (!selectedFiscalYear || !selectedFiscalYearId) return;
  
  updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
    ...fy,
    updatedAt: new Date().toISOString(),
    costCenters: fy.costCenters.map((cc) => {
      if (cc.id !== costCenterId) return cc;
      return {
        ...cc,
        lineItems: cc.lineItems.map((item) =>
          item.id === lineItemId ? { ...item, name: newName.trim() } : item
        ),
      };
    }),
  }));
  
  setEditNameOpen(false);
  toast({
    title: 'Line item renamed',
    description: `Updated to "${newName.trim()}"`,
  });
}, [selectedFiscalYear, selectedFiscalYearId, updateFiscalYearBudget]);
```

**Props to SheetTable:**
```typescript
<SheetTable
  // ... existing props
  onEditLineItemName={isAdmin ? handleEditLineItemName : undefined}
  canEditLineItemName={isAdmin && selectedFiscalYear.status !== 'closed' && selectedFiscalYear.status !== 'archived'}
/>
```

### Forecast Page Changes

**File:** `src/pages/Forecast.tsx`

Same pattern as Budget, but persists via the forecast mechanism:

```typescript
const handleSaveLineItemName = useCallback((
  costCenterId: string, 
  lineItemId: string, 
  newName: string
) => {
  setCostCenters((prev) =>
    prev.map((cc) => {
      if (cc.id !== costCenterId) return cc;
      return {
        ...cc,
        lineItems: cc.lineItems.map((item) =>
          item.id === lineItemId ? { ...item, name: newName.trim() } : item
        ),
      };
    })
  );
  
  setEditNameOpen(false);
  toast({
    title: 'Line item renamed',
    description: `Updated to "${newName.trim()}"`,
  });
}, []);
```

## Validation Requirements

1. **Non-empty**: Name must have at least one non-whitespace character
2. **Unique**: Name must not duplicate any other line item (case-insensitive, whitespace-normalized) across all cost centers
3. **Trimmed**: Leading/trailing whitespace is stripped before saving

Use existing `findDuplicateLineItemName` utility with `excludeLineItemId` parameter to skip the current line item during duplicate checking.

## Edge Cases

| Scenario | Behavior |
|----------|----------|
| Archived/Closed FY | Button disabled/hidden |
| Non-admin user | Button not rendered |
| Line item has pending request | Allow rename (metadata only) |
| Duplicate name entered | Show error, disable Save |
| Empty name | Disable Save button |
| Same name (no change) | Allow save (no-op) |

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/sheet/EditLineItemNameDialog.tsx` | Create new |
| `src/components/sheet/SheetTable.tsx` | Add props, render Pencil icon |
| `src/pages/Budget.tsx` | Add state, handlers, render dialog |
| `src/pages/Forecast.tsx` | Add state, handlers, render dialog |

## Persistence

- **Budget**: Updates via `updateFiscalYearBudget()` → `fiscal_years` table in database
- **Forecast**: Updates via `setCostCenters()` which triggers `saveForecastForFY()` → `fy_forecasts` table in database

Both persist immediately and survive page refresh and logout/login.

## Acceptance Criteria

1. Admin user sees pencil icon next to line item names on hover
2. Non-admin users do not see the pencil icon
3. Clicking pencil opens rename dialog with current name pre-populated
4. Duplicate name shows clear error message with conflicting cost center
5. Empty name disables Save button
6. Successful rename updates the table immediately
7. Changes persist after page refresh
8. Changes persist after logout/login
9. Renaming works on line items with pending approval requests
10. Button is disabled/hidden for archived/closed fiscal years

