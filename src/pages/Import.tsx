import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";

export default function Import() {
  return (
    <div>
      <PageHeader
        title="Import Actuals"
        description="Upload and process CSV files from bank and Ramp to import actual spend transactions."
      />

      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            The Import wizard guides you through uploading transaction CSVs, normalizing vendor names, and mapping transactions to line items before posting to the Actuals sheet.
          </p>
          
          <div className="mt-4">
            <h3 className="font-medium text-foreground mb-2">Coming next:</h3>
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              <li>CSV upload interface (Bank + Ramp formats)</li>
              <li>Transaction preview and staging</li>
              <li>Vendor normalization and alias mapping</li>
              <li>Line item mapping UI</li>
              <li>Post to Actuals confirmation</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
