import type { ReplayMetadata } from '../../../shared/types/index.js';

export interface StoredReplayFileInfo {
  file_path: string;
  file_mtime_ms: number;
  file_size_bytes: number;
  metadata: ReplayMetadata;
}
