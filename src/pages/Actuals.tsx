import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Actuals() {
  return (
    <div>
      <PageHeader
        title="Actuals"
        description="View imported actual spend from bank and Ramp transactions. Reconcile against forecast each month."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            The Actuals sheet displays real spend data imported from CSV files. Compare against forecast, identify variances, and lock months after reconciliation is complete.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Read-only view of imported transactions rolled up by line item</li>
              <li>Variance display (Forecast vs Actuals)</li>
              <li>Unmatched transaction highlighting</li>
              <li>Month lock controls</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
