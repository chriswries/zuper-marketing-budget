import { SpendRequest } from '@/types/requests';
import { ApprovalLevel } from '@/types/requests';
import { MONTH_LABELS } from '@/types/budget';

const ROLE_LABELS: Record<ApprovalLevel | 'cmo' | 'finance', string> = {
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

// ============ Spend Request Templates ============

interface RequestTemplateArgs {
  request: SpendRequest;
  nextLevel: ApprovalLevel;
  links: { requestUrl: string; sheetUrl?: string };
}

export function buildRequestSlackTemplate(args: RequestTemplateArgs): string {
  const { request, nextLevel, links } = args;
  const roleLabel = ROLE_LABELS[nextLevel];
  const dateRange = `${MONTH_LABELS[request.startMonth]} – ${MONTH_LABELS[request.endMonth]}`;
  
  let message = `👋 Hi ${roleLabel},

A spend request needs your approval:

• *Vendor:* ${request.vendorName}
• *Cost Center:* ${request.costCenterName}
• *Amount:* $${request.amount.toLocaleString()}
• *Period:* ${dateRange}
• *Contracted:* ${request.isContracted ? 'Yes' : 'No'}`;

  if (request.justification) {
    const justificationExcerpt = request.justification.length > 100 
      ? request.justification.slice(0, 100) + '...'
      : request.justification;
    message += `\n• *Justification:* ${justificationExcerpt}`;
  }

  message += `\n\n🔗 *Review request:* ${links.requestUrl}`;

  if (links.sheetUrl) {
    message += `\n📊 *View in sheet:* ${links.sheetUrl}`;
  }

  message += `\n\nPlease review and take action at your earliest convenience.`;

  return message;
}

export function buildRequestEmailSubject(args: { request: SpendRequest; nextLevel: ApprovalLevel }): string {
  const { request } = args;
  return `[Action Required] Spend Request: ${request.vendorName} - $${request.amount.toLocaleString()}`;
}

export function buildRequestEmailBody(args: RequestTemplateArgs): string {
  const { request, nextLevel, links } = args;
  const roleLabel = ROLE_LABELS[nextLevel];
  const dateRange = `${MONTH_LABELS[request.startMonth]} – ${MONTH_LABELS[request.endMonth]}`;

  let body = `Hi ${roleLabel},

A spend request is waiting for your approval.

REQUEST DETAILS
---------------
Vendor: ${request.vendorName}
Cost Center: ${request.costCenterName}
Amount: $${request.amount.toLocaleString()}
Period: ${dateRange}
Contracted: ${request.isContracted ? 'Yes' : 'No'}`;

  if (request.justification) {
    body += `\nJustification: ${request.justification}`;
  }

  body += `

ACTIONS
-------
Review and approve/reject: ${links.requestUrl}`;

  if (links.sheetUrl) {
    body += `\nView line item in sheet: ${links.sheetUrl}`;
  }

  body += `

Please review and take action at your earliest convenience.

Thank you.`;

  return body;
}

// ============ Budget Approval Templates ============

interface BudgetTemplateArgs {
  budgetName: string;
  nextLevel: 'cmo' | 'finance';
  links: { budgetUrl: string };
}

export function buildBudgetSlackTemplate(args: BudgetTemplateArgs): string {
  const { budgetName, nextLevel, links } = args;
  const roleLabel = ROLE_LABELS[nextLevel];

  return `👋 Hi ${roleLabel},

The *${budgetName}* budget is ready for your approval.

🔗 *Review budget:* ${links.budgetUrl}

Please review and take action at your earliest convenience.`;
}

export function buildBudgetEmailSubject(args: { budgetName: string; nextLevel: 'cmo' | 'finance' }): string {
  return `[Action Required] Budget Approval: ${args.budgetName}`;
}

export function buildBudgetEmailBody(args: BudgetTemplateArgs): string {
  const { budgetName, nextLevel, links } = args;
  const roleLabel = ROLE_LABELS[nextLevel];

  return `Hi ${roleLabel},

The ${budgetName} budget is ready for your approval.

ACTIONS
-------
Review and approve/reject: ${links.budgetUrl}

Please review and take action at your earliest convenience.

Thank you.`;
}

// ============ Link Builders ============

export function buildRequestUrl(requestId: string): string {
  return `${window.location.origin}/requests/${requestId}`;
}

export function buildSheetUrl(request: SpendRequest): string | undefined {
  if (!request.originSheet || !request.originLineItemId) return undefined;

  const params = new URLSearchParams();
  if (request.originCostCenterId) params.set('focusCostCenterId', request.originCostCenterId);
  params.set('focusLineItemId', request.originLineItemId);

  if (request.originSheet === 'budget') {
    return `${window.location.origin}/budget?${params.toString()}`;
  } else {
    if (request.originFiscalYearId === null) {
      params.set('forecastMode', 'legacy');
    }
    return `${window.location.origin}/forecast?${params.toString()}`;
  }
}

export function buildBudgetUrl(fiscalYearId?: string): string {
  if (fiscalYearId) {
    return `${window.location.origin}/budget?fyId=${fiscalYearId}`;
  }
  return `${window.location.origin}/budget`;
}
