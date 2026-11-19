'use client';

import { Button } from '@clumera/ui';
import { postJson } from './forms';

export function LogoutButton() {
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await postJson('/api/auth/logout', {});
        // Recarga completa: no queda nada de la sesión anterior en la memoria del navegador.
        window.location.assign('/ingresar');
      }}
    >
      Cerrar sesión
    </Button>
  );
}
