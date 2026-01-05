import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Tasks() {
  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Manage reminders and action items for forecast updates, reconciliation, and contract renewals."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Tasks keep your budget process on track. Get reminders to review forecasts, reconcile monthly actuals, and act on upcoming contract renewals before cancellation windows close.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Task list with status and due dates</li>
              <li>Automatic reminders for forecast review</li>
              <li>Contract renewal alerts</li>
              <li>Reconciliation due notifications</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
