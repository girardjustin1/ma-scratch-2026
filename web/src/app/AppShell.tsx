import { Moon01, Sun } from '@untitledui/icons';
import { Tabs } from '@/components/application/tabs/tabs';
import { ButtonUtility } from '@/components/base/buttons/button-utility';
import { OnlineChip } from '../components/SourcesPanel';
import { SampleBanner } from '../components/Basics';

export type TabKey = 'map' | 'games' | 'ev' | 'stats' | 'model' | 'data';
export const TABS: { key: TabKey; label: string }[] = [
  { key: 'map', label: 'Map' },
  { key: 'games', label: 'Open games' },
  { key: 'ev', label: 'Statewide EV' },
  { key: 'stats', label: 'Statistics' },
  { key: 'model', label: 'Model' },
  { key: 'data', label: 'Data' },
];

export interface AppShellProps {
  tab: TabKey;
  onTab: (t: TabKey) => void;
  online: boolean;
  mode: 'light' | 'dark';
  onToggleMode?: () => void;
  /** Banner stating which data is real and which is sample. */
  notice?: string;
  children: React.ReactNode;
}

export function AppShell({ tab, onTab, online, mode, onToggleMode, notice, children }: AppShellProps) {
  return (
    <div className="flex h-screen flex-col bg-secondary">
      <header className="flex h-14 shrink-0 items-center gap-8 border-b border-secondary bg-primary px-6">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-brand-solid">
            <div className="size-2.5 rounded-full border-2 border-white" />
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-primary">MA Scratch Claims</p>
            <p className="text-xs text-tertiary">Descriptive explorer · local</p>
          </div>
        </div>
        <Tabs selectedKey={tab} onSelectionChange={(k) => onTab(k as TabKey)} className="w-auto">
          <Tabs.List type="button-gray" size="sm" items={TABS.map((t) => ({ id: t.key, label: t.label }))}>
            {(item) => <Tabs.Item id={item.id} label={item.label} />}
          </Tabs.List>
        </Tabs>
        <div className="flex-1" />
        <OnlineChip online={online} />
        {onToggleMode && (
          <ButtonUtility
            size="sm" color="tertiary" icon={mode === 'dark' ? Sun : Moon01}
            tooltip={mode === 'dark' ? 'Light mode' : 'Dark mode'} onClick={onToggleMode}
          />
        )}
      </header>
      {notice && <SampleBanner text={notice} />}
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
