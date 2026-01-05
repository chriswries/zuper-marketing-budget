import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, Info } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { MONTH_LABELS } from '@/types/budget';
import { Alert, AlertDescription } from '@/components/ui/alert';

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

export default function Requests() {
  const navigate = useNavigate();
  const { requests } = useRequests();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredRequests = useMemo(() => {
    return requests
      .filter((request) => {
        // Status filter
        if (statusFilter !== 'all' && request.status !== statusFilter) {
          return false;
        }
        // Search filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchesVendor = request.vendorName.toLowerCase().includes(query);
          const matchesCostCenter = request.costCenterName.toLowerCase().includes(query);
          if (!matchesVendor && !matchesCostCenter) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [requests, statusFilter, searchQuery]);

  const isFiltered = statusFilter !== 'all' || searchQuery.trim() !== '';

  const statusVariant = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'rejected':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <div>
      <PageHeader
        title="Spend Requests"
        description="Track approval requests for new spend or changes that exceed limits."
      />

      <Alert className="mb-4">
        <Info className="h-4 w-4" />
        <AlertDescription className="flex items-center justify-between">
          <span>Requests are initiated from Forecast when adding a new line item.</span>
          <Button variant="link" asChild className="p-0 h-auto">
            <Link to="/forecast">Go to Forecast</Link>
          </Button>
        </AlertDescription>
      </Alert>

      <div className="flex flex-col sm:flex-row gap-4 mb-4">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)} className="w-full sm:w-auto">
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="pending">Pending</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search vendor or cost center..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {isFiltered && (
        <p className="text-sm text-muted-foreground mb-2">
          Showing {filteredRequests.length} of {requests.length}
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <p>No spend requests yet.</p>
              <p className="text-sm mt-1">
                Add a new line item in the Forecast to create a spend request.
              </p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <p>No matching requests found.</p>
              <p className="text-sm mt-1">
                Try adjusting your filters or search query.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Cost Center</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow
                    key={request.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigate(`/requests/${request.id}`)}
                  >
                    <TableCell>
                      <Badge variant={statusVariant(request.status)}>
                        {request.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{request.costCenterName}</TableCell>
                    <TableCell>{request.vendorName}</TableCell>
                    <TableCell className="text-right">
                      ${request.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {MONTH_LABELS[request.startMonth]} – {MONTH_LABELS[request.endMonth]}
                    </TableCell>
                    <TableCell>
                      {new Date(request.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}