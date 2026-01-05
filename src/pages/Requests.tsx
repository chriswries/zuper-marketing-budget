import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Requests() {
  return (
    <div>
      <PageHeader
        title="Spend Requests"
        description="Submit and track approval requests for new spend or changes that exceed limits."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            Spend Requests enable controlled budget changes. When adding new line items or exceeding cost center limits, requests route through a configurable approval workflow (IC → Manager → CMO → Finance).
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>Create new spend request form</li>
              <li>Request list with status filtering</li>
              <li>Approval timeline visualization</li>
              <li>Comments and attachment support</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
