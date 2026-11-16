import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '../cx';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
}

export function Card({ title, className, children, ...rest }: CardProps) {
  return (
    <section className={cx('cx-card', className)} {...rest}>
      {title ? <h2 className="cx-card__title">{title}</h2> : null}
      {children}
    </section>
  );
}
