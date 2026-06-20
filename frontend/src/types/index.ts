export interface CanFrame {
  id: string;
  timestamp: number;
  arbitrationId: number;
  dlc: number;
  data: string;
  decoded: Record<string, number>;
  direction: 'RX' | 'TX';
}

export interface DbcSignal {
  name: string;
  startBit: number;
  bitLength: number;
  factor: number;
  offset: number;
  unit: string;
  minValue: number;
  maxValue: number;
  messageId: number;
}

export interface DbcMessage {
  id: number;
  name: string;
  dlc: number;
  sender: string;
  signals: DbcSignal[];
}

export interface BusStats {
  totalFrames: number;
  rxCount: number;
  txCount: number;
  errorCount: number;
  busLoad: number;
  lastUpdate: number;
}

export type ValidationSeverity = 'error' | 'warning' | 'info';

export type ValidationCategory =
  | 'missing_definition'
  | 'duplicate_signal'
  | 'undecodable_frame'
  | 'signal_overlap'
  | 'invalid_dlc'
  | 'value_out_of_range';

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  category: ValidationCategory;
  title: string;
  description: string;
  suggestion: string;
  messageId?: number;
  signalName?: string;
  frameId?: string;
  timestamp?: number;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  lastValidated: number;
}

export interface ValidationSummary {
  missingDefinitions: number;
  duplicateSignals: number;
  undecodableFrames: number;
  signalOverlaps: number;
  invalidDlcs: number;
  valueOutOfRanges: number;
}
