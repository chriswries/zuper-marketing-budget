import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { mockCostCenters } from '@/data/mock-budget-data';

export default function Forecast() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast"
        description="Current forecast — updated throughout the year as plans change."
      />
      
      <SheetTable costCenters={mockCostCenters} valueType="forecastValues" />
    </div>
  );
}
