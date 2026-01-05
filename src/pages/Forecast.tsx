import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Forecast() {
  return (
    <div>
      <PageHeader
        title="Forecast"
        description="Edit and manage the current forecast. Adjust spend projections while staying within approved limits."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            The Forecast sheet is your primary workspace for managing marketing spend throughout the year. Edit line item values, add new spend, and track variances against the original budget.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Inline editing of monthly cells</li>
              <li>Automatic rollups to cost center and total</li>
              <li>Locked months indicator (post-reconciliation)</li>
              <li>Over-budget warnings and limit enforcement</li>
              <li>Cell-level audit log</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
