/* UI interaction reference: gharsh11032000 / Uiverse. MIT; see licenses/uiverse/LICENSE.
 * Local application styling and React integration; not claimed as solely original. */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './ExpandingArrowButton.css';

export type ExpandingArrowButtonVariant = 'primary' | 'secondary' | 'orange' | 'danger';

export interface ExpandingArrowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ExpandingArrowButtonVariant;
  loading?: boolean;
  success?: boolean;
}

const Arrow = ({ className }: { className: string }) => (
  <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
    <path d="M16.1716 10.9999 10.8076 5.63589 12.2218 4.22168 20 11.9999 12.2218 19.778 10.8076 18.3638 16.1716 12.9999H4V10.9999h12.1716Z" />
  </svg>
);

export function ExpandingArrowButton({
  children,
  variant = 'primary',
  loading = false,
  success = false,
  disabled,
  className = '',
  ...props
}: ExpandingArrowButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      {...props}
      type={props.type ?? 'button'}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        'aippt-expanding-button',
        `aippt-expanding-button--${variant}`,
        success ? 'is-success' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <Arrow className="aippt-expanding-button__arrow aippt-expanding-button__arrow--incoming" />
      <span className="aippt-expanding-button__label">
        {loading ? '处理中…' : success ? '已完成' : children}
      </span>
      <span className="aippt-expanding-button__circle" aria-hidden="true" />
      <Arrow className="aippt-expanding-button__arrow aippt-expanding-button__arrow--outgoing" />
    </button>
  );
}

export default ExpandingArrowButton;
