import { PageHeader } from "@/components/layout/PageHeader";
import { ImportWizard } from "@/components/import/ImportWizard";

export default function Import() {
  return (
    <div>
      <PageHeader
        title="Import Actuals"
        description="Upload and process CSV files from bank and Ramp to import actual spend transactions."
      />
      <ImportWizard />
    </div>
  );
}
