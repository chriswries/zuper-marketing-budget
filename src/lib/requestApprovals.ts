import { SpendRequest, ApprovalStep, ApprovalLevel } from '@/types/requests';

/**
 * Gets the next pending approval step for a request.
 * Returns null if no pending steps or request is not pending.
 */
export function getNextPendingStep(request: SpendRequest): ApprovalStep | null {
  if (request.status !== 'pending') return null;
  if (!request.approvalSteps || request.approvalSteps.length === 0) return null;
  
  return request.approvalSteps.find(step => step.status === 'pending') || null;
}

/**
 * Returns a human-readable label for an approval level.
 */
export function getApproverLabel(level: ApprovalLevel): string {
  switch (level) {
    case 'manager':
      return 'Manager';
    case 'cmo':
      return 'CMO';
    case 'finance':
      return 'Finance';
    default:
      return level;
  }
}

/**
 * Checks if the given role can approve the request's current pending step.
 */
export function canRoleApproveRequest(
  request: SpendRequest, 
  role: 'admin' | 'manager' | 'cmo' | 'finance'
): boolean {
  if (role === 'admin') return false; // Admin cannot approve requests
  const nextStep = getNextPendingStep(request);
  if (!nextStep) return false;
  return nextStep.level === role;
}
