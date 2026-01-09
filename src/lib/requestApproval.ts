import { SpendRequest, ApprovalStep, ApprovalLevel, RequestStatus } from '@/types/requests';

/**
 * Gets the index of the current pending approval step.
 * "Current pending" = first step with status 'pending' where all previous steps are 'approved'.
 * Returns -1 if no pending step or request is not in a valid approval state.
 */
export function getCurrentPendingStepIndex(steps: ApprovalStep[]): number {
  if (!steps || steps.length === 0) return -1;
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    // Check if all previous steps are approved
    const allPreviousApproved = steps.slice(0, i).every(s => s.status === 'approved');
    
    if (step.status === 'pending' && allPreviousApproved) {
      return i;
    }
    
    // If we hit a non-approved, non-pending step before finding a pending one, stop
    if (step.status === 'rejected') {
      return -1;
    }
  }
  
  return -1;
}

/**
 * Checks if a request needs approval by a specific role.
 * Returns true only if request.status === 'pending' AND current pending step belongs to role.
 */
export function requestNeedsApprovalByRole(
  request: SpendRequest,
  role: 'admin' | 'manager' | 'cmo' | 'finance'
): boolean {
  // Admin cannot approve requests
  if (role === 'admin') return false;
  
  // Request must be in pending status
  if (request.status !== 'pending') return false;
  
  const pendingIndex = getCurrentPendingStepIndex(request.approvalSteps);
  if (pendingIndex === -1) return false;
  
  const currentStep = request.approvalSteps[pendingIndex];
  return currentStep.level === role;
}

/**
 * Applies an approval to the current pending step for the given role.
 * Returns the updated request with the step marked as 'approved'.
 * If all steps are now approved, request.status becomes 'approved'.
 */
export function applyApproveStep(
  request: SpendRequest,
  actorRole: 'manager' | 'cmo' | 'finance'
): SpendRequest {
  const pendingIndex = getCurrentPendingStepIndex(request.approvalSteps);
  if (pendingIndex === -1) return request;
  
  const currentStep = request.approvalSteps[pendingIndex];
  if (currentStep.level !== actorRole) return request;
  
  const updatedSteps = request.approvalSteps.map((step, i) => {
    if (i === pendingIndex) {
      return {
        ...step,
        status: 'approved' as const,
        updatedAt: new Date().toISOString(),
      };
    }
    return step;
  });
  
  // Check if all steps are now approved
  const allApproved = updatedSteps.every(s => s.status === 'approved');
  
  return {
    ...request,
    approvalSteps: updatedSteps,
    status: allApproved ? 'approved' : 'pending',
  };
}

/**
 * Applies a rejection to the current pending step for the given role.
 * Returns the updated request with the step marked as 'rejected' and request.status = 'rejected'.
 */
export function applyRejectStep(
  request: SpendRequest,
  actorRole: 'manager' | 'cmo' | 'finance',
  note?: string
): SpendRequest {
  const pendingIndex = getCurrentPendingStepIndex(request.approvalSteps);
  if (pendingIndex === -1) return request;
  
  const currentStep = request.approvalSteps[pendingIndex];
  if (currentStep.level !== actorRole) return request;
  
  const updatedSteps = request.approvalSteps.map((step, i) => {
    if (i === pendingIndex) {
      return {
        ...step,
        status: 'rejected' as const,
        updatedAt: new Date().toISOString(),
        comment: note || step.comment,
      };
    }
    return step;
  });
  
  return {
    ...request,
    approvalSteps: updatedSteps,
    status: 'rejected',
  };
}

/**
 * Gets a human-readable label for a request origin kind.
 */
export function getOriginKindLabel(kind: SpendRequest['originKind']): string {
  switch (kind) {
    case 'new_line_item':
      return 'New line item';
    case 'adjustment':
      return 'Adjustment';
    case 'delete_line_item':
      return 'Delete line item';
    case 'cancel_request':
      return 'Cancel request';
    default:
      return 'Spend request';
  }
}
