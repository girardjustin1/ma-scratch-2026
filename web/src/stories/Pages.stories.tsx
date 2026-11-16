import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import * as S from '../fixtures/sample';
import { App, sampleExploreData } from '../app/App';
import { ExplorePage } from '../pages/ExplorePage';
import { ReportsPage } from '../pages/ReportsPage';
import { SettingsPage } from '../pages/SettingsPage';
import { sampleAutocomplete, sampleLookup, sampleSettings } from '../fixtures/sampleSettings';
import { activePlace, type LocalSettings } from '../settings/settings';
import { LocationButton, LocationDialog } from '../settings/LocationDialog';
import { loadSampleIssue, sampleReportIndex } from '../fixtures/sampleReports';
import { DataPage, EvPage, GamesPage, ModelPage, StatsPage } from '../pages/OtherPages';
import { samplePace, samplePaceData } from '../fixtures/samplePace';
import type { MetricKey } from '../domain/types';

const meta: Meta = { title: 'Pages', parameters: { layout: 'fullscreen' } };
export default meta;

const Frame = ({ children }: { children: React.ReactNode }) => <div className="h-screen bg-secondary">{children}</div>;

export const MapPage: StoryObj<{ metric: MetricKey; online: boolean }> = {
  name: "Map",
  args: { metric: 'income', online: false },
  argTypes: { metric: { control: 'inline-radio', options: ['claims', 'income', 'perRetailer'] } },
  render: ({ metric, online }) => (
    <Frame><ExplorePage key={metric + online} data={sampleExploreData} initialFilters={S.defaultFilters} initialMetric={metric} online={online} initialBasemap={online ? 'mapbox' : 'outline'} /></Frame>
  ),
};

export const MapSideBySide: StoryObj = {
  name: 'Map · side by side',
  render: () => <Frame><ExplorePage data={sampleExploreData} initialFilters={S.defaultFilters} initialCompare /></Frame>,
};

export const MapHexagons: StoryObj = {
  name: 'Map · hexagons',
  render: () => <Frame><ExplorePage data={sampleExploreData} initialFilters={S.defaultFilters} initialArea="hexes" /></Frame>,
};

export const MapWideRadius: StoryObj = {
  name: 'Map · 12 mi radius (shows no-data beyond coverage)',
  render: () => <Frame><ExplorePage data={sampleExploreData} initialFilters={{ ...S.defaultFilters, radiusMiles: 12 }} /></Frame>,
};

export const Games: StoryObj = {
  render: () => <Frame><GamesPage games={S.games} tiers={S.prizeTiers} claims={S.claims} coverage={S.coverage} asOf={S.AS_OF}
    pace={{ games: samplePace, data: samplePaceData }} /></Frame>,
};
export const EV: StoryObj = { render: () => <Frame><EvPage games={S.games} tiers={S.prizeTiers} legacy={S.legacyEv} asOf={S.AS_OF} /></Frame> };
export const Statistics: StoryObj = { render: () => <Frame><StatsPage stats={S.statResults} schedule={{ claims: S.claims, source: 'sample data' }} /></Frame> };
export const Model: StoryObj = { render: () => <Frame><ModelPage gate={S.mlGate} /></Frame> };
export const Data: StoryObj = {
  render: () => <Frame><DataPage sources={S.sources} online={false} onToggleOnline={() => {}} coverage={S.coverage} /></Frame>,
};

export const FullPrototype: StoryObj = {
  name: 'Full prototype (all tabs)',
  render: () => <App />,
};

export const Reports: StoryObj = {
  render: () => <Frame><ReportsPage index={sampleReportIndex} seen={new Set()} loadIssue={loadSampleIssue} /></Frame>,
};

export const ReportsEmpty: StoryObj = {
  name: 'Reports · no archive yet',
  render: () => <Frame><ReportsPage index={null} seen={new Set()} loadIssue={loadSampleIssue} /></Frame>,
};

/** Settings with saves kept in memory, so the story responds like the app. */
function SettingsStory({ initial, online }: { initial: LocalSettings; online: boolean }) {
  const [settings, setSettings] = useState(initial);
  return (
    <Frame><SettingsPage data={sampleExploreData} defaultCenter={S.coverage.center} settings={settings}
      onChange={async (s) => { setSettings(s); return true; }} lookup={sampleLookup} autocomplete={sampleAutocomplete} online={online}
      onGoOnline={() => {}} onOpenMap={() => {}} onOpenGames={() => {}} /></Frame>
  );
}

export const Settings: StoryObj = { render: () => <SettingsStory initial={sampleSettings} online={false} /> };

export const SettingsEmpty: StoryObj = {
  name: 'Settings · no places yet',
  render: () => <SettingsStory initial={{ places: [], activeId: null, radiusMiles: 5 }} online />,
};

export const SettingsDemo: StoryObj = {
  name: 'Settings · public demo',
  render: () => <Frame><SettingsPage data={sampleExploreData} defaultCenter={S.coverage.center} settings={null} online={false} demo /></Frame>,
};

/** The map's location button and dialog, with saves kept in memory. Made-up places only. */
function LocationStory({ initial, firstRun }: { initial: LocalSettings; firstRun: boolean }) {
  const [settings, setSettings] = useState(initial);
  const [open, setOpen] = useState(true);
  const [first, setFirst] = useState(firstRun);
  const place = activePlace(settings);
  const data = place ? { ...sampleExploreData, coverage: { ...sampleExploreData.coverage, center: [place.lon, place.lat] as [number, number] } } : sampleExploreData;
  return (
    <Frame>
      <ExplorePage key={`${place?.id ?? 'pin'}-${settings.radiusMiles}`} data={data}
        initialFilters={{ ...S.defaultFilters, pin: data.coverage.center, radiusMiles: settings.radiusMiles }}
        locationSlot={<LocationButton settings={settings} defaultLabel="Sample pin" onPress={() => { setFirst(false); setOpen(true); }} />} />
      <LocationDialog isOpen={open} onOpenChange={setOpen} firstRun={first} data={sampleExploreData} defaultLabel="Sample pin"
        settings={settings} onChange={async (s) => { setSettings(s); return true; }} lookup={sampleLookup} autocomplete={sampleAutocomplete} online onGoOnline={() => {}} />
    </Frame>
  );
}

export const LocationFirstRun: StoryObj = {
  name: 'Map · location prompt (no place saved)',
  render: () => <LocationStory initial={{ places: [], activeId: null, radiusMiles: 5 }} firstRun />,
};

export const LocationDialogStory: StoryObj = {
  name: 'Map · location dialog',
  render: () => <LocationStory initial={sampleSettings} firstRun={false} />,
};
