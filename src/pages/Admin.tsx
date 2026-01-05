import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Admin() {
  return (
    <div>
      <PageHeader
        title="Admin Settings"
        description="Configure fiscal years, cost centers, vendors, users, and approval workflows."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Admin settings control the core configuration of your budget system. Manage fiscal years, define cost center structures, maintain vendor lists, and configure approval routing rules.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Fiscal year management (create, activate, close)</li>
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
  );
}
