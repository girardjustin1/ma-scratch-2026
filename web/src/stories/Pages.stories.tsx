import type { Meta, StoryObj } from '@storybook/react-vite';
import * as S from '../fixtures/sample';
import { App, sampleExploreData } from '../app/App';
import { ExplorePage } from '../pages/ExplorePage';
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
