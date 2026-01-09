/**
 * Utility functions for validating line item names.
 * Ensures uniqueness across all cost centers (case-insensitive, trimmed).
 */

import type { CostCenter } from '@/types/budget';

/**
 * Normalize a line item name for comparison:
 * - Trim whitespace
 * - Collapse internal whitespace to single spaces
 * - Convert to lowercase
 */
export function normalizeLineItemName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface DuplicateLineItemResult {
  duplicate: boolean;
  existingCostCenterName?: string;
  existingLineItemName?: string;
}

/**
 * Check if a line item name already exists across all cost centers.
 * Returns duplicate info including which cost center has the conflicting name.
 */
export function findDuplicateLineItemName(args: {
  name: string;
  costCenters: CostCenter[];
  excludeLineItemId?: string;
}): DuplicateLineItemResult {
  const { name, costCenters, excludeLineItemId } = args;
  const normalizedName = normalizeLineItemName(name);

  // Empty or whitespace-only names should be handled separately
  if (!normalizedName) {
    return { duplicate: false };
  }

  for (const cc of costCenters) {
    for (const li of cc.lineItems) {
      // Skip the current line item if we're editing
      if (excludeLineItemId && li.id === excludeLineItemId) {
        continue;
      }

      const existingNormalized = normalizeLineItemName(li.name);
      if (existingNormalized === normalizedName) {
        return {
          duplicate: true,
          existingCostCenterName: cc.name,
          existingLineItemName: li.name,
        };
      }
    }
  }

  return { duplicate: false };
}
