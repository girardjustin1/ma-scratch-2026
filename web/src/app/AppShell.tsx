import { AppBar, Box, IconButton, Stack, Tab, Tabs, Toolbar, Tooltip, Typography } from '@mui/material';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
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
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" sx={{ bgcolor: 'background.paper' }}>
        <Toolbar variant="dense" sx={{ gap: 3, minHeight: 52 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
            <Box sx={{ width: 22, height: 22, borderRadius: 1, bgcolor: 'primary.main', display: 'grid', placeItems: 'center' }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', border: '2px solid', borderColor: 'background.paper' }} />
            </Box>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>MA Scratch Claims</Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', lineHeight: 1.1 }}>Descriptive explorer · local</Typography>
            </Box>
          </Stack>
          <Tabs value={tab} onChange={(_, v) => onTab(v)} sx={{ minHeight: 52, '& .MuiTab-root': { minHeight: 52, px: 1.5 } }}>
            {TABS.map((t) => <Tab key={t.key} value={t.key} label={t.label} />)}
          </Tabs>
          <Box sx={{ flex: 1 }} />
          <OnlineChip online={online} />
          {onToggleMode && (
            <Tooltip title={mode === 'dark' ? 'Light mode' : 'Dark mode'}>
              <IconButton size="small" onClick={onToggleMode}>
                {mode === 'dark' ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          )}
        </Toolbar>
      </AppBar>
      {notice && <SampleBanner text={notice} />}
      <Box sx={{ flex: 1, minHeight: 0 }}>{children}</Box>
    </Box>
  );
}
