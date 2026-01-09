/**
 * Utility functions for validating cost center names.
 * Ensures uniqueness (case-insensitive, trimmed) and non-empty names.
 */

/**
 * Normalize a cost center name for comparison:
 * - Trim whitespace
 * - Collapse internal whitespace
 * - Convert to lowercase
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Get a set of normalized names that appear more than once.
 */
export function getDuplicateNameSet(names: string[]): Set<string> {
  const normalized = names.map(normalizeName);
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const name of normalized) {
    if (name && seen.has(name)) {
      duplicates.add(name);
    }
    seen.add(name);
  }

  return duplicates;
}

export interface CostCenterValidationResult {
  errorsById: Record<string, string>;
  isValid: boolean;
}

/**
 * Validate an array of cost center rows for unique, non-empty names.
 * Returns errors by ID and overall validity.
 */
export function validateCostCenterNames(
  rows: Array<{ id: string; name: string }>
): CostCenterValidationResult {
  const errorsById: Record<string, string> = {};
  
  // Find duplicates
  const names = rows.map(r => r.name);
  const duplicates = getDuplicateNameSet(names);

  for (const row of rows) {
    const trimmed = row.name.trim();
    
    if (!trimmed) {
      errorsById[row.id] = 'Cost center name is required.';
    } else if (duplicates.has(normalizeName(row.name))) {
      errorsById[row.id] = 'Cost center name must be unique.';
    }
  }

  return {
    errorsById,
    isValid: Object.keys(errorsById).length === 0,
  };
}
