import React from 'react';
import styles from './ControlBar.module.css';

/**
 * Control bar — placeholder, nothing rendered.
 * Run and Save Template buttons exist elsewhere in the UI.
 */
export interface ControlBarProps {
  versionText?: string;
  onRun?: () => void;
  onSave?: () => void;
  runShortcut?: string;
  saveShortcut?: string;
  isSaving?: boolean;
  onTitleChange?: (newTitle: string) => void;
}

export function ControlBar({
  versionText = 'Editing Version 8',
  onRun = () => {},
  onSave = () => {},
  runShortcut = '⌘ ⏎',
  saveShortcut = '⌘ S',
}: ControlBarProps) {
  return (
    <div data-tag="control-bar" className={styles.container} data-component="ControlBar">
      {/* placeholder bar — nothing rendered */}
    </div>
  );
}