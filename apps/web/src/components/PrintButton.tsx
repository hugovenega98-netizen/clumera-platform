'use client';

import { Button } from '@clumera/ui';

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()}>
      Imprimir o guardar PDF
    </Button>
  );
}
