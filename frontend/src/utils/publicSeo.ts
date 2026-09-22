import { SeoRoute } from '../../../backend/src/seo/seoRoutes';
import { seoMeta, structuredData } from '../../../backend/src/seo/seoPresentation';
export function updatePublicSeo(route: SeoRoute): void {
 document.title=route.title;
 for(const tag of seoMeta(route)) {
  let node=document.head.querySelector(`meta[${tag.kind}="${tag.key}"]`);
  if(!node){node=document.createElement('meta');node.setAttribute(tag.kind,tag.key);document.head.appendChild(node);}
  node.setAttribute('content',tag.content);
 }
 let canonical=document.head.querySelector('link[rel="canonical"]');
 if(!canonical){canonical=document.createElement('link');canonical.setAttribute('rel','canonical');document.head.appendChild(canonical);}
 canonical.setAttribute('href',route.canonical);
 document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node=>node.remove());
 const schema=document.createElement('script');schema.type='application/ld+json';schema.id='zemda-seo-schema';schema.textContent=JSON.stringify(structuredData(route));document.head.appendChild(schema);
}
export function clearPublicSeo(): void {
 document.head.querySelectorAll('script[type="application/ld+json"], meta[property^="og:"], meta[name^="twitter:"]').forEach(node=>node.remove());
}
