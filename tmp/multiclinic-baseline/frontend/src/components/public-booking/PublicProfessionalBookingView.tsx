import React from 'react';
import { PublicBookingView } from './PublicBookingView';

interface Props { slug: string; clinicSlug?: string }
/** Individual links use the same booking experience with the professional fixed. */
export const PublicProfessionalBookingView: React.FC<Props> = ({ slug, clinicSlug }) =>
  <PublicBookingView tenantSlug={clinicSlug} professionalSlug={slug} />;
