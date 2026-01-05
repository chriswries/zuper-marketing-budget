import { useRef } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface UploadStepProps {
  file: File | null;
  onFileSelect: (file: File | null) => void;
  onContinue: () => void;
}

export function UploadStep({ file, onFileSelect, onContinue }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    onFileSelect(selectedFile);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.name.endsWith('.csv')) {
      onFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const clearFile = () => {
    onFileSelect(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Upload CSV File</h2>
        <p className="text-sm text-muted-foreground">
          Upload a CSV file from your bank or Ramp to import transactions.
        </p>
      </div>

      {!file ? (
        <Card
          className="border-2 border-dashed cursor-pointer hover:border-primary/50 transition-colors"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Upload className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-sm font-medium mb-1">
              Drop your CSV file here or click to browse
            </p>
            <p className="text-xs text-muted-foreground">
              Supports .csv files
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <FileText className="h-8 w-8 text-primary" />
              <div>
                <p className="font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={clearFile}>
              <X className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileChange}
      />

      <div className="flex justify-end">
        <Button onClick={onContinue} disabled={!file}>
          Continue to Preview
        </Button>
      </div>
    </div>
  );
}
