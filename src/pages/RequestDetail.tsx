import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ArrowLeft, CheckCircle2, Clock, XCircle, RotateCcw, Info, FileSpreadsheet, History, Send, Plus } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { useCurrentUserRole } from '@/contexts/CurrentUserRoleContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { MONTH_LABELS } from '@/types/budget';
import { ApprovalStep, SpendRequest } from '@/types/requests';
import { ApprovalAuditEvent } from '@/types/approvalAudit';
import {
  loadApprovalAudit,
  appendApprovalAudit,
  ensureCreatedEventIfMissing,
  formatAuditEvent,
  formatAuditTimestamp,
} from '@/lib/approvalAuditStore';

const levelLabels: Record<string, string> = {
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

function ApprovalStepItem({ step }: { step: ApprovalStep }) {
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
              {new Date(step.updatedAt).toLocaleString()}
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
  const { setSelectedFiscalYearId } = useFiscalYearBudget();

  const request = id ? getRequest(id) : undefined;
  const [auditEvents, setAuditEvents] = useState<ApprovalAuditEvent[]>([]);

  // Load audit events and backfill created event if missing
  useEffect(() => {
    if (id && request) {
      ensureCreatedEventIfMissing('request', id, request.createdAt, 'admin', {
        originSheet: request.originSheet,
        amount: request.amount,
        vendorName: request.vendorName,
      });
      setAuditEvents(loadApprovalAudit('request', id));
    }
  }, [id, request]);

  const refreshAuditEvents = useCallback(() => {
    if (id) {
      setAuditEvents(loadApprovalAudit('request', id));
    }
  }, [id]);

  const isFinalized = request?.status === 'approved' || request?.status === 'rejected';
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
      : 'secondary';

  const disabledTooltip = currentRole === 'admin'
    ? "Admin cannot approve/reject spend requests. Switch role in Admin settings."
    : `Current role is ${currentRole.toUpperCase()}. Switch to ${nextPendingStep?.level?.toUpperCase()} in Admin to approve this step.`;

  return (
    <div>
      <PageHeader
        title={`Request: ${request.vendorName}`}
        description={`Created ${new Date(request.createdAt).toLocaleDateString()}`}
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={statusVariant}>{request.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cost Center</span>
              <span className="font-medium">{request.costCenterName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Vendor</span>
              <span className="font-medium">{request.vendorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium">
                ${request.amount.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date Range</span>
              <span className="font-medium">
                {MONTH_LABELS[request.startMonth]} – {MONTH_LABELS[request.endMonth]}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contracted</span>
              <span className="font-medium">{request.isContracted ? 'Yes' : 'No'}</span>
            </div>
            {request.justification && (
              <div className="pt-2 border-t">
                <span className="text-muted-foreground text-sm">Justification</span>
                <p className="mt-1 text-sm">{request.justification}</p>
              </div>
            )}
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
              <ApprovalStepItem key={index} step={step} />
            ))}
          </CardContent>
        </Card>

        {/* Approval Activity */}
        <Card className="md:col-span-2">
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
                    const actionIcon = {
                      created: <Plus className="h-3.5 w-3.5 text-muted-foreground" />,
                      submitted_for_approval: <Send className="h-3.5 w-3.5 text-blue-500" />,
                      approved_step: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                      rejected_step: <XCircle className="h-3.5 w-3.5 text-destructive" />,
                      reset: <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />,
                      final_approved: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
                    };
                    return (
                      <div key={event.id} className="flex items-start gap-3 text-sm">
                        <div className="mt-0.5">{actionIcon[event.action]}</div>
                        <div className="flex-1">
                          <div className="font-medium">{formatAuditEvent(event)}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatAuditTimestamp(event.timestamp)}
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
      </div>
    </div>
  );
}
