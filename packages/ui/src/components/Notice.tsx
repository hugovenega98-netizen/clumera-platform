import type { HTMLAttributes } from 'react';
import { cx } from '../cx';

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone: 'ok' | 'warn' | 'bad';
}

/** Aviso en línea. `bad` y `warn` se anuncian a lectores de pantalla. */
export function Notice({ tone, className, ...rest }: NoticeProps) {
  return <div role={tone === 'ok' ? 'status' : 'alert'} className={cx('cx-notice', `cx-notice--${tone}`, className)} {...rest} />;
}
