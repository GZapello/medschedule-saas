import React, { useEffect, useState } from 'react';

const previews = {
  agenda: { width: 1891, height: 832, alt: 'Agenda Interativa do Zemda' },
  records: { width: 1930, height: 815, alt: 'Prontuários e evolução do Zemda' },
  dashboard: { width: 1905, height: 825, alt: 'Dashboard de gestão do Zemda' },
  zemda360: { width: 1909, height: 824, alt: 'Mapeamento anatômico Zemda360' },
};

/** Reuse the demo's original assets, without requesting extra images on desktop. */
export function MobileProductPreview({ view }: { view: keyof typeof previews }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  if (!mobile) return null;
  const preview = previews[view];
  return <figure className="zl-mobile-product-preview">
    <img src={`/landing/demo/${view}.png`} alt={preview.alt}
      width={preview.width} height={preview.height} loading="lazy" decoding="async" />
  </figure>;
}
