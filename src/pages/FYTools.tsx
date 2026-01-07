import { useState, useMemo } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useCurrentUserRole } from "@/contexts/CurrentUserRoleContext";
import { useFiscalYearBudget } from "@/contexts/FiscalYearBudgetContext";
import { useRequests } from "@/contexts/RequestsContext";
import { buildFiscalYearBundleV1, validateFiscalYearBundle } from "@/lib/fyBundle";
import { downloadJson, sanitizeFilename } from "@/lib/downloadJson";
import { loadActuals } from "@/lib/actualsStore";
import { loadActualsMatching } from "@/lib/actualsMatchingStore";
import { loadForecastForFY } from "@/lib/forecastStore";
import { loadApprovalAudit } from "@/lib/approvalAuditStore";
import type { FiscalYearBundleV1, BundleValidationResult } from "@/types/fyBundle";
import { 
  Package, 
  Download, 
  FileCheck, 
  AlertCircle, 
  CheckCircle2,
  Database,
  FileText,
  Receipt,
  Link,
  ClipboardList,
  History
} from "lucide-react";
import { format } from "date-fns";

export default function FYTools() {
  const { currentRole } = useCurrentUserRole();
  const { fiscalYears } = useFiscalYearBudget();
  const { requests } = useRequests();

  const [selectedFYId, setSelectedFYId] = useState<string>("");
  const [bundle, setBundle] = useState<FiscalYearBundleV1 | null>(null);
  const [validation, setValidation] = useState<BundleValidationResult | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  const selectedFY = useMemo(() => 
    fiscalYears.find(fy => fy.id === selectedFYId) ?? null
  , [fiscalYears, selectedFYId]);

  // Compute summary for selected FY
  const summary = useMemo(() => {
    if (!selectedFY) return null;

    const costCenterCount = selectedFY.costCenters.length;
    const lineItemCount = selectedFY.costCenters.reduce(
      (sum, cc) => sum + cc.lineItems.length, 0
    );
    
    const forecast = loadForecastForFY(selectedFY.id);
    const forecastExists = forecast !== null && forecast.length > 0;
    
    const actualsTxns = loadActuals(selectedFY.id);
    const actualsTxnCount = actualsTxns.length;
    
    const matching = loadActualsMatching(selectedFY.id);
    const matchingCount = Object.keys(matching.matchesByTxnId).length;
    const merchantRuleCount = Object.keys(matching.rulesByMerchantKey).length;

    // Get all cost center IDs from this FY
    const fyCostCenterIds = new Set(selectedFY.costCenters.map(cc => cc.id));

    // Count FY-scoped requests
    const fyRequests = requests.filter(req => {
      if (req.originFiscalYearId === selectedFY.id) return true;
      if (req.costCenterId && fyCostCenterIds.has(req.costCenterId)) return true;
      if (req.originCostCenterId && fyCostCenterIds.has(req.originCostCenterId)) return true;
      return false;
    });
    const requestsCount = fyRequests.length;

    // Count audit events
    let auditEventCount = 0;
    for (const req of fyRequests) {
      const events = loadApprovalAudit('request', req.id);
      auditEventCount += events.length;
    }
    // Also check FY-level audit events
    const fyAuditEvents = loadApprovalAudit('request', selectedFY.id);
    auditEventCount += fyAuditEvents.length;

    return {
      costCenterCount,
      lineItemCount,
      forecastExists,
      actualsTxnCount,
      matchingCount,
      merchantRuleCount,
      requestsCount,
      auditEventCount,
    };
  }, [selectedFY, requests]);

  const handleBuildPreview = () => {
    if (!selectedFY) return;
    setIsBuilding(true);

    try {
      const builtBundle = buildFiscalYearBundleV1({
        fiscalYear: selectedFY,
        currentRole,
        requests,
      });
      setBundle(builtBundle);

      const validationResult = validateFiscalYearBundle(builtBundle);
      setValidation(validationResult);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleDownload = () => {
    if (!bundle || !selectedFY) return;

    const dateStr = format(new Date(), 'yyyy-MM-dd');
    const sanitizedName = sanitizeFilename(selectedFY.name);
    const filename = `fy_bundle_${sanitizedName}_${dateStr}.json`;

    downloadJson(filename, bundle);
  };

  // Admin-only gate
  if (currentRole !== 'admin') {
    return (
      <div>
        <PageHeader
          title="FY Tools"
          description="Fiscal Year export and management tools."
        />
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Access Denied</AlertTitle>
          <AlertDescription>
            Only Admin can access FY Tools. Please switch to Admin role to use this feature.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="FY Tools"
        description="Export fiscal year data bundles for backup and archival."
      />

      <div className="space-y-6">
        {/* FY Selector */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Export FY Bundle</CardTitle>
            </div>
            <CardDescription>
              Select a fiscal year to build and download a complete data bundle including 
              budget, forecast, actuals, matching rules, requests, and audit events.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fy-select">Fiscal Year</Label>
              <Select value={selectedFYId} onValueChange={setSelectedFYId}>
                <SelectTrigger id="fy-select" className="w-[280px]">
                  <SelectValue placeholder="Select a fiscal year..." />
                </SelectTrigger>
                <SelectContent>
                  {fiscalYears.length === 0 ? (
                    <SelectItem value="_none" disabled>
                      No fiscal years available
                    </SelectItem>
                  ) : (
                    fiscalYears.map((fy) => (
                      <SelectItem key={fy.id} value={fy.id}>
                        {fy.name} ({fy.status})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Summary Panel */}
            {selectedFY && summary && (
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium">{selectedFY.name}</h4>
                  <Badge variant={
                    selectedFY.status === 'active' ? 'default' : 
                    selectedFY.status === 'closed' ? 'secondary' : 
                    'outline'
                  }>
                    {selectedFY.status}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.costCenterCount} cost centers</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.lineItemCount} line items</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-muted-foreground" />
                    <span>Forecast: {summary.forecastExists ? 'Yes' : 'No'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.actualsTxnCount} transactions</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.matchingCount} matches, {summary.merchantRuleCount} rules</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.requestsCount} requests</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-muted-foreground" />
                    <span>{summary.auditEventCount} audit events</span>
                  </div>
                </div>
              </div>
            )}

            {/* Build Button */}
            <div className="flex gap-2">
              <Button 
                onClick={handleBuildPreview} 
                disabled={!selectedFY || isBuilding}
                variant="outline"
              >
                <FileCheck className="h-4 w-4 mr-2" />
                {isBuilding ? 'Building...' : 'Build Bundle (Preview)'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Validation Results */}
        {validation && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                {validation.ok ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive" />
                )}
                <CardTitle className="text-lg">
                  {validation.ok ? 'Validation Passed' : 'Validation Errors'}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {validation.ok ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Bundle is valid and ready for download.
                  </p>
                  {bundle && (
                    <div className="text-sm space-y-1">
                      <p><strong>Schema Version:</strong> {bundle.schemaVersion}</p>
                      <p><strong>FY:</strong> {bundle.fiscalYearName}</p>
                      <p><strong>Cost Centers:</strong> {bundle.fiscalYear.costCenters.length}</p>
                      <p><strong>Forecast:</strong> {bundle.forecast ? 'Included' : 'Not available'}</p>
                      <p><strong>Actuals Transactions:</strong> {bundle.actualsTransactions.length}</p>
                      <p><strong>Requests:</strong> {bundle.requests.length}</p>
                      <p><strong>Audit Events:</strong> {Object.values(bundle.approvalAuditEventsByRequestId).flat().length + (bundle.fyAuditEvents?.length ?? 0)}</p>
                    </div>
                  )}
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download FY Bundle
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">
                    The bundle has validation errors. Please review:
                  </p>
                  <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                    {validation.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
