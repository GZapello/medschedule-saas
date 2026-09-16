import React, { useState } from 'react';
import {
  BodyPanoramaRegion,
  getPanoramaRegions,
  getRegionLabel
} from './bodyRegionsData';

// Tipos preservados para compatibilidade com registros existentes
export interface BodyStrokePoint {
  x: number;
  y: number;
}

export interface BodyStroke {
  strokeId: string;
  toolType: 'pen' | 'highlighter';
  color: string;
  strokeWidth: number;
  opacity: number;
  points: BodyStrokePoint[];
}

export interface BodyMarkerItem {
  id?: string;
  bodyRegion: string;
  side: 'right' | 'left' | 'midline';
  view: 'front' | 'back' | 'left' | 'right';
  markerType: string;
  value?: string;
  severity?: string;
  notes?: string;
  coordinates?: { x: number; y: number };
  detailsJson?: any;
}

export interface ZemdaBodyCanvasProps {
  bodyModel: 'female' | 'male';
  selectedRegions: string[];
  onToggleRegion: (regionId: string) => void;
  readOnly?: boolean;
}

export const ZemdaBodyCanvas: React.FC<ZemdaBodyCanvasProps> = ({
  bodyModel,
  selectedRegions,
  onToggleRegion,
  readOnly = false
}) => {
  const [hoveredRegion, setHoveredRegion] = useState<BodyPanoramaRegion | null>(null);

  // Obtém as regiões calibradas para o modelo selecionado (1024 x 768)
  const regions = getPanoramaRegions(bodyModel);

  // Imagem de alta fidelidade
  const imgSrc = bodyModel === 'female' ? '/Corpo_Feminino.jpg' : '/Corpo_masculino.jpg';

  const handleClick = (regId: string) => {
    if (readOnly) return;
    onToggleRegion(regId);
  };

  return (
    <div className="w-full flex flex-col items-center select-none">
      {/* Indicador de Região sob o Cursor */}
      <div className="h-6 mb-1 text-center">
        {hoveredRegion ? (
          <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-3 py-0.5 rounded-full shadow-xs animate-in fade-in duration-100">
            {hoveredRegion.label}
          </span>
        ) : (
          <span className="text-[11px] text-slate-400">
            {readOnly
              ? 'Modo visualização histórica (somente leitura)'
              : 'Passe o mouse sobre o corpo e clique para marcar/desmarcar a área'}
          </span>
        )}
      </div>

      {/* Wrapper do Mapa Corporal Panorâmico */}
      <div className="mapa-corporal-wrapper shadow-lg border border-slate-200">
        <style>{`
          .mapa-corporal-wrapper {
            position: relative;
            width: 100%;
            max-width: 1100px;
            margin: 0 auto;
            border-radius: 12px;
            overflow: hidden;
            background-color: #f8f9fa;
          }

          .img-anatomia {
            width: 100%;
            height: auto;
            display: block;
            pointer-events: none;
            user-select: none;
          }

          .svg-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: 10;
          }

          .regiao {
            fill: rgba(33, 150, 243, 0);
            stroke: rgba(33, 150, 243, 0);
            stroke-width: 2.5;
            cursor: ${readOnly ? 'default' : 'pointer'};
            transition: all 0.2s ease-in-out;
          }

          .regiao:hover {
            ${
              readOnly
                ? ''
                : `
              fill: rgba(33, 150, 243, 0.35);
              stroke: rgba(33, 150, 243, 0.85);
            `
            }
          }

          .marcado {
            fill: rgba(244, 67, 54, 0.48) !important;
            stroke: rgba(244, 67, 54, 0.95) !important;
            stroke-width: 3 !important;
          }
        `}</style>

        {/* 1. Imagem Anatômica Panorâmica Contínua */}
        <img
          src={imgSrc}
          alt={`Mapa Corporal Panorâmico - ${bodyModel === 'female' ? 'Feminino' : 'Masculino'}`}
          className="img-anatomia"
          draggable={false}
        />

        {/* 2. SVG Overlay de Seleção com ViewBox 1024 x 768 */}
        <svg
          viewBox="0 0 1024 768"
          className="svg-overlay"
          preserveAspectRatio="none"
          role="img"
          aria-label="Mapa Anatômico Interativo"
        >
          {regions.map(r => {
            const isSelected = selectedRegions.includes(r.id);
            const className = `regiao ${isSelected ? 'marcado' : ''}`;

            if (r.shapeType === 'ellipse' && r.ellipseCoords) {
              return (
                <ellipse
                  key={r.id}
                  id={r.id}
                  className={className}
                  cx={r.ellipseCoords.cx}
                  cy={r.ellipseCoords.cy}
                  rx={r.ellipseCoords.rx}
                  ry={r.ellipseCoords.ry}
                  onClick={() => handleClick(r.id)}
                  onMouseEnter={() => setHoveredRegion(r)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  role="button"
                  tabIndex={0}
                  aria-label={r.label}
                  aria-pressed={isSelected}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick(r.id);
                    }
                  }}
                >
                  <title>{r.label}</title>
                </ellipse>
              );
            }

            return (
              <polygon
                key={r.id}
                id={r.id}
                className={className}
                points={r.points || ''}
                onClick={() => handleClick(r.id)}
                onMouseEnter={() => setHoveredRegion(r)}
                onMouseLeave={() => setHoveredRegion(null)}
                role="button"
                tabIndex={0}
                aria-label={r.label}
                aria-pressed={isSelected}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick(r.id);
                  }
                }}
              >
                <title>{r.label}</title>
              </polygon>
            );
          })}
        </svg>
      </div>

      {/* Rótulos das 4 Vistas */}
      <div className="w-full max-w-[1100px] mt-2 px-2 flex justify-around text-xs font-bold text-slate-500 uppercase tracking-wider">
        <div className="w-1/4 text-center">Frente</div>
        <div className="w-1/4 text-center">Verso</div>
        <div className="w-1/4 text-center">Perfil Esquerdo</div>
        <div className="w-1/4 text-center">Perfil Direito</div>
      </div>
    </div>
  );
};
