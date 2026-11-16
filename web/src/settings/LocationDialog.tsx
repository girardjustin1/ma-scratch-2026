import { useState } from 'react';
import { MarkerPin01 } from '@untitledui/icons';
import { Button } from '@/components/base/buttons/button';
import { ButtonGroup, ButtonGroupItem } from '@/components/base/button-group/button-group';
import { CloseButton } from '@/components/base/buttons/close-button';
import { FeaturedIcon } from '@/components/foundations/featured-icon/featured-icon';
import { Dialog, Modal, ModalOverlay } from '@/components/application/modals/modal';
import type { ExploreData } from '../pages/ExplorePage';
import { PlaceRow, SELECTED } from '../pages/SettingsPage';
import type { AddressAutocomplete, LookupResult } from '../data/geocode';
import { PlaceSearch } from './PlaceSearch';
import { activePlace, RADIUS_CHOICES, type LocalSettings, type SavedPlace } from './settings';

/** Remembers "keep the default pin" for this browser, so the first-run prompt shows once. */
const PROMPT_KEY = 'ma-scratch:location-prompt';
export const locationPromptDismissed = () => {
  try { return localStorage.getItem(PROMPT_KEY) === 'dismissed'; } catch { return false; }
};
const dismissPrompt = () => { try { localStorage.setItem(PROMPT_KEY, 'dismissed'); } catch { /* private mode */ } };

/** First control in the map's filter row: the active place; opens the location dialog. The radius button sits next to it. */
export function LocationButton({ settings, defaultLabel, onPress }: { settings: LocalSettings; defaultLabel: string; onPress: () => void }) {
  const place = activePlace(settings);
  return (
    <Button size="sm" color="secondary" iconLeading={MarkerPin01} onClick={onPress} aria-label="Location: change where the radius starts">
      <span className="block max-w-[220px] truncate">{place?.label ?? defaultLabel}</span>
    </Button>
  );
}

/**
 * Where the radius starts: look up an address, or pick a saved place, and choose the radius.
 * The same places as the Settings tab. `firstRun` is the prompt shown when no place is saved
 * yet; closing it keeps the default pin and it does not open again in this browser.
 */
export function LocationDialog({
  isOpen, onOpenChange, firstRun = false, data, defaultLabel, settings, onChange, lookup, autocomplete, online, onGoOnline,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  firstRun?: boolean;
  data: ExploreData;
  defaultLabel: string;
  settings: LocalSettings;
  onChange: (s: LocalSettings) => Promise<boolean>;
  lookup?: (query: string) => Promise<LookupResult>;
  autocomplete?: AddressAutocomplete;
  online: boolean;
  onGoOnline?: () => void;
}) {
  const [saveError, setSaveError] = useState(false);
  const active = activePlace(settings);
  const update = async (next: LocalSettings) => {
    const ok = await onChange(next);
    setSaveError(!ok);
    return ok;
  };
  const close = () => {
    if (firstRun) dismissPrompt();
    onOpenChange(false);
  };
  const savePlace = async (place: SavedPlace) => {
    if (await update({ ...settings, places: [...settings.places, place], activeId: place.id })) onOpenChange(false);
  };

  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} isDismissable>
      <Modal className="max-w-[520px]">
        <Dialog aria-label={firstRun ? 'Set your location' : 'Location'}>
          <div className="flex flex-col gap-5 p-6">
            <div className="flex items-start gap-4">
              <FeaturedIcon icon={MarkerPin01} color="gray" theme="modern" size="lg" />
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold text-primary">{firstRun ? 'Where should the radius start?' : 'Location'}</h2>
                <p className="mt-1 text-sm text-tertiary">
                  {firstRun
                    ? 'Enter an address in Massachusetts. The map pin, the radius and new weekly reports center on it. It is saved on this computer only.'
                    : 'The map pin, the radius and new reports center on the active place.'}
                </p>
              </div>
              <CloseButton size="sm" onPress={close} className="-mt-1 -mr-2" />
            </div>

            <PlaceSearch data={data} radiusMiles={settings.radiusMiles} lookup={lookup} autocomplete={autocomplete} online={online} onGoOnline={onGoOnline}
              onSave={(p) => void savePlace(p)} placeCount={settings.places.length} autoFocus />

            {(settings.places.length > 0 || !firstRun) && (
              <div className="flex flex-col gap-2 border-t border-secondary pt-4">
                <p className="text-xs font-medium text-tertiary">Saved places</p>
                <ul className="flex flex-col gap-1">
                  <PlaceRow label={defaultLabel} address="From web/.env.local" active={!active}
                    onUse={() => void update({ ...settings, activeId: null })} />
                  {settings.places.map((p) => (
                    <PlaceRow key={p.id} label={p.label} address={p.address} active={p.id === active?.id}
                      onUse={() => void update({ ...settings, activeId: p.id })} />
                  ))}
                </ul>
              </div>
            )}

            <div className="flex items-center gap-3 border-t border-secondary pt-4">
              <p className="text-xs font-medium text-tertiary">Starting radius</p>
              <ButtonGroup size="sm" aria-label="Radius" disallowEmptySelection selectedKeys={[String(settings.radiusMiles)]}
                onSelectionChange={(k) => { const v = Number([...k][0]); if (v) void update({ ...settings, radiusMiles: v }); }}>
                {RADIUS_CHOICES.map((r) => <ButtonGroupItem key={r} id={String(r)} className={SELECTED}>{r} mi</ButtonGroupItem>)}
              </ButtonGroup>
            </div>
            <div className="-mx-6 -mb-6 flex justify-end border-t border-secondary px-6 py-4">
              <Button size="md" color={firstRun ? 'secondary' : 'primary'} onClick={close}>
                {firstRun ? 'Keep the default pin for now' : 'Done'}
              </Button>
            </div>
            {saveError && <p className="text-sm text-error-primary">Could not save. Is the local app running (npm run dev)?</p>}
          </div>
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
