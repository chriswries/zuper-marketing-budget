import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus } from 'lucide-react';
import { useRequests } from '@/contexts/RequestsContext';
import { CreateRequestDialog } from '@/components/requests/CreateRequestDialog';
import { MONTH_LABELS } from '@/types/budget';
import { mockCostCenters } from '@/data/mock-budget-data';

export default function Requests() {
  const navigate = useNavigate();
  const { requests, addRequest } = useRequests();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const costCenterOptions = mockCostCenters.map((cc) => ({
    id: cc.id,
    name: cc.name,
  }));

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
        description="Submit and track approval requests for new spend or changes that exceed limits."
      >
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Request
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">
              <p>No spend requests yet.</p>
              <p className="text-sm mt-1">
                Click "Create Request" to submit a new spend request for approval.
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
                {requests.map((request) => (
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

      <CreateRequestDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        costCenters={costCenterOptions}
        onCreateRequest={addRequest}
      />
    </div>
  );
}
