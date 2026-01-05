import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertCircle, ArrowLeft } from "lucide-react";
import type { ParsedImportData } from "@/types/import";

interface PreviewStepProps {
  data: ParsedImportData;
  onBack: () => void;
  onContinue: () => void;
}

const MAX_PREVIEW_ROWS = 25;

export function PreviewStep({ data, onBack, onContinue }: PreviewStepProps) {
  const { headers, rows, errors } = data;
  const previewRows = rows.slice(0, MAX_PREVIEW_ROWS);
  const hasMoreRows = rows.length > MAX_PREVIEW_ROWS;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Preview Imported Data</h2>
        <p className="text-sm text-muted-foreground">
          Review the parsed data before proceeding to mapping.
        </p>
      </div>

      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-1">Parsing errors detected:</p>
            <ul className="list-disc list-inside text-sm">
              {errors.slice(0, 5).map((error, i) => (
                <li key={i}>{error}</li>
              ))}
              {errors.length > 5 && (
                <li>...and {errors.length - 5} more errors</li>
              )}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="text-sm text-muted-foreground">
        Showing {previewRows.length} of {rows.length} rows
        {hasMoreRows && " (preview limited to first 25 rows)"}
      </div>

      {rows.length > 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-muted">
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  {headers.map((header) => (
                    <TableHead key={header} className="min-w-[120px]">
                      {header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewRows.map((row) => (
                  <TableRow key={row.rowIndex}>
                    <TableCell className="text-center text-muted-foreground">
                      {row.rowIndex}
                    </TableCell>
                    {headers.map((header) => (
                      <TableCell key={header} className="max-w-[200px] truncate">
                        {row.raw[header] || "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No data rows found in the CSV file.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Upload
        </Button>
        <Button onClick={onContinue} disabled={rows.length === 0}>
          Continue to Mapping
        </Button>
      </div>
    </div>
  );
}
