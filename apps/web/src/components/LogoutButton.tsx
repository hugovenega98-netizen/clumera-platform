'use client';

import { Button } from '@clumera/ui';
import { useRouter } from 'next/navigation';
import { postJson } from './forms';

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await postJson('/api/auth/logout', {});
        router.replace('/ingresar');
        router.refresh();
      }}
    >
      Cerrar sesión
    </Button>
  );
}
