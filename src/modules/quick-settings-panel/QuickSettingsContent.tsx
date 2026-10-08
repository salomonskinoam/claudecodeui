import {
  Brain,
  Eye,
  Languages,
  Mic,
  Moon,
  Sun,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DarkModeToggle } from '@/shared/ui';
import { LanguageSelector } from '@/modules/i18n';
import { SETTING_ROW_CLASS } from '@/shared/constants';
import type { PreferenceToggleKey, QuickSettingsPreferences } from '@/shared/types';
import QuickSettingsSection from '@/modules/quick-settings-panel/QuickSettingsSection';
import QuickSettingsToggleRow from '@/modules/quick-settings-panel/QuickSettingsToggleRow';

/** Declarative description of one quick settings toggle row - its preference key, translation key and icon - so the rows can be rendered from a list instead of hand-written. */
type PreferenceToggleItem = {
  key: PreferenceToggleKey;
  labelKey: string;
  icon: LucideIcon;
};

const TOOL_DISPLAY_TOGGLES: PreferenceToggleItem[] = [
  {
    key: 'showRawParameters',
    labelKey: 'quickSettings.showRawParameters',
    icon: Eye,
  },
  {
    key: 'showThinking',
    labelKey: 'quickSettings.showThinking',
    icon: Brain,
  },
];

const INPUT_SETTING_TOGGLES: PreferenceToggleItem[] = [
  {
    key: 'sendByCtrlEnter',
    labelKey: 'quickSettings.sendByCtrlEnter',
    icon: Languages,
  },
  {
    key: 'voiceEnabled',
    labelKey: 'quickSettings.voiceEnabled',
    icon: Mic,
  },
];

type QuickSettingsContentProps = {
  isDarkMode: boolean;
  preferences: QuickSettingsPreferences;
  onPreferenceChange: (key: PreferenceToggleKey, value: boolean) => void;
};

/**
 * quests: text size slider. Sets --base, the size every text size follows (public/cloudcli-custom.css).
 * The value lives in localStorage under quests-font-base; cloudcli-custom.js applies it at page load and
 * keeps the split-screen pane in step through the storage event.
 */
function TextSizeRow() {
  const [size, setSize] = useState(() => {
    try {
      return Number(localStorage.getItem('quests-font-base')) || 19.75;
    } catch {
      return 19.75;
    }
  });

  const changeSize = (next: number) => {
    setSize(next);
    document.documentElement.style.setProperty('--base', `${next}px`);
    try {
      localStorage.setItem('quests-font-base', String(next));
    } catch {
      // Storage blocked: the size resets on reload.
    }
  };

  return (
    <div className={SETTING_ROW_CLASS}>
      <span className="flex items-center gap-2 text-sm text-foreground">
        <Type className="h-4 w-4 text-muted-foreground" />
        Text size
      </span>
      <span className="flex items-center gap-2">
        <input
          type="range"
          min={12}
          max={32}
          step={0.25}
          value={size}
          onChange={(event) => changeSize(Number(event.target.value))}
          className="w-28"
        />
        <span className="w-14 text-right text-xs text-muted-foreground">{size}px</span>
      </span>
    </div>
  );
}

/** Rendered by QuickSettingsPanelView to show the drawer's appearance, tool display and input preference rows. */
export default function QuickSettingsContent({
  isDarkMode,
  preferences,
  onPreferenceChange,
}: QuickSettingsContentProps) {
  const { t } = useTranslation('settings');
  const inputSettingToggles = preferences.voiceEnabled
    ? INPUT_SETTING_TOGGLES
    : INPUT_SETTING_TOGGLES.filter(({ key }) => key !== 'voiceEnabled');

  const renderToggleRows = (items: PreferenceToggleItem[]) => (
    items.map(({ key, labelKey, icon }) => (
      <QuickSettingsToggleRow
        key={key}
        label={t(labelKey)}
        icon={icon}
        checked={preferences[key]}
        onCheckedChange={(value) => onPreferenceChange(key, value)}
      />
    ))
  );

  return (
    <div className="flex-1 space-y-6 overflow-y-auto overflow-x-hidden bg-background p-4">
      <QuickSettingsSection title={t('quickSettings.sections.appearance')}>
        <div className={SETTING_ROW_CLASS}>
          <span className="flex items-center gap-2 text-sm text-foreground">
            {isDarkMode ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-muted-foreground" />
            )}
            {t('quickSettings.darkMode')}
          </span>
          <DarkModeToggle />
        </div>
        <LanguageSelector compact />
        <TextSizeRow />
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.toolDisplay')}>
        {renderToggleRows(TOOL_DISPLAY_TOGGLES)}
      </QuickSettingsSection>

      <QuickSettingsSection title={t('quickSettings.sections.inputSettings')}>
        {renderToggleRows(inputSettingToggles)}
        <p className="ml-3 text-xs text-muted-foreground">
          {t('quickSettings.sendByCtrlEnterDescription')}
        </p>
      </QuickSettingsSection>
    </div>
  );
}
