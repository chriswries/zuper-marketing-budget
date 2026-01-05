import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Reports() {
  return (
    <div>
      <PageHeader
        title="Reports"
        description="View dashboards and analytics for budget performance, variances, and spending trends."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Reports provide real-time visibility into marketing spend. Track budget vs forecast vs actuals, monitor burn rate, and identify cost center trends.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Budget vs Forecast vs Actuals by month</li>
              <li>Variance to plan (absolute + %)</li>
              <li>Burn rate / runway dashboard</li>
              <li>Cost center leaderboard</li>
              <li>Forecast accuracy over time</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
