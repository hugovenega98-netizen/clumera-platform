import { FAMILY_ROLES } from '@clumera/identity';
import { z } from 'zod';

export const familyMember = z.object({ personId: z.string().min(1), role: z.enum(FAMILY_ROLES), relation: z.string().trim().max(40).optional() });
