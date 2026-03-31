import { useState, useCallback, useEffect, useMemo } from 'react';
import { FiscalYearBudget, BudgetApprovalStep } from '@/contexts/FiscalYearBudgetContext';
import { ApprovalAuditEvent } from '@/types/approvalAudit';
import { loadApprovalAudit, appendApprovalAudit } from '@/lib/approvalAuditStore';
import { saveForecastForFY } from '@/lib/forecastStore';
import { createForecastCostCentersFromBudget } from '@/lib/forecastFromBudget';
import type { UserRole } from '@/contexts/CurrentUserRoleContext';

interface UseBudgetApprovalArgs {
  selectedFiscalYearId: string | null;
  selectedFiscalYear: FiscalYearBudget | null;
  updateFiscalYearBudget: (id: string, updater: (fy: FiscalYearBudget) => FiscalYearBudget) => Promise<void>;
  currentRole: UserRole;
}

export interface UseBudgetApprovalReturn {
  handleSubmitForApproval: () => void;
  handleApproveNextStep: () => void;
  handleReject: () => void;
  handleResetToDraft: () => void;
  nextPendingBudgetStep: BudgetApprovalStep | null;
  canApproveBudgetStep: boolean;
  approvalAuditEvents: ApprovalAuditEvent[];
  setApprovalAuditEvents: React.Dispatch<React.SetStateAction<ApprovalAuditEvent[]>>;
  submissionBlockers: string[];
  canSubmit: boolean;
  allocationsBalanced: boolean;
  hasPendingLineItems: boolean;
}

export function useBudgetApproval({
  selectedFiscalYearId,
  selectedFiscalYear,
  updateFiscalYearBudget,
  currentRole,
}: UseBudgetApprovalArgs): UseBudgetApprovalReturn {
  const [approvalAuditEvents, setApprovalAuditEvents] = useState<ApprovalAuditEvent[]>([]);

  // Determine the next pending budget approval step
  const nextPendingBudgetStep = useMemo(() => {
    if (!selectedFiscalYear?.approval?.steps) return null;
    return selectedFiscalYear.approval.steps.find((s) => s.status === 'pending') ?? null;
  }, [selectedFiscalYear]);

  // Role gating for budget approvals
  const canApproveBudgetStep = nextPendingBudgetStep?.level === currentRole;

  // Check if allocations are balanced
  const allocationsBalanced = useMemo(() => {
    if (!selectedFiscalYear) return false;
    const totalAllocated = selectedFiscalYear.costCenters.reduce(
      (sum, cc) => sum + cc.annualLimit,
      0
    );
    return Math.abs(totalAllocated - selectedFiscalYear.targetBudget) <= 1;
  }, [selectedFiscalYear]);

  // Check if any line items are pending approval (create or adjustment)
  const hasPendingLineItems = useMemo(() => {
    if (!selectedFiscalYear) return false;
    return selectedFiscalYear.costCenters.some((cc) =>
      cc.lineItems.some((item) => item.approvalStatus === 'pending' || item.adjustmentStatus === 'pending')
    );
  }, [selectedFiscalYear]);

  // Compute submission blockers
  const submissionBlockers = useMemo(() => {
    const blockers: string[] = [];
    if (!allocationsBalanced) {
      blockers.push('Allocations must balance to target budget');
    }
    if (hasPendingLineItems) {
      blockers.push('All line items must be approved before submission');
    }
    return blockers;
  }, [allocationsBalanced, hasPendingLineItems]);

  const canSubmit = submissionBlockers.length === 0;

  // Load audit events when FY changes
  useEffect(() => {
    if (selectedFiscalYearId) {
      loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
    } else {
      setApprovalAuditEvents([]);
    }
  }, [selectedFiscalYearId]);

  const handleSubmitForApproval = useCallback(() => {
    if (!selectedFiscalYearId || !canSubmit) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
      ...fy,
      updatedAt: new Date().toISOString(),
      approval: {
        ...fy.approval,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        approvedAt: undefined,
        rejectedAt: undefined,
        steps: [
          { level: 'cmo', status: 'pending' },
          { level: 'finance', status: 'pending' },
        ],
      },
    }));

    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'submitted_for_approval',
      actorRole: currentRole,
    });
    loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
  }, [selectedFiscalYearId, canSubmit, updateFiscalYearBudget, currentRole]);

  const handleApproveNextStep = useCallback(() => {
    if (!selectedFiscalYearId || !selectedFiscalYear) return;

    const stepLevel = nextPendingBudgetStep?.level;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      const steps = [...fy.approval.steps];
      const pendingIndex = steps.findIndex((s) => s.status === 'pending');

      if (pendingIndex === -1) return fy;

      steps[pendingIndex] = {
        ...steps[pendingIndex],
        status: 'approved',
        updatedAt: new Date().toISOString(),
      };

      const allApproved = steps.every((s) => s.status === 'approved');
      const now = new Date().toISOString();

      if (allApproved) {
        // Fire and forget - async forecast creation
        createForecastCostCentersFromBudget({
          ...fy,
          approval: { ...fy.approval, steps },
        }).catch((err) => logger.error('Failed to create forecast from budget:', err));
      }

      return {
        ...fy,
        updatedAt: now,
        status: allApproved ? 'active' : fy.status,
        approval: {
          ...fy.approval,
          steps,
          status: allApproved ? 'approved' : 'pending',
          approvedAt: allApproved ? now : undefined,
        },
      };
    });

    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'approved_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'cmo' | 'finance',
    });

    const steps = selectedFiscalYear.approval?.steps ?? [];
    const pendingCount = steps.filter((s) => s.status === 'pending').length;
    if (pendingCount === 1) {
      appendApprovalAudit('budget', selectedFiscalYearId, {
        action: 'final_approved',
        actorRole: currentRole,
      });
    }

    loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
  }, [selectedFiscalYearId, selectedFiscalYear, updateFiscalYearBudget, currentRole, nextPendingBudgetStep]);

  const handleReject = useCallback(() => {
    if (!selectedFiscalYearId) return;

    const stepLevel = nextPendingBudgetStep?.level;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => {
      const steps = [...fy.approval.steps];
      const pendingIndex = steps.findIndex((s) => s.status === 'pending');

      if (pendingIndex !== -1) {
        steps[pendingIndex] = {
          ...steps[pendingIndex],
          status: 'rejected',
          updatedAt: new Date().toISOString(),
        };
      }

      return {
        ...fy,
        updatedAt: new Date().toISOString(),
        approval: {
          ...fy.approval,
          steps,
          status: 'rejected',
          rejectedAt: new Date().toISOString(),
        },
      };
    });

    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'rejected_step',
      actorRole: currentRole,
      stepLevel: stepLevel as 'cmo' | 'finance',
    });
    loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
  }, [selectedFiscalYearId, updateFiscalYearBudget, currentRole, nextPendingBudgetStep]);

  const handleResetToDraft = useCallback(() => {
    if (!selectedFiscalYearId) return;

    updateFiscalYearBudget(selectedFiscalYearId, (fy) => ({
      ...fy,
      updatedAt: new Date().toISOString(),
      status: 'planning',
      approval: {
        status: 'draft',
        steps: [
          { level: 'cmo', status: 'pending' },
          { level: 'finance', status: 'pending' },
        ],
        submittedAt: undefined,
        approvedAt: undefined,
        rejectedAt: undefined,
      },
    }));

    appendApprovalAudit('budget', selectedFiscalYearId, {
      action: 'reset',
      actorRole: currentRole,
    });
    loadApprovalAudit('budget', selectedFiscalYearId).then(setApprovalAuditEvents);
  }, [selectedFiscalYearId, updateFiscalYearBudget, currentRole]);

  return {
    handleSubmitForApproval,
    handleApproveNextStep,
    handleReject,
    handleResetToDraft,
    nextPendingBudgetStep,
    canApproveBudgetStep,
    approvalAuditEvents,
    setApprovalAuditEvents,
    submissionBlockers,
    canSubmit,
    allocationsBalanced,
    hasPendingLineItems,
  };
}
