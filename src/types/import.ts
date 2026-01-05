export interface RawImportedRow {
  rowIndex: number;
  raw: Record<string, string>;
}

export interface ParsedImportData {
  headers: string[];
  rows: RawImportedRow[];
  errors: string[];
}

export type ImportWizardStep = 'upload' | 'preview' | 'mapping' | 'confirm';
