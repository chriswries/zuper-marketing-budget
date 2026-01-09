import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  CheckCircle2,
  Clock,
  XCircle,
  RotateCcw,
  Send,
  Plus,
  Bell,
  Search,
  X,
  FileText,
  Calendar,
  ExternalLink,
  Building2,
  Edit,
} from 'lucide-react';
import { ApprovalAuditEvent, ApprovalActorRole, ApprovalEntityType } from '@/types/approvalAudit';
import {
  loadAllApprovalAuditEvents,
  formatAuditEvent,
  APPROVAL_AUDIT_UPDATED_EVENT,
} from '@/lib/approvalAuditStore';
import { formatAuditTimestamp } from '@/lib/dateTime';
import { useRequests } from '@/contexts/RequestsContext';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { useAdminSettings } from '@/contexts/AdminSettingsContext';

type EntityFilter = 'all' | 'request' | 'budget' | 'vendor_registry';
type CategoryFilter = 'all' | 'approvals' | 'notifications';
type RoleFilter = 'all' | ApprovalActorRole;
type DatePreset = '24h' | '7d' | '30d' | 'custom';

const actionIcons: Record<string, React.ReactNode> = {
  created: <Plus className="h-4 w-4 text-muted-foreground" />,
  submitted_for_approval: <Send className="h-4 w-4 text-blue-500" />,
  approved_step: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  rejected_step: <XCircle className="h-4 w-4 text-destructive" />,
  reset: <RotateCcw className="h-4 w-4 text-muted-foreground" />,
  final_approved: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  notified_next_approver: <Bell className="h-4 w-4 text-blue-500" />,
  // Vendor registry actions
  vendor_created: <Plus className="h-4 w-4 text-green-600" />,
  vendor_updated: <Edit className="h-4 w-4 text-blue-500" />,
  vendor_deactivated: <XCircle className="h-4 w-4 text-amber-500" />,
  vendor_alias_created: <Plus className="h-4 w-4 text-green-600" />,
  vendor_alias_updated: <Edit className="h-4 w-4 text-blue-500" />,
  vendor_alias_deactivated: <XCircle className="h-4 w-4 text-amber-500" />,
};

const roleLabels: Record<ApprovalActorRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

const stepLabels: Record<string, string> = {
  manager: 'Manager',
  cmo: 'CMO',
  finance: 'Finance',
};

export default function ApprovalAudit() {
  const navigate = useNavigate();
  const { requests } = useRequests();
  const { fiscalYears, setSelectedFiscalYearId } = useFiscalYearBudget();
  const { settings: adminSettings } = useAdminSettings();

  const [events, setEvents] = useState<ApprovalAuditEvent[]>([]);
  
  // Filters
  const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [datePreset, setDatePreset] = useState<DatePreset>('7d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Load initial events
  useEffect(() => {
    loadAllApprovalAuditEvents().then(setEvents);
  }, []);

  // Listen for audit updates
  useEffect(() => {
    const handler = () => loadAllApprovalAuditEvents().then(setEvents);
    window.addEventListener(APPROVAL_AUDIT_UPDATED_EVENT, handler);
    return () => window.removeEventListener(APPROVAL_AUDIT_UPDATED_EVENT, handler);
  }, []);

  // Build lookup maps for context resolution
  const requestMap = useMemo(() => {
    const map = new Map<string, { vendorName: string; costCenterName: string; amount: number }>();
    requests.forEach((r) => {
      map.set(r.id, { vendorName: r.vendorName, costCenterName: r.costCenterName, amount: r.amount });
    });
    return map;
  }, [requests]);

  const budgetMap = useMemo(() => {
    const map = new Map<string, string>();
    fiscalYears.forEach((fy) => {
      map.set(fy.id, fy.name);
    });
    return map;
  }, [fiscalYears]);

  // Calculate date range based on preset
  const getDateRange = useMemo(() => {
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;

    if (datePreset === '24h') {
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    } else if (datePreset === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (datePreset === '30d') {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    } else if (datePreset === 'custom') {
      if (customStart) start = new Date(customStart);
      if (customEnd) end = new Date(customEnd + 'T23:59:59');
    }

    return { start, end };
  }, [datePreset, customStart, customEnd]);

  // Apply filters
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Entity type filter
      if (entityFilter !== 'all' && event.entityType !== entityFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter === 'notifications' && event.action !== 'notified_next_approver') {
        return false;
      }
      if (categoryFilter === 'approvals' && event.action === 'notified_next_approver') {
        return false;
      }

      // Role filter
      if (roleFilter !== 'all' && event.actorRole !== roleFilter) {
        return false;
      }

      // Date range filter
      const eventDate = new Date(event.timestamp);
      if (getDateRange.start && eventDate < getDateRange.start) {
        return false;
      }
      if (getDateRange.end && eventDate > getDateRange.end) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        
        // Search in request context
        if (event.entityType === 'request') {
          const reqInfo = requestMap.get(event.entityId);
          if (reqInfo) {
            if (
              reqInfo.vendorName.toLowerCase().includes(query) ||
              reqInfo.costCenterName.toLowerCase().includes(query)
            ) {
              return true;
            }
          }
          // Also match on entity ID
          if (event.entityId.toLowerCase().includes(query)) {
            return true;
          }
          return false;
        }

        // Search in budget context
        if (event.entityType === 'budget') {
          const budgetName = budgetMap.get(event.entityId);
          if (budgetName && budgetName.toLowerCase().includes(query)) {
            return true;
          }
          if (event.entityId.toLowerCase().includes(query)) {
            return true;
          }
          return false;
        }

        return false;
      }

      return true;
    });
  }, [events, entityFilter, categoryFilter, roleFilter, getDateRange, searchQuery, requestMap, budgetMap]);

  const handleRowClick = (event: ApprovalAuditEvent) => {
    if (event.entityType === 'request') {
      navigate(`/requests/${event.entityId}`);
    } else if (event.entityType === 'budget') {
      setSelectedFiscalYearId(event.entityId);
      navigate('/budget');
    }
    // vendor_registry events: no navigation for now (no vendor admin page yet)
  };

  const clearFilters = () => {
    setEntityFilter('all');
    setCategoryFilter('all');
    setRoleFilter('all');
    setDatePreset('7d');
    setCustomStart('');
    setCustomEnd('');
    setSearchQuery('');
  };

  const hasActiveFilters =
    entityFilter !== 'all' ||
    categoryFilter !== 'all' ||
    roleFilter !== 'all' ||
    datePreset !== '7d' ||
    searchQuery.trim() !== '';

  const getEntityContext = (event: ApprovalAuditEvent): string => {
    if (event.entityType === 'request') {
      const reqInfo = requestMap.get(event.entityId);
      if (reqInfo) {
        return `${reqInfo.vendorName} • ${reqInfo.costCenterName}`;
      }
      return `Request ${event.entityId.slice(0, 8)}...`;
    } else if (event.entityType === 'budget') {
      const budgetName = budgetMap.get(event.entityId);
      return budgetName || `Budget ${event.entityId.slice(0, 8)}...`;
    } else if (event.entityType === 'vendor_registry') {
      // Show vendor name from meta if available
      const meta = event.meta as { vendorName?: string; aliasDisplay?: string } | null;
      if (meta?.vendorName) {
        return meta.aliasDisplay 
          ? `${meta.vendorName} (alias: ${meta.aliasDisplay})`
          : meta.vendorName;
      }
      return `Vendor ${event.entityId.slice(0, 8)}...`;
    } else {
      return `${event.entityType} ${event.entityId.slice(0, 8)}...`;
    }
  };

  const getDetails = (event: ApprovalAuditEvent): string => {
    if (event.action === 'notified_next_approver' && event.meta) {
      const channel = event.meta.channel === 'slack' ? 'Slack' : 'Email';
      const part = event.meta.part === 'message' ? 'message' : event.meta.part === 'subject' ? 'subject' : 'body';
      return `${channel} ${part}`;
    }
    if (event.entityType === 'request') {
      const reqInfo = requestMap.get(event.entityId);
      if (reqInfo) {
        return `$${reqInfo.amount.toLocaleString()}`;
      }
    }
    return '';
  };

  return (
    <div>
      <PageHeader
        title="Approval Audit Log"
        description="View approval and notification activity across budgets and requests."
      />

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
            {/* Entity Type */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Entity</Label>
              <Select value={entityFilter} onValueChange={(v) => setEntityFilter(v as EntityFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="request">Requests</SelectItem>
                  <SelectItem value="budget">Budgets</SelectItem>
                  <SelectItem value="vendor_registry">Vendor Registry</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="approvals">Approvals</SelectItem>
                  <SelectItem value="notifications">Notifications</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Actor Role */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Actor Role</Label>
              <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="cmo">CMO</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Date Preset */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Date Range</Label>
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24 hours</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom range</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Search */}
            <div className="space-y-1.5 lg:col-span-2">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Vendor, cost center, budget name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

          {/* Custom date inputs */}
          {datePreset === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Clear filters */}
          {hasActiveFilters && (
            <div className="mt-4 pt-4 border-t flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''} found
              </span>
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear filters
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <ScrollArea className="h-[calc(100vh-380px)] min-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">Timestamp</TableHead>
                <TableHead className="w-[80px]">Entity</TableHead>
                <TableHead className="min-w-[180px]">Context</TableHead>
                <TableHead className="min-w-[200px]">Action</TableHead>
                <TableHead className="w-[90px]">Step</TableHead>
                <TableHead className="w-[80px]">Actor</TableHead>
                <TableHead className="w-[120px]">Details</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="h-8 w-8" />
                      <p>No audit events found</p>
                      {hasActiveFilters && (
                        <Button variant="link" onClick={clearFilters}>
                          Clear filters
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((event) => (
                  <TableRow
                    key={event.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleRowClick(event)}
                  >
                    <TableCell className="text-sm text-muted-foreground">
                      {formatAuditTimestamp(event.timestamp, adminSettings.timeZone)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs capitalize">
                        {event.entityType === 'request' ? (
                          <FileText className="h-3 w-3 mr-1" />
                        ) : event.entityType === 'budget' ? (
                          <Calendar className="h-3 w-3 mr-1" />
                        ) : event.entityType === 'vendor_registry' ? (
                          <Building2 className="h-3 w-3 mr-1" />
                        ) : (
                          <Clock className="h-3 w-3 mr-1" />
                        )}
                        {event.entityType === 'vendor_registry' ? 'vendor' : event.entityType}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-sm truncate max-w-[200px]">
                      {getEntityContext(event)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {actionIcons[event.action] ?? <Clock className="h-4 w-4 text-muted-foreground" />}
                        <span className="text-sm">{formatAuditEvent(event)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.stepLevel ? stepLabels[event.stepLevel] : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {roleLabels[event.actorRole]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {getDetails(event)}
                    </TableCell>
                    <TableCell>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </Card>
    </div>
  );
}
