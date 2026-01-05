import { useParams, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Clock, XCircle, RotateCcw } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { MONTH_LABELS } from '@/types/budget';
import { ApprovalStep, SpendRequest } from '@/types/requests';

const levelLabels: Record<string, string> = {
  ic: 'IC',
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
  const { getRequest, updateRequest } = useRequests();

  const request = id ? getRequest(id) : undefined;

  const isFinalized = request?.status === 'approved' || request?.status === 'rejected';
  const hasPendingStep = request?.approvalSteps.some((s) => s.status === 'pending');

  const handleApprove = () => {
    if (!id || !request) return;
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
  };

  const handleReject = () => {
    if (!id || !request) return;
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

  return (
    <div>
      <PageHeader
        title={`Request: ${request.vendorName}`}
        description={`Created ${new Date(request.createdAt).toLocaleDateString()}`}
      >
        <div className="flex gap-2 flex-wrap">
          <Button
            onClick={handleApprove}
            disabled={isFinalized || !hasPendingStep}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Approve Next Step
          </Button>
          <Button
            onClick={handleReject}
            disabled={isFinalized}
            variant="destructive"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
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
            <CardTitle className="text-lg">Approval Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {request.approvalSteps.map((step, index) => (
              <ApprovalStepItem key={index} step={step} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
