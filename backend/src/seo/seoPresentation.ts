import { SEO_ROUTES, SeoRoute, OFFICIAL_DOMAIN, getRouteByPath } from './seoRoutes';
import { LANDING_PLANS } from './landingContent';
export const SEO_IMAGE = `${OFFICIAL_DOMAIN}/brand/zemda-social.png`;
export const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function breadcrumbs(route: SeoRoute): {name: string; url: string}[] {
 if (route.path === '/') return [{name:'Início',url:OFFICIAL_DOMAIN+'/'}];
 return [{name:'Início',url:OFFICIAL_DOMAIN+'/'}, ...(route.article ? [{name:'Blog',url:OFFICIAL_DOMAIN+'/blog'}] : []), {name:(route.article ? route.h1 : route.badge) || route.h1 || route.title,url:route.canonical}];
}
export function structuredData(route: SeoRoute): object {
 const organization = {'@type':'Organization','@id':`${OFFICIAL_DOMAIN}/#organization`,name:'Zemda',url:OFFICIAL_DOMAIN+'/',logo:SEO_IMAGE};
 const graph: object[] = [organization, {'@type':'WebSite','@id':`${OFFICIAL_DOMAIN}/#website`,name:'Zemda',url:OFFICIAL_DOMAIN+'/',publisher:{'@id':organization['@id']},inLanguage:'pt-BR'},
 {'@type':'WebPage','@id':route.canonical+'#webpage',url:route.canonical,name:route.title,description:route.metaDescription,inLanguage:'pt-BR',isPartOf:{'@id':`${OFFICIAL_DOMAIN}/#website`}},
 {'@type':'BreadcrumbList','@id':route.canonical+'#breadcrumb',itemListElement:breadcrumbs(route).map((b,i)=>({'@type':'ListItem',position:i+1,name:b.name,item:b.url}))}];
 if (route.article) graph.push({'@type':'BlogPosting','@id':route.canonical+'#article',mainEntityOfPage:{'@id':route.canonical+'#webpage'},headline:route.h1,description:route.metaDescription,image:SEO_IMAGE,datePublished:route.article.published,dateModified:route.article.modified,author:{'@type':'Organization',name:route.article.author,url:OFFICIAL_DOMAIN+'/'},publisher:{'@id':organization['@id']},inLanguage:'pt-BR'});
 else if (route.path === '/' || route.path === '/planos') graph.push({'@type':'SoftwareApplication','@id':`${OFFICIAL_DOMAIN}/#software`,name:'Zemda',applicationCategory:'BusinessApplication',operatingSystem:'Web',url:OFFICIAL_DOMAIN+'/',description:getRouteByPath('/')!.metaDescription,publisher:{'@id':organization['@id']},image:SEO_IMAGE,offers:LANDING_PLANS.map(p=>({'@type':'Offer',name:p.name,price:p.price.replace(',','.'),priceCurrency:'BRL',url:OFFICIAL_DOMAIN+'/planos'}))});
 return {'@context':'https://schema.org','@graph':graph};
}
export function seoMeta(route: SeoRoute): {kind:'name'|'property'; key:string; content:string}[] {
 return [
 ['name','description',route.metaDescription],['name','robots',route.indexable?'index, follow':'noindex, nofollow'],
 ['property','og:title',route.title],['property','og:description',route.metaDescription],['property','og:url',route.canonical],['property','og:type',route.article?'article':'website'],['property','og:image',SEO_IMAGE],['property','og:site_name','Zemda'],['property','og:locale','pt_BR'],
 ['name','twitter:card','summary'],['name','twitter:title',route.title],['name','twitter:description',route.metaDescription],['name','twitter:image',SEO_IMAGE]
 ].map(([kind,key,content])=>({kind:kind as 'name'|'property',key,content}));
}
export function renderSeoHead(html: string, route: SeoRoute): string {
 html=html.replace(/<title>[\s\S]*?<\/title>/gi,'').replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi,'').replace(/<script\s+[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'');
 for(const tag of seoMeta(route)) html=html.replace(new RegExp(`<meta\\s+[^>]*${tag.kind}=["']${tag.key}["'][^>]*>`,'gi'),'');
 return html.replace('</head>',`<title>${escapeHtml(route.title)}</title>\n<link rel="canonical" href="${escapeHtml(route.canonical)}" />\n${seoMeta(route).map(t=>`<meta ${t.kind}="${t.key}" content="${escapeHtml(t.content)}" />`).join('\n')}\n<script id="zemda-seo-schema" type="application/ld+json">${JSON.stringify(structuredData(route)).replace(/</g,'\\u003c')}</script>\n</head>`);
}
const link = (path: string): string => {const route=getRouteByPath(path);return route?`<a href="${escapeHtml(path)}">${escapeHtml((route.article ? route.h1 : route.badge) || route.h1 || route.title)}</a>`:'';};
export function renderBreadcrumbs(route: SeoRoute): string {
 return `<nav aria-label="Caminho de navegação"><ol class="seo-breadcrumb">${breadcrumbs(route).map((b,i,a)=>`<li>${i===a.length-1?`<span aria-current="page">${escapeHtml(b.name)}</span>`:`<a href="${escapeHtml(new URL(b.url).pathname)}">${escapeHtml(b.name)}</a>`}</li>`).join('')}</ol></nav>`;
}
/** Escaped editorial data, shared between the initial HTML and React. No user HTML. */
export function renderEditorialContent(route: SeoRoute): string {
 const sections=(route.sections||[]).map(s=>`<section><h2>${escapeHtml(s.heading)}</h2>${s.paragraphs.map(p=>`<p>${escapeHtml(p)}</p>`).join('')}${s.links?.length?`<p>Explore também: ${s.links.map(link).filter(Boolean).join(' · ')}.</p>`:''}</section>`).join('');
 const articleList=route.path==='/blog'?`<section><h2>Artigos publicados</h2>${SEO_ROUTES.filter(r=>r.article).map(r=>`<article><h3>${link(r.path)}</h3><p>${escapeHtml(r.metaDescription)}</p><p>${escapeHtml(r.article!.author)} · <time datetime="${r.article!.published}">${r.article!.published.split('-').reverse().join('/')}</time></p></article>`).join('')}</section>`:'';
 return `${renderBreadcrumbs(route)}<article><header><p class="seo-badge">${escapeHtml(route.badge||'Zemda')}</p><h1>${escapeHtml(route.h1||route.title)}</h1><p class="seo-intro">${escapeHtml(route.summary||route.metaDescription)}</p>${route.article?`<p>Por ${escapeHtml(route.article.author)} · Publicado em <time datetime="${route.article.published}">${route.article.published.split('-').reverse().join('/')}</time> · Atualizado em <time datetime="${route.article.modified}">${route.article.modified.split('-').reverse().join('/')}</time></p>`:''}</header>${articleList}${(route.features||[]).map(f=>`<section><h2>${escapeHtml(f.title)}</h2><p>${escapeHtml(f.description)}</p></section>`).join('')}${sections}${route.faqs?.length?`<section><h2>Perguntas frequentes</h2>${route.faqs.map(f=>`<details><summary>${escapeHtml(f.question)}</summary><p>${escapeHtml(f.answer)}</p></details>`).join('')}</section>`:''}${route.relatedLinks?.length?`<section><h2>Continue explorando</h2><p>${route.relatedLinks.filter(p=>p!==route.path).map(link).filter(Boolean).join(' · ')}</p></section>`:''}<section class="seo-cta"><h2>${escapeHtml(route.ctaHeadline||'Conheça o Zemda')}</h2><p>${escapeHtml(route.ctaSubheadline||'Avalie os recursos para a sua rotina e consulte as condições dos planos.')}</p><a href="/planos">Conhecer planos</a> · <a href="/login">Acessar o Zemda</a></section></article>`;
}
