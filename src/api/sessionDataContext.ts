import { createContext, useContext } from 'react';
import type { ScanStatus } from '../../shared/types/index.js';

/** Shared freshness and processing state for pages with their own data requests. */
export const SessionDataContext = createContext<{ revision: number; scan: ScanStatus | null }>({ revision: 0, scan: null });
export const useSessionDataContext = () => useContext(SessionDataContext);
