import { buildWebManifest } from '@clumera/config';
import type { MetadataRoute } from 'next';
import { clientConfig } from '@/lib/client-config';

export default function manifest(): MetadataRoute.Manifest {
  return buildWebManifest(clientConfig);
}
