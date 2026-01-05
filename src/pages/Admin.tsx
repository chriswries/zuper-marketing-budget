import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BudgetSetupWizard } from "@/components/budget/BudgetSetupWizard";
import { CalendarPlus } from "lucide-react";

export default function Admin() {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Admin Settings"
        description="Configure fiscal years, cost centers, vendors, users, and approval workflows."
      />

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-medium text-foreground">Fiscal Year Budgets</h3>
                <p className="text-sm text-muted-foreground">
                  Create and manage fiscal year budgets
                </p>
              </div>
              <Button onClick={() => setWizardOpen(true)}>
                <CalendarPlus className="h-4 w-4 mr-2" />
                Start FY Budget
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground">
              Admin settings control the core configuration of your budget system. Manage fiscal years, define cost center structures, maintain vendor lists, and configure approval routing rules.
            </p>
            
            <div className="mt-4">
              <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                <li>Cost center configuration and limits</li>
                <li>Vendor list and alias management</li>
                <li>User and role management</li>
                <li>Approval workflow configuration</li>
                <li>Task/reminder templates</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <BudgetSetupWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
