import { ToggleButton as AriaToggleButton } from 'react-aria-components';
import { cx } from '@/utils/cx';
import { fmtInt } from '../lib/format';

/** Toggle chip with a count: filled black when on, greyed when it would leave nothing. */
export function Chip({ label, count, selected, onToggle }: { label: string; count: number; selected: boolean; onToggle: () => void }) {
  const disabled = count === 0 && !selected;
  return (
    <AriaToggleButton
      isSelected={selected} onChange={onToggle} isDisabled={disabled}
      className={({ isSelected, isHovered, isFocusVisible }) => cx(
        'inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 outline-hidden transition duration-100 ease-linear ring-inset',
        isSelected ? 'bg-brand-solid text-white ring-transparent' : 'bg-primary text-secondary ring-primary',
        !isSelected && isHovered && 'bg-primary_hover',
        isFocusVisible && 'ring-2 ring-focus-ring',
        disabled && 'cursor-not-allowed opacity-40',
      )}
    >
      {label}
      <span className={cx('tabular', selected ? 'text-white/70' : 'text-quaternary')}>{fmtInt(count)}</span>
    </AriaToggleButton>
  );
}
