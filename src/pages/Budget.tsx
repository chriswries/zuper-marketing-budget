import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Budget() {
  return (
    <div>
      <PageHeader
        title="Budget"
        description="View the original annual budget by cost center and line item. This is the locked baseline for the fiscal year."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            The Budget sheet displays the approved annual marketing budget broken down by cost centers (parent rows) and line items (child rows), with monthly columns from February through January plus an FY total.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Read-only spreadsheet view with cost center rollups</li>
              <li>Monthly columns (Feb → Jan) + FY Total</li>
              <li>Visual indicators for contracted spend</li>
              <li>Lock status display</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
