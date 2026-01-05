import { useState, useMemo } from "react";
import Papa from "papaparse";
import { Card, CardContent } from "@/components/ui/card";
import { UploadStep } from "./UploadStep";
import { PreviewStep } from "./PreviewStep";
import { MappingStep } from "./MappingStep";
import { ConfirmStep } from "./ConfirmStep";
import { VendorNormalizationStep } from "./VendorNormalizationStep";
import type { 
  ImportWizardStep, 
  ParsedImportData, 
  RawImportedRow,
  ColumnMapping,
  ImportedTransactionDraft,
  ImportedTransactionWithVendor,
  CanonicalVendor
} from "@/types/import";
import { cn } from "@/lib/utils";
import { mockVendors } from "@/data/mock-budget-data";

const STEPS: { key: ImportWizardStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Preview" },
  { key: "mapping", label: "Mapping" },
  { key: "confirm", label: "Confirm" },
  { key: "vendors", label: "Vendors" },
];

export function ImportWizard() {
  const [currentStep, setCurrentStep] = useState<ImportWizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedImportData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [normalizedTransactions, setNormalizedTransactions] = useState<ImportedTransactionDraft[]>([]);
  const [vendorMappings, setVendorMappings] = useState<Record<string, string>>({});
  const [vendorNormalizedTransactions, setVendorNormalizedTransactions] = useState<ImportedTransactionWithVendor[]>([]);
  const [canonicalVendors, setCanonicalVendors] = useState<CanonicalVendor[]>([]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  // Initialize canonical vendors from mock data
  const initialCanonicalVendors = useMemo(() => {
    const vendors: CanonicalVendor[] = mockVendors.map(v => ({
      id: v.id,
      name: v.name,
    }));
    return vendors.sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const parseFile = (file: File): Promise<ParsedImportData> => {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields || [];
          const rows: RawImportedRow[] = (results.data as Record<string, string>[]).map(
            (raw, index) => ({
              rowIndex: index + 1,
              raw,
            })
          );
          const errors = results.errors.map(
            (e) => `Row ${e.row !== undefined ? e.row + 1 : "?"}: ${e.message}`
          );
          resolve({ headers, rows, errors });
        },
        error: (error) => {
          resolve({
            headers: [],
            rows: [],
            errors: [`Failed to parse CSV: ${error.message}`],
          });
        },
      });
    });
  };

  const handleContinueToPreview = async () => {
    if (!file) return;
    const data = await parseFile(file);
    setParsedData(data);
    setCurrentStep("preview");
  };

  const handleBackToUpload = () => {
    setCurrentStep("upload");
  };

  const handleContinueToMapping = () => {
    setCurrentStep("mapping");
  };

  const handleBackToPreview = () => {
    setCurrentStep("preview");
  };

  const handleContinueToConfirm = (result: { mapping: ColumnMapping; transactions: ImportedTransactionDraft[] }) => {
    setColumnMapping(result.mapping);
    setNormalizedTransactions(result.transactions);
    setCurrentStep("confirm");
  };

  const handleBackToMapping = () => {
    setCurrentStep("mapping");
  };

  const handleContinueToVendors = () => {
    setCurrentStep("vendors");
  };

  const handleBackToConfirm = () => {
    setCurrentStep("confirm");
  };

  const handleVendorNormalizationComplete = (result: {
    vendorMappings: Record<string, string>;
    transactions: ImportedTransactionWithVendor[];
    canonicalVendors: CanonicalVendor[];
  }) => {
    setVendorMappings(result.vendorMappings);
    setVendorNormalizedTransactions(result.transactions);
    setCanonicalVendors(result.canonicalVendors);
    // Next step would be line item mapping - for now just stay on vendors
  };

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (!selectedFile) {
      setParsedData(null);
      setColumnMapping(null);
      setNormalizedTransactions([]);
      setVendorMappings({});
      setVendorNormalizedTransactions([]);
    }
  };

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((step, index) => (
          <div key={step.key} className="flex items-center">
            <div
              className={cn(
                "flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors",
                index < currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : index === currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {index + 1}
            </div>
            <span
              className={cn(
                "ml-2 text-sm hidden sm:inline",
                index === currentStepIndex
                  ? "font-medium text-foreground"
                  : "text-muted-foreground"
              )}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  "w-8 sm:w-12 h-0.5 mx-2",
                  index < currentStepIndex ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {currentStep === "upload" && (
            <UploadStep
              file={file}
              onFileSelect={handleFileSelect}
              onContinue={handleContinueToPreview}
            />
          )}
          {currentStep === "preview" && parsedData && (
            <PreviewStep 
              data={parsedData} 
              onBack={handleBackToUpload} 
              onContinue={handleContinueToMapping}
            />
          )}
          {currentStep === "mapping" && parsedData && (
            <MappingStep
              data={parsedData}
              onBack={handleBackToPreview}
              onContinue={handleContinueToConfirm}
            />
          )}
          {currentStep === "confirm" && (
            <ConfirmStep
              transactions={normalizedTransactions}
              onBack={handleBackToMapping}
              onContinue={handleContinueToVendors}
            />
          )}
          {currentStep === "vendors" && (
            <VendorNormalizationStep
              transactions={normalizedTransactions}
              canonicalVendors={canonicalVendors.length > 0 ? canonicalVendors : initialCanonicalVendors}
              initialMappings={vendorMappings}
              onBack={handleBackToConfirm}
              onContinue={handleVendorNormalizationComplete}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
