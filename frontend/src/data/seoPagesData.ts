import {
  PUBLIC_NICHE_PAGES,
  SeoPageData,
  SEO_ROUTES,
  SeoRoute,
  OFFICIAL_DOMAIN,
  buildCanonical,
  normalizePath,
  getRouteByPath,
  getRouteBySlug,
  isPublicRoute,
  isValidInternalRoute,
  isValidApplicationRoute
} from '../../../backend/src/seo/seoRoutes';

export type { SeoPageData, SeoRoute };
export {
  SEO_ROUTES,
  OFFICIAL_DOMAIN,
  buildCanonical,
  normalizePath,
  getRouteByPath,
  getRouteBySlug,
  isPublicRoute,
  isValidInternalRoute,
  isValidApplicationRoute
};

export const SEO_PAGES: Record<string, SeoPageData> = PUBLIC_NICHE_PAGES;
