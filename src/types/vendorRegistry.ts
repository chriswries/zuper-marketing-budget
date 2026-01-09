/**
 * Types for Global Canonical Vendor Registry
 */

export interface CanonicalVendor {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface VendorAlias {
  id: string;
  aliasKey: string;
  aliasDisplay: string | null;
  canonicalVendorId: string;
  source: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
}

export interface VendorAliasWithVendor extends VendorAlias {
  canonicalVendor?: CanonicalVendor;
}

export interface VendorRegistryAuditAction {
  entityType: 'vendor_registry';
  action: 'vendor_created' | 'vendor_updated' | 'vendor_deactivated' | 'vendor_alias_created' | 'vendor_alias_updated' | 'vendor_alias_deactivated';
  entityId: string;
  meta: {
    vendorId?: string;
    vendorName?: string;
    aliasId?: string;
    aliasKey?: string;
    aliasDisplay?: string;
    previousName?: string;
    previousIsActive?: boolean;
  };
}
