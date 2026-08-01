export interface AiVideoRunListQuery {
  search?: string;
  lane?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AiVideoRunSummary {
  id: string;
  lane: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  workflowVersion: string;
  importedAt: string;
}

export interface AiVideoStageTimelineItem {
  stageKey: string;
  attemptId: string | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AiVideoArtifact {
  id: string;
  stageKey: string;
  logicalType: string;
  storageKey: string;
  mimeType: string;
  sizeInBytes: number;
  confidence: string;
  version: number;
  locator: string;
}

export interface AiVideoReconciliationEvent {
  id: string;
  stageKey: string;
  conflictType: string;
  expectedChecksum: string;
  observedChecksum: string;
  message: string;
  importedAt: string;
}

export interface AiVideoRunDetail {
  id: string;
  lane: string;
  status: string;
  windowStart: string;
  windowEnd: string;
  workflowVersion: string;
  contractVersion: string;
  correlationId: string;
  importedAt: string;
  timeline: AiVideoStageTimelineItem[];
  artifacts: AiVideoArtifact[];
  reconciliationEvents: AiVideoReconciliationEvent[];
}

export interface AiVideoStatusInfo {
  isHealthy: boolean;
  importedRunCount: number;
  artifactCount: number;
  importBatchCount: number;
  workerStatus: string;
  providerConfigurationStatus: string;
}
