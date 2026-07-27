/**
 * React wrapper for <status-indicator> Lit element.
 * Uses @lit/react's createComponent for seamless React integration.
 *
 * Usage:
 *   import { StatusIndicator } from '@/components/lit/StatusIndicatorReact';
 *   <StatusIndicator state="error" message="Something broke" />
 */

import React from 'react';
import { createComponent } from '@lit/react';
import { StatusIndicator as StatusIndicatorLit } from './status-indicator';

export const StatusIndicator = createComponent({
  tagName: 'status-indicator',
  elementClass: StatusIndicatorLit,
  react: React,
  events: {},
});
