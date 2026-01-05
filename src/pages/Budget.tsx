import { useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SheetTable } from '@/components/sheet/SheetTable';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BudgetSetupWizard } from '@/components/budget/BudgetSetupWizard';
import { useFiscalYearBudget } from '@/contexts/FiscalYearBudgetContext';
import { CalendarPlus, FileSpreadsheet } from 'lucide-react';

export default function Budget() {
  const { selectedFiscalYear } = useFiscalYearBudget();
  const [wizardOpen, setWizardOpen] = useState(false);

  // Empty state: no selected FY or it doesn't exist
  if (!selectedFiscalYear) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Budget"
          description="Original annual budget by cost center and line item. Locked after approval."
        />
        
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-2">
              No Fiscal Year Budget Selected
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Start by creating a new fiscal year budget. You'll define your target budget and allocate it across cost centers.
            </p>
            <Button onClick={() => setWizardOpen(true)}>
              <CalendarPlus className="h-4 w-4 mr-2" />
              Start FY Budget
            </Button>
          </CardContent>
        </Card>

        <BudgetSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Budget — ${selectedFiscalYear.name}`}
        description={`Original annual budget (${selectedFiscalYear.status}). Target: $${selectedFiscalYear.targetBudget.toLocaleString()}`}
      />
      
      <SheetTable costCenters={selectedFiscalYear.costCenters} valueType="budgetValues" />
    </div>
  );
}
