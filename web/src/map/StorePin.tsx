import { ShoppingBag01 } from '@untitledui/icons';
import { cx } from '@/utils/cx';

/**
 * Google-style store pin, used when zoomed in close. A store with listed claims shows its
 * count on the purple bubble ramp; a store with none is a small gray pin with a shop icon.
 * The name sits to the right with a halo so it reads on any tract color.
 */
export function StorePin({
  n, hot = false, color, ink, name, showName, selected, onClick,
}: {
  n: number; hot?: boolean; color: string; ink: 'light' | 'dark'; name: string; showName: boolean; selected: boolean; onClick: () => void;
}) {
  const winner = n > 0;
  const size = winner ? 30 : 22;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex cursor-pointer items-center gap-1 outline-hidden"
      aria-label={`${name}: ${n} listed claims${hot ? ', among the hottest stores' : ''}`}
    >
      <span className="relative block" style={{ width: size, height: size * 1.25 }}>
        <svg viewBox="0 0 24 30" width={size} height={size * 1.25} className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]" aria-hidden>
          <path
            d="M12 29c-.4 0-.8-.2-1-.5C7.3 23.6 2 17.9 2 11.5 2 5.7 6.5 1 12 1s10 4.7 10 10.5c0 6.4-5.3 12.1-9 17-.2.3-.6.5-1 .5Z"
            fill={winner ? color : '#737373'}
            stroke={selected ? '#0a0a0a' : '#ffffff'}
            strokeWidth={selected ? 2.5 : 1.5}
          />
        </svg>
        {hot && (
          <span className="absolute -top-2 -right-2 text-[14px] leading-none drop-shadow-[0_0_2px_rgba(255,255,255,0.9)]" aria-hidden>🔥</span>
        )}
        <span className="absolute inset-x-0 top-0 grid place-items-center" style={{ height: size }}>
          {winner ? (
            <span className={cx('text-[11px] leading-none font-bold tabular', ink === 'light' ? 'text-white' : 'text-neutral-950')}>
              {n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n}
            </span>
          ) : (
            <ShoppingBag01 className="size-3 text-white" aria-hidden />
          )}
        </span>
      </span>
      {showName && (
        <span
          className={cx(
            'max-w-[150px] truncate text-[11px] leading-tight font-semibold',
            winner ? 'text-neutral-900' : 'text-neutral-600',
            selected && 'text-neutral-950',
          )}
          style={{ textShadow: '0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff' }}
        >
          {name}
        </span>
      )}
    </button>
  );
}
