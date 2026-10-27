'use client';

import type { ReactNode } from 'react';
import { useSimpleMode } from '../lib/uiSettings';

/** Renders its children only when Simple UI is OFF. */
export function AdvancedOnly({ children }: { children: ReactNode }) {
  return useSimpleMode() ? null : <>{children}</>;
}

/** Renders its children only when Simple UI is ON. */
export function SimpleOnly({ children }: { children: ReactNode }) {
  return useSimpleMode() ? <>{children}</> : null;
}
