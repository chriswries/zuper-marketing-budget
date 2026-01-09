import { useState, useMemo, useEffect } from "react";
import Papa from "papaparse";
import { Card, CardContent } from "@/components/ui/card";
import { UploadStep } from "./UploadStep";
import { PreviewStep } from "./PreviewStep";
import { MappingStep } from "./MappingStep";
import { ConfirmStep } from "./ConfirmStep";
import { VendorNormalizationStep } from "./VendorNormalizationStep";
import { LineItemMappingStep } from "./LineItemMappingStep";
import { PostToActualsStep } from "./PostToActualsStep";
import type { 
  ImportWizardStep, 
  ParsedImportData, 
  RawImportedRow,
  ColumnMapping,
  ImportedTransactionDraft,
  ImportedTransactionWithVendor,
  ImportedTransactionMapped,
  CanonicalVendor,
  VendorToLineItemMap,
  LineItemOption
} from "@/types/import";
import { cn } from "@/lib/utils";
import { useFiscalYearBudget } from "@/contexts/FiscalYearBudgetContext";
import { loadForecastForFYAsync } from "@/lib/forecastStore";
import type { CostCenter } from "@/types/budget";

const STEPS: { key: ImportWizardStep; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "preview", label: "Preview" },
  { key: "mapping", label: "Mapping" },
  { key: "confirm", label: "Confirm" },
  { key: "vendors", label: "Vendors" },
  { key: "line_items", label: "Line Items" },
  { key: "post", label: "Post" },
];

export function ImportWizard() {
  const { selectedFiscalYearId } = useFiscalYearBudget();
  const [currentStep, setCurrentStep] = useState<ImportWizardStep>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedImportData | null>(null);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping | null>(null);
  const [normalizedTransactions, setNormalizedTransactions] = useState<ImportedTransactionDraft[]>([]);
  const [vendorMappings, setVendorMappings] = useState<Record<string, string>>({});
  const [vendorNormalizedTransactions, setVendorNormalizedTransactions] = useState<ImportedTransactionWithVendor[]>([]);
  const [canonicalVendors, setCanonicalVendors] = useState<CanonicalVendor[]>([]);
  const [lineItemMappings, setLineItemMappings] = useState<VendorToLineItemMap>({});
  const [lineItemMappedTransactions, setLineItemMappedTransactions] = useState<ImportedTransactionMapped[]>([]);
  const [postedBatchId, setPostedBatchId] = useState<string | null>(null);
  const [forecastCostCenters, setForecastCostCenters] = useState<CostCenter[]>([]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  // Load forecast cost centers when FY is selected
  useEffect(() => {
    if (!selectedFiscalYearId) {
      setForecastCostCenters([]);
      return;
    }
    loadForecastForFYAsync(selectedFiscalYearId).then((costCenters) => {
      setForecastCostCenters(costCenters || []);
    });
  }, [selectedFiscalYearId]);

  // Build line item options from forecast cost centers
  const lineItemOptions: LineItemOption[] = useMemo(() => {
    const options: LineItemOption[] = [];
    for (const cc of forecastCostCenters) {
      for (const li of cc.lineItems) {
        options.push({
          lineItemId: li.id,
          lineItemName: li.name,
          costCenterId: cc.id,
          costCenterName: cc.name,
          vendorName: li.vendor?.name,
        });
      }
    }
    return options.sort((a, b) => {
      const ccCompare = a.costCenterName.localeCompare(b.costCenterName);
      if (ccCompare !== 0) return ccCompare;
      return a.lineItemName.localeCompare(b.lineItemName);
    });
  }, [forecastCostCenters]);

  // Derive allowed cost center IDs from existing line item mappings
  const allowedCostCenterIds: string[] = useMemo(() => {
    const mappedLineItemIds = Object.values(lineItemMappings);
    if (mappedLineItemIds.length === 0) return [];
    const costCenterIdSet = new Set<string>();
    for (const lineItemId of mappedLineItemIds) {
      const option = lineItemOptions.find(opt => opt.lineItemId === lineItemId);
      if (option) {
        costCenterIdSet.add(option.costCenterId);
      }
    }
    return Array.from(costCenterIdSet);
  }, [lineItemMappings, lineItemOptions]);

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
    setCurrentStep("line_items");
  };

  const handleBackToVendors = () => {
    setCurrentStep("vendors");
  };

  const handleLineItemMappingComplete = (result: {
    lineItemMappings: VendorToLineItemMap;
    transactions: ImportedTransactionMapped[];
  }) => {
    setLineItemMappings(result.lineItemMappings);
    setLineItemMappedTransactions(result.transactions);
    setCurrentStep("post");
  };

  const handleBackToLineItems = () => {
    setCurrentStep("line_items");
  };

  const handlePosted = (batchId: string) => {
    setPostedBatchId(batchId);
  };

  const handleFileSelect = (selectedFile: File | null) => {
    setFile(selectedFile);
    if (!selectedFile) {
      setParsedData(null);
      setColumnMapping(null);
      setNormalizedTransactions([]);
      setVendorMappings({});
      setVendorNormalizedTransactions([]);
      setLineItemMappings({});
      setLineItemMappedTransactions([]);
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
          {currentStep === "vendors" && normalizedTransactions.length > 0 && (
            <VendorNormalizationStep
              transactions={normalizedTransactions}
              initialMappings={vendorMappings}
              onBack={handleBackToConfirm}
              onContinue={handleVendorNormalizationComplete}
            />
          )}
          {currentStep === "line_items" && vendorNormalizedTransactions.length > 0 && (
            <LineItemMappingStep
              transactions={vendorNormalizedTransactions}
              lineItemOptions={lineItemOptions}
              allowedCostCenterIds={allowedCostCenterIds}
              initialMappings={lineItemMappings}
              onBack={handleBackToVendors}
              onContinue={handleLineItemMappingComplete}
            />
          )}
          {currentStep === "post" && lineItemMappedTransactions.length > 0 && (
            <PostToActualsStep
              transactions={lineItemMappedTransactions}
              fileName={file?.name}
              onBack={handleBackToLineItems}
              onPosted={handlePosted}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
