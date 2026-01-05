import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';

export default function Actuals() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Actuals"
        description="Imported spend from bank and Ramp — reconciled monthly against forecast."
      />
      
      <SheetTable costCenters={mockCostCenters} valueType="actualValues" />
    </div>
  );
}
