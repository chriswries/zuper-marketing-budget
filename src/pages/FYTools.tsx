import { useState, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUserRole } from "@/contexts/CurrentUserRoleContext";
import { useFiscalYearBudget } from "@/contexts/FiscalYearBudgetContext";
import { useRequests } from "@/contexts/RequestsContext";
import { useAdminSettings } from "@/contexts/AdminSettingsContext";
import { buildFiscalYearBundleV1, validateFiscalYearBundle } from "@/lib/fyBundle";
import { downloadJson, sanitizeFilename } from "@/lib/downloadJson";
import { loadActuals } from "@/lib/actualsStore";
import { loadActualsMatching } from "@/lib/actualsMatchingStore";
import { loadForecastForFY } from "@/lib/forecastStore";
import { loadApprovalAudit } from "@/lib/approvalAuditStore";
import { archiveFiscalYear, restoreFiscalYear, hardDeleteFiscalYear, getFYScopedRequests } from "@/lib/fyLifecycle";
import { parseJsonFile, detectBundleConflicts, importFiscalYearBundleV1, type ImportMode, type BundleConflictResult } from "@/lib/fyBundleImport";
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
  History,
  Archive,
  ArchiveRestore,
  Trash2,
  ShieldAlert,
  Upload,
  FileUp,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

export default function FYTools() {
  const navigate = useNavigate();
  const { currentRole } = useCurrentUserRole();
  const { fiscalYears, updateFiscalYearBudget, deleteFiscalYearBudget, createFiscalYearBudget, setSelectedFiscalYearId } = useFiscalYearBudget();
  const { requests, setRequests } = useRequests();
  const { settings } = useAdminSettings();
  const { toast } = useToast();

  const [selectedFYId, setSelectedFYId] = useState<string>("");
  const [bundle, setBundle] = useState<FiscalYearBundleV1 | null>(null);
  const [validation, setValidation] = useState<BundleValidationResult | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);

  // Archive/Restore dialog state
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [archiveAction, setArchiveAction] = useState<'archive' | 'restore'>('archive');
  const [archiveJustification, setArchiveJustification] = useState("");

  // Hard delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteJustification, setDeleteJustification] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");

  // Import state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBundle, setImportBundle] = useState<FiscalYearBundleV1 | null>(null);
  const [importConflicts, setImportConflicts] = useState<BundleConflictResult | null>(null);
  const [importJustification, setImportJustification] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>('restore');
  const [overwriteConfirmation, setOverwriteConfirmation] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const selectedFY = useMemo(() => 
    fiscalYears.find(fy => fy.id === selectedFYId) ?? null
  , [fiscalYears, selectedFYId]);

  const isArchived = selectedFY?.status === 'archived';
  const isAdminOverrideEnabled = settings.adminOverrideEnabled;

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

    // Count FY-scoped requests
    const fyRequests = getFYScopedRequests(selectedFY, requests);
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

  // Archive/Restore handlers
  const handleOpenArchiveDialog = (action: 'archive' | 'restore') => {
    setArchiveAction(action);
    setArchiveJustification("");
    setArchiveDialogOpen(true);
  };

  const handleArchiveSubmit = () => {
    if (!selectedFY || !archiveJustification.trim()) return;

    if (archiveAction === 'archive') {
      archiveFiscalYear(selectedFY, currentRole, archiveJustification.trim(), updateFiscalYearBudget);
      toast({
        title: "Fiscal Year Archived",
        description: `${selectedFY.name} has been archived.`,
      });
    } else {
      restoreFiscalYear(selectedFY, currentRole, archiveJustification.trim(), updateFiscalYearBudget);
      toast({
        title: "Fiscal Year Restored",
        description: `${selectedFY.name} has been restored.`,
      });
    }

    setArchiveDialogOpen(false);
    // Clear bundle/validation since FY state changed
    setBundle(null);
    setValidation(null);
  };

  // Hard delete handlers
  const handleOpenDeleteDialog = () => {
    // Guard: cannot open dialog if override is off
    if (!isAdminOverrideEnabled) {
      toast({
        title: "Admin Override Required",
        description: "Enable Admin Override Mode to delete a fiscal year.",
        variant: "destructive",
      });
      return;
    }
    setDeleteJustification("");
    setDeleteConfirmation("");
    setDeleteDialogOpen(true);
  };

  const isDeleteConfirmationValid = deleteConfirmation === selectedFY?.name || deleteConfirmation === 'DELETE';

  const handleHardDelete = () => {
    if (!selectedFY || !deleteJustification.trim() || !isDeleteConfirmationValid) return;

    // Defensive guard: must have override enabled
    if (!isAdminOverrideEnabled) {
      toast({
        title: "Admin Override Required",
        description: "Cannot delete fiscal year without Admin Override Mode enabled.",
        variant: "destructive",
      });
      return;
    }

    const result = hardDeleteFiscalYear(
      selectedFY,
      currentRole,
      deleteJustification.trim(),
      requests,
      deleteFiscalYearBudget,
      setRequests,
      isAdminOverrideEnabled
    );

    if (!result) {
      // hardDeleteFiscalYear returned null (guard failed)
      toast({
        title: "Delete Failed",
        description: "Admin Override Mode must be enabled to delete a fiscal year.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Fiscal Year Deleted",
      description: `${selectedFY.name} and all associated data deleted. Removed ${result.deletedRequestIds.length} requests.`,
    });

    setDeleteDialogOpen(false);
    setSelectedFYId("");
    navigate('/admin');
  };

  // Import handlers
  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    setImportBundle(null);
    setImportConflicts(null);
    setImportJustification("");
    setOverwriteConfirmation("");
    setImportMode('restore');

    try {
      const parsed = await parseJsonFile(file);
      const conflicts = detectBundleConflicts(parsed, fiscalYears, requests);
      
      if (!conflicts.schemaOk) {
        toast({
          title: "Invalid Bundle",
          description: conflicts.validationErrors[0] || "Bundle validation failed.",
          variant: "destructive",
        });
        setImportFile(null);
        return;
      }

      setImportBundle(parsed as FiscalYearBundleV1);
      setImportConflicts(conflicts);
      
      // Auto-select mode based on conflicts
      if (conflicts.fyIdExists && conflicts.requestIdConflicts.length === 0) {
        setImportMode('overwrite');
      } else {
        setImportMode('restore');
      }

      setImportDialogOpen(true);
    } catch (error) {
      toast({
        title: "Parse Error",
        description: error instanceof Error ? error.message : "Failed to parse JSON file.",
        variant: "destructive",
      });
      setImportFile(null);
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImport = () => {
    if (!importBundle || !importJustification.trim()) return;
    if (importMode === 'overwrite' && overwriteConfirmation !== 'OVERWRITE') return;

    setIsImporting(true);
    try {
      const result = importFiscalYearBundleV1({
        bundle: importBundle,
        mode: importMode,
        justification: importJustification.trim(),
        currentRole,
        adminOverrideEnabled: isAdminOverrideEnabled,
        existingFiscalYears: fiscalYears,
        existingRequests: requests,
        createFiscalYearBudget,
        deleteFiscalYearBudget,
        setRequests,
      });

      if (!result.ok) {
        toast({
          title: "Import Failed",
          description: result.errors?.[0] || "Unknown error during import.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Import Successful",
        description: `${importBundle.fiscalYearName} has been imported successfully.`,
      });

      // Select the imported FY
      if (result.fiscalYearId) {
        setSelectedFiscalYearId(result.fiscalYearId);
        setSelectedFYId(result.fiscalYearId);
      }

      // Reset import state
      setImportDialogOpen(false);
      setImportFile(null);
      setImportBundle(null);
      setImportConflicts(null);
      setImportJustification("");
      setOverwriteConfirmation("");
    } finally {
      setIsImporting(false);
    }
  };

  const canRestore = importConflicts && !importConflicts.fyIdExists && importConflicts.requestIdConflicts.length === 0;
  const canOverwrite = importConflicts && importConflicts.fyIdExists && importConflicts.requestIdConflicts.length === 0 && isAdminOverrideEnabled;

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
        description="Export, archive, and manage fiscal year data."
      />

      <div className="space-y-6">
        {/* FY Selector */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Select Fiscal Year</CardTitle>
            </div>
            <CardDescription>
              Choose a fiscal year to export, archive, or delete.
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
                    selectedFY.status === 'archived' ? 'outline' :
                    'outline'
                  }>
                    {selectedFY.status}
                  </Badge>
                  {selectedFY.archivedAt && (
                    <span className="text-xs text-muted-foreground">
                      Archived {format(new Date(selectedFY.archivedAt), 'MMM d, yyyy')}
                    </span>
                  )}
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
          </CardContent>
        </Card>

        {/* Export Bundle Section */}
        {selectedFY && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Export FY Bundle</CardTitle>
              </div>
              <CardDescription>
                Build and download a complete data bundle including budget, forecast, actuals, 
                matching rules, requests, and audit events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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

              {/* Validation Results */}
              {validation && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-2">
                    {validation.ok ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                    <span className="font-medium">
                      {validation.ok ? 'Validation Passed' : 'Validation Errors'}
                    </span>
                  </div>

                  {validation.ok && bundle ? (
                    <div className="space-y-3">
                      <div className="text-sm space-y-1 text-muted-foreground">
                        <p><strong>Schema Version:</strong> {bundle.schemaVersion}</p>
                        <p><strong>FY:</strong> {bundle.fiscalYearName}</p>
                        <p><strong>Cost Centers:</strong> {bundle.fiscalYear.costCenters.length}</p>
                        <p><strong>Forecast:</strong> {bundle.forecast ? 'Included' : 'Not available'}</p>
                        <p><strong>Actuals Transactions:</strong> {bundle.actualsTransactions.length}</p>
                        <p><strong>Requests:</strong> {bundle.requests.length}</p>
                        <p><strong>Audit Events:</strong> {Object.values(bundle.approvalAuditEventsByRequestId).flat().length + (bundle.fyAuditEvents?.length ?? 0)}</p>
                      </div>
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
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Import FY Bundle Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Import FY Bundle</CardTitle>
            </div>
            <CardDescription>
              Restore a fiscal year from a previously exported JSON bundle. 
              Includes budget, forecast, actuals, requests, and audit events.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="import-file">Select Bundle File (.json)</Label>
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="cursor-pointer"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              The file will be validated and you'll see a preview before importing.
            </p>
          </CardContent>
        </Card>

        {/* Archive/Restore Section */}
        {selectedFY && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Archive className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg">Archive / Restore</CardTitle>
              </div>
              <CardDescription>
                Archived fiscal years are hidden from pickers by default but can still be exported.
                This action is reversible.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isArchived ? (
                <Button onClick={() => handleOpenArchiveDialog('restore')} variant="outline">
                  <ArchiveRestore className="h-4 w-4 mr-2" />
                  Restore Fiscal Year
                </Button>
              ) : (
                <Button onClick={() => handleOpenArchiveDialog('archive')} variant="outline">
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Fiscal Year
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Danger Zone: Hard Delete */}
        {selectedFY && (
          <Card className="border-destructive/50">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Trash2 className="h-5 w-5 text-destructive" />
                <CardTitle className="text-lg text-destructive">Danger Zone: Hard Delete</CardTitle>
              </div>
              <CardDescription>
                Permanently delete this fiscal year and ALL associated data including forecast, 
                actuals, matching rules, requests, and audit events. This action cannot be undone.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isAdminOverrideEnabled && (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Admin Override Required</AlertTitle>
                  <AlertDescription>
                    Enable Admin Override Mode in Admin settings to use this feature.
                  </AlertDescription>
                </Alert>
              )}
              <Button 
                onClick={handleOpenDeleteDialog} 
                variant="destructive"
                disabled={!isAdminOverrideEnabled}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Hard Delete Fiscal Year
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Archive/Restore Dialog */}
      <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {archiveAction === 'archive' ? (
                <Archive className="h-5 w-5" />
              ) : (
                <ArchiveRestore className="h-5 w-5" />
              )}
              {archiveAction === 'archive' ? 'Archive' : 'Restore'} {selectedFY?.name}
            </DialogTitle>
            <DialogDescription>
              {archiveAction === 'archive'
                ? 'Archived fiscal years are hidden from pickers but remain exportable.'
                : 'Restore this fiscal year to its previous status.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="archive-justification">
                Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="archive-justification"
                placeholder={`Why are you ${archiveAction === 'archive' ? 'archiving' : 'restoring'} this fiscal year?`}
                value={archiveJustification}
                onChange={(e) => setArchiveJustification(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleArchiveSubmit} disabled={!archiveJustification.trim()}>
              {archiveAction === 'archive' ? 'Archive' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hard Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Permanently Delete {selectedFY?.name}
            </DialogTitle>
            <DialogDescription>
              This will permanently delete all data associated with this fiscal year. 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {summary && (
              <div className="bg-destructive/10 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-destructive">The following will be deleted:</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>{summary.costCenterCount} cost centers with {summary.lineItemCount} line items</li>
                  <li>Forecast data {summary.forecastExists ? '(exists)' : '(none)'}</li>
                  <li>{summary.actualsTxnCount} actuals transactions</li>
                  <li>{summary.matchingCount} transaction matches, {summary.merchantRuleCount} merchant rules</li>
                  <li>{summary.requestsCount} requests</li>
                  <li>{summary.auditEventCount} audit events (for requests)</li>
                </ul>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="delete-justification">
                Justification <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="delete-justification"
                placeholder="Why are you permanently deleting this fiscal year?"
                value={deleteJustification}
                onChange={(e) => setDeleteJustification(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type <strong>{selectedFY?.name}</strong> or <strong>DELETE</strong> to confirm
              </Label>
              <Input
                id="delete-confirmation"
                placeholder={`Type "${selectedFY?.name}" or "DELETE"`}
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleHardDelete}
              disabled={!deleteJustification.trim() || !isDeleteConfirmationValid}
            >
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Bundle Dialog */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileUp className="h-5 w-5" />
              Import FY Bundle
            </DialogTitle>
            <DialogDescription>
              Review and import the selected fiscal year bundle.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {importBundle && importConflicts && (
              <>
                {/* Bundle Info */}
                <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{importBundle.fiscalYearName}</span>
                    <Badge variant="outline">v{importBundle.schemaVersion}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Exported: {format(new Date(importBundle.exportedAt), 'MMM d, yyyy h:mm a')}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{importConflicts.summary.costCenters} cost centers</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      <span>{importConflicts.summary.lineItems} line items</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Receipt className="h-3 w-3" />
                      <span>{importConflicts.summary.actualsTxnCount} transactions</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ClipboardList className="h-3 w-3" />
                      <span>{importConflicts.summary.requestsCount} requests</span>
                    </div>
                  </div>
                </div>

                {/* Conflict Status */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {importConflicts.fyIdExists ? (
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-sm">
                      {importConflicts.fyIdExists 
                        ? 'Fiscal year already exists (will overwrite)'
                        : 'No existing fiscal year with this ID'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {importConflicts.requestIdConflicts.length > 0 ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    )}
                    <span className="text-sm">
                      {importConflicts.requestIdConflicts.length > 0
                        ? `${importConflicts.requestIdConflicts.length} request ID conflicts (cannot import)`
                        : 'No request ID conflicts'}
                    </span>
                  </div>
                </div>

                {/* Request conflict details */}
                {importConflicts.requestIdConflicts.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Cannot Import</AlertTitle>
                    <AlertDescription>
                      The bundle contains requests with IDs that conflict with existing requests.
                      Conflicting IDs: {importConflicts.requestIdConflicts.slice(0, 3).join(', ')}
                      {importConflicts.requestIdConflicts.length > 3 && ` and ${importConflicts.requestIdConflicts.length - 3} more`}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Mode selector */}
                {importConflicts.requestIdConflicts.length === 0 && (
                  <div className="space-y-3">
                    {canRestore && (
                      <Button
                        variant={importMode === 'restore' ? 'default' : 'outline'}
                        className="w-full justify-start"
                        onClick={() => setImportMode('restore')}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Restore from bundle (safe)
                      </Button>
                    )}
                    {importConflicts.fyIdExists && (
                      <Button
                        variant={importMode === 'overwrite' ? 'destructive' : 'outline'}
                        className="w-full justify-start"
                        onClick={() => setImportMode('overwrite')}
                        disabled={!isAdminOverrideEnabled}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Overwrite existing FY (destructive)
                        {!isAdminOverrideEnabled && <span className="ml-2 text-xs">(requires Admin Override)</span>}
                      </Button>
                    )}
                  </div>
                )}

                {/* Justification */}
                {importConflicts.requestIdConflicts.length === 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="import-justification">
                      Justification <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="import-justification"
                      placeholder="Why are you importing this fiscal year?"
                      value={importJustification}
                      onChange={(e) => setImportJustification(e.target.value)}
                      className="min-h-[60px]"
                    />
                  </div>
                )}

                {/* Overwrite confirmation */}
                {importMode === 'overwrite' && importConflicts.requestIdConflicts.length === 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="overwrite-confirmation">
                      Type <strong>OVERWRITE</strong> to confirm
                    </Label>
                    <Input
                      id="overwrite-confirmation"
                      placeholder="Type OVERWRITE"
                      value={overwriteConfirmation}
                      onChange={(e) => setOverwriteConfirmation(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
              Cancel
            </Button>
            {importConflicts?.requestIdConflicts.length === 0 && (
              <Button
                variant={importMode === 'overwrite' ? 'destructive' : 'default'}
                onClick={handleImport}
                disabled={
                  isImporting ||
                  !importJustification.trim() ||
                  (importMode === 'overwrite' && overwriteConfirmation !== 'OVERWRITE') ||
                  (importMode === 'restore' && !canRestore) ||
                  (importMode === 'overwrite' && !canOverwrite)
                }
              >
                {isImporting ? 'Importing...' : (importMode === 'overwrite' ? 'Overwrite & Import' : 'Import')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
