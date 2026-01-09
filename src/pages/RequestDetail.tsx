import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AdminOverrideDialog } from '@/components/AdminOverrideDialog';
import { ArrowLeft, CheckCircle2, Clock, XCircle, RotateCcw, Info, FileSpreadsheet, History, Send, Plus, Copy, Bell, ShieldAlert, Ban, Trash2 } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';
import { MONTH_LABELS, CostCenter } from '@/types/budget';
import { ApprovalStep, SpendRequest } from '@/types/requests';
import { ApprovalAuditEvent } from '@/types/approvalAudit';
import { loadForecastForFY } from '@/lib/forecastStore';
import {
  loadApprovalAudit,
  appendApprovalAudit,
  ensureCreatedEventIfMissing,
  formatAuditEvent,
} from '@/lib/approvalAuditStore';
import {
  buildRequestSlackTemplate,
  buildRequestEmailSubject,
  buildRequestEmailBody,
  buildRequestUrl,
  buildSheetUrl,
} from '@/lib/notificationTemplates';
import { copyText } from '@/lib/copyToClipboard';
import { formatDate, formatDateTime, formatAuditTimestamp } from '@/lib/dateTime';
import { toast } from '@/hooks/use-toast';

const levelLabels: Record<string, string> = {
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

function ApprovalStepItem({ step, timeZone }: { step: ApprovalStep; timeZone: string }) {
  const statusIcon = {
    pending: <Clock className="h-4 w-4 text-muted-foreground" />,
    approved: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    rejected: <XCircle className="h-4 w-4 text-destructive" />,
  };

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-b-0">
      <div className="flex items-center gap-3">
        {statusIcon[step.status]}
        <div>
          <span className="font-medium">{levelLabels[step.level]}</span>
          {step.updatedAt && (
            <p className="text-xs text-muted-foreground">
              {formatDateTime(step.updatedAt, timeZone)}
            </p>
          )}
        </div>
      </div>
      <Badge
        variant={
          step.status === 'approved'
            ? 'default'
            : step.status === 'rejected'
            ? 'destructive'
            : 'secondary'
        }
      >
        {step.status}
      </Badge>
    </div>
  );
}

export default function RequestDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getRequest, updateRequest } = useRequests();
  const { currentRole } = useCurrentUserRole();
  const { setSelectedFiscalYearId, fiscalYears } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();

  const request = id ? getRequest(id) : undefined;
  const [auditEvents, setAuditEvents] = useState<ApprovalAuditEvent[]>([]);

  // Admin override state
  const isAdminOverride = currentRole === 'admin' && adminSettings.adminOverrideEnabled;
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [pendingOverrideAction, setPendingOverrideAction] = useState<{
    type: 'force_cancel' | 'force_approve' | 'force_reject' | 'soft_delete';
  } | null>(null);

  // Load audit events and backfill created event if missing
  useEffect(() => {
    if (id && request) {
      ensureCreatedEventIfMissing('request', id, request.createdAt, 'admin', {
        originSheet: request.originSheet,
        amount: request.amount,
        vendorName: request.vendorName,
      }).then(() => {
        loadApprovalAudit('request', id).then(setAuditEvents);
      });
    }
  }, [id, request]);

  // Compute line item name with fallback lookup
  const lineItemName = useMemo(() => {
    if (!request) return '—';
    // Use stored lineItemName if available
    if (request.lineItemName) return request.lineItemName;
    // Fallback: try to look up from current data
    if (request.originSheet && request.originCostCenterId && request.originLineItemId) {
      let costCenters: CostCenter[] | undefined;
      if (request.originSheet === 'budget' && request.originFiscalYearId) {
        const fy = fiscalYears.find((f) => f.id === request.originFiscalYearId);
        costCenters = fy?.costCenters;
      } else if (request.originSheet === 'forecast') {
        if (request.originFiscalYearId) {
          costCenters = loadForecastForFY(request.originFiscalYearId) ?? undefined;
        }
      }
      if (costCenters) {
        const cc = costCenters.find((c) => c.id === request.originCostCenterId);
        const item = cc?.lineItems.find((li) => li.id === request.originLineItemId);
        if (item) return item.name;
      }
    }
    return '—';
  }, [request, fiscalYears]);

  // Header title fallback: lineItemName → vendorName → request ID
  const headerTitle = useMemo(() => {
    if (!request) return '—';
    if (request.lineItemName) return request.lineItemName;
    if (request.vendorName) return request.vendorName;
    return request.id.slice(0, 8);
  }, [request]);

  // Format date range - single month or range
  const dateRangeDisplay = useMemo(() => {
    if (!request) return '';
    if (request.startMonth === request.endMonth) {
      return MONTH_LABELS[request.startMonth];
    }
    return `${MONTH_LABELS[request.startMonth]} – ${MONTH_LABELS[request.endMonth]}`;
  }, [request]);

  // Next approver label for details panel
  const nextApproverLabel = useMemo(() => {
    if (!request || request.status !== 'pending') return '—';
    const step = request.approvalSteps.find((s) => s.status === 'pending');
    if (!step) return '—';
    return levelLabels[step.level] || step.level;
  }, [request]);

  // Request type friendly label
  const requestTypeLabel = useMemo(() => {
    if (!request) return 'Spend request';
    switch (request.originKind) {
      case 'new_line_item':
        return 'New line item';
      case 'adjustment':
        return 'Adjustment';
      case 'delete_line_item':
        return 'Delete line item';
      case 'cancel_request':
        return 'Withdraw / Cancel';
      default:
        return 'Spend request';
    }
  }, [request]);

  // Sheet label
  const sheetLabel = useMemo(() => {
    if (!request?.originSheet) return '—';
    switch (request.originSheet) {
      case 'budget':
        return 'Budget';
      case 'forecast':
        return 'Forecast';
      default:
        return '—';
    }
  }, [request]);

  // Current and Revised amounts based on request type
  const { currentAmount, revisedAmount } = useMemo(() => {
    if (!request) return { currentAmount: 'n/a', revisedAmount: 'n/a' };
    
    // NEW LINE ITEM: Current Amount = requested amount, Revised = n/a
    if (request.originKind === 'new_line_item') {
      return { 
        currentAmount: `$${request.amount.toLocaleString()}`, 
        revisedAmount: 'n/a' 
      };
    }
    
    // ADJUSTMENT: Current = original before increase, Revised = new after increase
    if (request.originKind === 'adjustment') {
      // Use explicit fields if available (new requests will have these)
      if (request.currentAmount !== undefined && request.revisedAmount !== undefined) {
        return {
          currentAmount: `$${request.currentAmount.toLocaleString()}`,
          revisedAmount: `$${request.revisedAmount.toLocaleString()}`,
        };
      }
      // Fallback for legacy requests without explicit fields
      return { 
        currentAmount: 'n/a', 
        revisedAmount: `$${request.amount.toLocaleString()}` 
      };
    }
    
    // NON-ADJUSTMENT (delete_line_item, cancel_request, etc.): Current = amount, Revised = n/a
    return { 
      currentAmount: `$${request.amount.toLocaleString()}`, 
      revisedAmount: 'n/a' 
    };
  }, [request]);

  // Justification display: strip "Forecast adjustment: " or "Budget adjustment: " prefix, fallback to n/a
  const justificationDisplay = useMemo(() => {
    if (!request?.justification || !request.justification.trim()) return 'n/a';
    // Strip common prefixes (case-insensitive)
    const cleaned = request.justification
      .replace(/^forecast adjustment:\s*/i, '')
      .replace(/^budget adjustment:\s*/i, '')
      .trim();
    return cleaned || 'n/a';
  }, [request]);

  const refreshAuditEvents = useCallback(() => {
    if (id) {
      loadApprovalAudit('request', id).then(setAuditEvents);
    }
  }, [id]);

  const isFinalized = request?.status === 'approved' || request?.status === 'rejected' || request?.status === 'cancelled';
  const nextPendingStep = request?.approvalSteps.find((s) => s.status === 'pending');
  const hasPendingStep = !!nextPendingStep;

  // Role gating: only the role matching the next pending step can approve/reject
  const canApproveReject = hasPendingStep && nextPendingStep?.level === currentRole;
  const roleCannotApprove = currentRole === 'admin' || (hasPendingStep && nextPendingStep?.level !== currentRole);

  // Deep linking: navigate to origin line item
  const hasOrigin = request?.originSheet && request?.originLineItemId;
  
  const handleViewInSheet = () => {
    if (!request?.originSheet || !request?.originLineItemId) return;

    if (request.originFiscalYearId) {
      setSelectedFiscalYearId(request.originFiscalYearId);
    }

    const params = new URLSearchParams();
    if (request.originCostCenterId) params.set('focusCostCenterId', request.originCostCenterId);
    params.set('focusLineItemId', request.originLineItemId);

    if (request.originSheet === 'budget') {
      navigate(`/budget?${params.toString()}`);
    } else {
      if (request.originFiscalYearId === null) {
        params.set('forecastMode', 'legacy');
      }
      navigate(`/forecast?${params.toString()}`);
    }
  };

  const handleApprove = () => {
    if (!id || !request || !canApproveReject) return;
    
    const stepLevel = nextPendingStep?.level;
    
    updateRequest(id, (r): SpendRequest => {
      const updatedSteps = [...r.approvalSteps];
      const pendingIndex = updatedSteps.findIndex((s) => s.status === 'pending');
      if (pendingIndex === -1) return r;

      updatedSteps[pendingIndex] = {
        ...updatedSteps[pendingIndex],
        status: 'approved',
        updatedAt: new Date().toISOString(),
      };

      const allApproved = updatedSteps.every((s) => s.status === 'approved');
      return {
        ...r,
        approvalSteps: updatedSteps,
        status: allApproved ? 'approved' : 'pending',
      };
    });

    appendApprovalAudit('request', id, {
      action: 'approved_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'manager' | 'cmo' | 'finance',
    });
    refreshAuditEvents();
  };

  const handleReject = () => {
    if (!id || !request || !canApproveReject) return;
    
    const stepLevel = nextPendingStep?.level;
    
    updateRequest(id, (r): SpendRequest => {
      const updatedSteps = [...r.approvalSteps];
      const pendingIndex = updatedSteps.findIndex((s) => s.status === 'pending');
      if (pendingIndex !== -1) {
        updatedSteps[pendingIndex] = {
          ...updatedSteps[pendingIndex],
          status: 'rejected',
          updatedAt: new Date().toISOString(),
        };
      }
      return {
        ...r,
        approvalSteps: updatedSteps,
        status: 'rejected',
      };
    });

    appendApprovalAudit('request', id, {
      action: 'rejected_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'manager' | 'cmo' | 'finance',
    });
    refreshAuditEvents();
  };

  const handleReset = () => {
    if (!id || !request) return;
    updateRequest(id, (r): SpendRequest => ({
      ...r,
      status: 'pending',
      approvalSteps: r.approvalSteps.map((s) => ({
        ...s,
        status: 'pending',
        updatedAt: undefined,
      })),
    }));

    appendApprovalAudit('request', id, {
      action: 'reset',
      actorRole: currentRole,
    });
    refreshAuditEvents();
  };

  // Admin Override Handlers
  const handleOverrideActionClick = (type: 'force_cancel' | 'force_approve' | 'force_reject' | 'soft_delete') => {
    setPendingOverrideAction({ type });
    setOverrideDialogOpen(true);
  };

  const handleOverrideCancel = () => {
    setOverrideDialogOpen(false);
    setPendingOverrideAction(null);
  };

  const handleOverrideSubmit = (justification: string) => {
    if (!id || !request || !pendingOverrideAction) return;

    const { type } = pendingOverrideAction;
    const now = new Date().toISOString();

    if (type === 'force_cancel') {
      updateRequest(id, (r): SpendRequest => ({
        ...r,
        status: 'cancelled',
        approvalSteps: r.approvalSteps.map((step) =>
          step.status === 'pending'
            ? { ...step, status: 'rejected' as const, updatedAt: now }
            : step
        ),
      }));
      appendApprovalAudit('request', id, {
        action: 'admin_override_force_cancel',
        actorRole: 'admin',
        meta: { justification },
      });
      toast({ title: 'Request cancelled', description: 'Request has been force cancelled via admin override.' });
    } else if (type === 'force_approve') {
      updateRequest(id, (r): SpendRequest => ({
        ...r,
        status: 'approved',
        approvalSteps: r.approvalSteps.map((step) => ({
          ...step,
          status: 'approved' as const,
          updatedAt: step.status === 'pending' ? now : step.updatedAt,
        })),
      }));
      appendApprovalAudit('request', id, {
        action: 'admin_override_force_approve',
        actorRole: 'admin',
        meta: { justification },
      });
      toast({ title: 'Request approved', description: 'Request has been force approved via admin override.' });
    } else if (type === 'force_reject') {
      // Reject the first pending step
      let rejectedFirstPending = false;
      updateRequest(id, (r): SpendRequest => ({
        ...r,
        status: 'rejected',
        approvalSteps: r.approvalSteps.map((step) => {
          if (step.status === 'pending' && !rejectedFirstPending) {
            rejectedFirstPending = true;
            return { ...step, status: 'rejected' as const, updatedAt: now };
          }
          return step;
        }),
      }));
      appendApprovalAudit('request', id, {
        action: 'admin_override_force_reject',
        actorRole: 'admin',
        meta: { justification },
      });
      toast({ title: 'Request rejected', description: 'Request has been force rejected via admin override.' });
    } else if (type === 'soft_delete') {
      // If request is still pending, force cancel first to resolve linked line items
      if (request.status === 'pending') {
        updateRequest(id, (r): SpendRequest => ({
          ...r,
          status: 'cancelled',
          approvalSteps: r.approvalSteps.map((step) =>
            step.status === 'pending'
              ? { ...step, status: 'rejected' as const, updatedAt: now }
              : step
          ),
          deletedAt: now,
          deletedByRole: 'admin',
          deletedJustification: justification,
        }));
        // Log both actions
        appendApprovalAudit('request', id, {
          action: 'admin_override_force_cancel',
          actorRole: 'admin',
          meta: { justification, reason: 'Auto-cancelled before archive to resolve linked line items' },
        });
        appendApprovalAudit('request', id, {
          action: 'admin_override_soft_delete',
          actorRole: 'admin',
          meta: { justification, priorStatus: 'pending' },
        });
        toast({ title: 'Request cancelled & archived', description: 'Request was force cancelled and then archived to prevent stranded line items.' });
      } else {
        updateRequest(id, (r): SpendRequest => ({
          ...r,
          deletedAt: now,
          deletedByRole: 'admin',
          deletedJustification: justification,
        }));
        appendApprovalAudit('request', id, {
          action: 'admin_override_soft_delete',
          actorRole: 'admin',
          meta: { justification },
        });
        toast({ title: 'Request archived', description: 'Request has been soft deleted/archived.' });
      }
      navigate('/requests');
      return;
    }

    setOverrideDialogOpen(false);
    setPendingOverrideAction(null);
    refreshAuditEvents();
  };

  // Check if request is soft-deleted
  const isDeleted = !!request?.deletedAt;

  if (!request) {
    return (
      <div>
        <PageHeader title="Request Not Found" />
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground mb-4">
              The requested spend request could not be found.
            </p>
            <Button asChild variant="outline">
              <Link to="/requests">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Requests
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusVariant =
    request.status === 'approved'
      ? 'default'
      : request.status === 'rejected'
      ? 'destructive'
      : request.status === 'cancelled'
      ? 'outline'
      : 'secondary';

  const disabledTooltip = currentRole === 'admin'
    ? "Admin cannot approve/reject spend requests. Switch role in Admin settings."
    : `Current role is ${currentRole.toUpperCase()}. Switch to ${nextPendingStep?.level?.toUpperCase()} in Admin to approve this step.`;

  return (
    <div>
      <PageHeader
        title={`Request: ${headerTitle}`}
        description={`Created ${formatDate(request.createdAt, adminSettings.timeZone)}`}
      >
        <div className="flex gap-2 flex-wrap">
          {hasOrigin && (
            <Button onClick={handleViewInSheet} variant="outline">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              View in {request.originSheet === 'budget' ? 'Budget' : 'Forecast'}
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={handleApprove}
                  disabled={isFinalized || !hasPendingStep || !canApproveReject}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve Next Step
                </Button>
              </span>
            </TooltipTrigger>
            {roleCannotApprove && !isFinalized && hasPendingStep && (
              <TooltipContent>
                <p>{disabledTooltip}</p>
              </TooltipContent>
            )}
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  onClick={handleReject}
                  disabled={isFinalized || !canApproveReject}
                  variant="destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              </span>
            </TooltipTrigger>
            {roleCannotApprove && !isFinalized && hasPendingStep && (
              <TooltipContent>
                <p>{disabledTooltip}</p>
              </TooltipContent>
            )}
          </Tooltip>
          
          <Button onClick={handleReset} variant="outline">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </Button>
          <Button asChild variant="outline">
            <Link to="/requests">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* Role gating info */}
      {hasPendingStep && !isFinalized && roleCannotApprove && (
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Current role is <strong>{currentRole.toUpperCase()}</strong>. Switch to <strong>{nextPendingStep?.level?.toUpperCase()}</strong> in Admin settings to approve this step.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <span className="text-muted-foreground text-xs">Next Approver</span>
            <span className="text-right break-words">{nextApproverLabel}</span>

            <span className="text-muted-foreground text-xs">Type</span>
            <span className="text-right break-words">{requestTypeLabel}</span>

            <span className="text-muted-foreground text-xs self-start">Justification</span>
            <span className="text-right break-words">{justificationDisplay}</span>

            <span className="text-muted-foreground text-xs">Status</span>
            <span className="text-right">
              <Badge variant={statusVariant} className="text-xs">{isDeleted ? 'Archived' : request.status}</Badge>
            </span>

            <span className="text-muted-foreground text-xs">Sheet</span>
            <span className="text-right break-words">{sheetLabel}</span>

            <span className="text-muted-foreground text-xs">Cost Center</span>
            <span className="text-right break-words">{request.costCenterName}</span>

            <span className="text-muted-foreground text-xs">Vendor</span>
            <span className="text-right break-words">{request.vendorName}</span>

            <span className="text-muted-foreground text-xs">Current Amount</span>
            <span className="text-right break-words">{currentAmount}</span>

            <span className="text-muted-foreground text-xs">Revised Amount</span>
            <span className="text-right break-words">{revisedAmount}</span>

            <span className="text-muted-foreground text-xs">Date Range</span>
            <span className="text-right break-words">{dateRangeDisplay}</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Approval Timeline</CardTitle>
              {nextPendingStep && (
                <Badge variant="outline" className="text-xs">
                  Next: {levelLabels[nextPendingStep.level]}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {request.approvalSteps.map((step, index) => (
              <ApprovalStepItem key={index} step={step} timeZone={adminSettings.timeZone} />
            ))}
          </CardContent>
        </Card>

        {/* Approval Activity */}
        <Card className="md:col-span-3">
          <CardHeader>
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-lg">Approval Activity</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approval activity yet</p>
            ) : (
              <ScrollArea className="max-h-64">
                <div className="space-y-3">
                  {auditEvents.map((event) => {
                    const actionIcon: Record<string, React.ReactNode> = {
                      created: <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
                      submitted_for_approval: <Send className="h-3.5 w-3.5 text-blue-500" />,
                      approved_step: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                      rejected_step: <XCircle className="h-3.5 w-3.5 text-destructive" />,
                      reset: <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />,
                      final_approved: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                      notified_next_approver: <Bell className="h-3.5 w-3.5 text-blue-500" />,
                    };
                    return (
                      <div key={event.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5">{actionIcon[event.action] ?? <Clock className="h-3.5 w-3.5 text-muted-foreground" />}</div>
                        <div className="flex-1">
                          <div className="font-medium">{formatAuditEvent(event)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatAuditTimestamp(event.timestamp, adminSettings.timeZone)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Notify Next Approver */}
        {request.status === 'pending' && nextPendingStep && (
          <NotifyApproverCard 
            request={request} 
            nextPendingStep={nextPendingStep} 
            onAuditUpdated={refreshAuditEvents}
          />
        )}

        {/* Admin Override Actions */}
        {isAdminOverride && !isDeleted && (
          <Card className="md:col-span-2 border-amber-500">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-lg text-amber-700 dark:text-amber-400">Admin Override Actions</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                These actions bypass normal approval workflows. All actions require justification and are logged.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOverrideActionClick('force_cancel')}
                  disabled={request.status === 'cancelled'}
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Force Cancel
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOverrideActionClick('force_approve')}
                  disabled={request.status === 'approved'}
                  className="text-green-600 hover:text-green-700"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Force Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOverrideActionClick('force_reject')}
                  disabled={request.status === 'rejected'}
                  className="text-destructive hover:text-destructive"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Force Reject
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOverrideActionClick('soft_delete')}
                  className="text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Archive/Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Deleted notice */}
        {isDeleted && (
          <Alert className="md:col-span-2 border-destructive">
            <Trash2 className="h-4 w-4" />
            <AlertDescription>
              This request was archived on {formatDateTime(request.deletedAt!, adminSettings.timeZone)}.
              {request.deletedJustification && (
                <span className="block mt-1 text-muted-foreground">Reason: {request.deletedJustification}</span>
              )}
            </AlertDescription>
          </Alert>
        )}
      </div>

      <AdminOverrideDialog
        open={overrideDialogOpen}
        title={
          pendingOverrideAction?.type === 'force_cancel' ? 'Force Cancel Request' :
          pendingOverrideAction?.type === 'force_approve' ? 'Force Approve Request' :
          pendingOverrideAction?.type === 'force_reject' ? 'Force Reject Request' :
          'Archive/Delete Request'
        }
        description="This action bypasses the normal approval workflow. Please provide a justification for audit purposes."
        onCancel={handleOverrideCancel}
        onSubmit={handleOverrideSubmit}
      />
    </div>
  );
}

function NotifyApproverCard({ 
  request, 
  nextPendingStep, 
  onAuditUpdated 
}: { 
  request: SpendRequest; 
  nextPendingStep: ApprovalStep;
  onAuditUpdated: () => void;
}) {
  const { currentRole } = useCurrentUserRole();
  
  const links = {
    requestUrl: buildRequestUrl(request.id),
    sheetUrl: buildSheetUrl(request),
  };

  const slackMessage = buildRequestSlackTemplate({
    request,
    nextLevel: nextPendingStep.level,
    links,
  });

  const emailSubject = buildRequestEmailSubject({
    request,
    nextLevel: nextPendingStep.level,
  });

  const emailBody = buildRequestEmailBody({
    request,
    nextLevel: nextPendingStep.level,
    links,
  });

  const handleCopy = async (text: string, label: string, channel: 'slack' | 'email', part: 'message' | 'subject' | 'body') => {
    const success = await copyText(text);
    if (success) {
      toast({
        title: 'Copied!',
        description: `${label} copied to clipboard.`,
      });
      
      // Append audit event on successful copy
      appendApprovalAudit('request', request.id, {
        action: 'notified_next_approver',
        actorRole: currentRole,
        stepLevel: nextPendingStep.level as 'manager' | 'cmo' | 'finance',
        meta: { channel, part },
      });
      onAuditUpdated();
    } else {
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="md:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg">Notify Next Approver</CardTitle>
          <Badge variant="outline" className="text-xs ml-auto">
            {levelLabels[nextPendingStep.level]}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="slack" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="slack">Slack</TabsTrigger>
            <TabsTrigger value="email">Email</TabsTrigger>
          </TabsList>
          <TabsContent value="slack" className="space-y-3">
            <Textarea
              value={slackMessage}
              readOnly
              className="min-h-[180px] text-sm font-mono"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopy(slackMessage, 'Slack message', 'slack', 'message')}
              className="gap-2"
            >
              <Copy className="h-4 w-4" />
              Copy Slack message
            </Button>
          </TabsContent>
          <TabsContent value="email" className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Subject</Label>
              <div className="flex gap-2">
                <Input value={emailSubject} readOnly className="flex-1 text-sm" />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(emailSubject, 'Email subject', 'email', 'subject')}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Body</Label>
              <Textarea
                value={emailBody}
                readOnly
                className="min-h-[180px] text-sm font-mono"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCopy(emailBody, 'Email body', 'email', 'body')}
                className="gap-2"
              >
                <Copy className="h-4 w-4" />
                Copy email body
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
