import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';

export default function Budget() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Budget"
        description="Original annual budget by cost center and line item. Locked after approval."
      />
      
      <SheetTable costCenters={mockCostCenters} valueType="budgetValues" />
    </div>
  );
}
