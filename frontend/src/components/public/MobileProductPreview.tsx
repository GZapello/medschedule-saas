import React, { useEffect, useState } from 'react';

const previews = {
  professions: { file: 'areas-profissionais-mockup.jpg', alt: 'Zemda — ferramentas para diferentes áreas profissionais' },
  management: { file: 'gestao-completa-mockup.jpg', alt: 'Zemda — gestão completa da clínica em um só lugar' },
  body: { file: 'zemdabody-mockup.jpg', alt: 'ZemdaBody — avaliação e mapeamento corporal' },
};

/** Supplied landing artwork, unchanged and requested only on mobile. */
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
    <img src={`/landing/${preview.file}`} alt={preview.alt}
      width={1024} height={768} loading="lazy" decoding="async" />
  </figure>;
}
