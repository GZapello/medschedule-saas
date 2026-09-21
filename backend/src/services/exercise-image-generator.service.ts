import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { r2StorageService } from './r2-storage.service';
import { DEFAULT_EXERCISE_LIBRARY, SeedExercise } from '../config/exercise-library.seed';

interface MuscleTheme {
  primary: string;
  glow: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
}

const MUSCLE_THEMES: Record<string, MuscleTheme> = {
  Peitoral: { primary: '#6366f1', glow: '#4f46e5', badgeBg: '#312e81', badgeBorder: '#6366f1', badgeText: '#c7d2fe' },
  Costas: { primary: '#0ea5e9', glow: '#0284c7', badgeBg: '#082f49', badgeBorder: '#0ea5e9', badgeText: '#bae6fd' },
  Ombros: { primary: '#f59e0b', glow: '#d97706', badgeBg: '#451a03', badgeBorder: '#f59e0b', badgeText: '#fde68a' },
  'Bíceps': { primary: '#ec4899', glow: '#db2777', badgeBg: '#500724', badgeBorder: '#ec4899', badgeText: '#fbcfe8' },
  'Tríceps': { primary: '#a855f7', glow: '#9333ea', badgeBg: '#3b0764', badgeBorder: '#a855f7', badgeText: '#f3e8ff' },
  'Antebraços': { primary: '#d946ef', glow: '#c026d3', badgeBg: '#4a044e', badgeBorder: '#d946ef', badgeText: '#fae8ff' },
  'Abdômen/Core': { primary: '#8b5cf6', glow: '#7c3aed', badgeBg: '#2e1065', badgeBorder: '#8b5cf6', badgeText: '#ede9fe' },
  Lombar: { primary: '#6366f1', glow: '#4f46e5', badgeBg: '#1e1b4b', badgeBorder: '#818cf8', badgeText: '#c7d2fe' },
  'Quadríceps': { primary: '#10b981', glow: '#059669', badgeBg: '#022c22', badgeBorder: '#10b981', badgeText: '#a7f3d0' },
  'Posteriores de coxa': { primary: '#14b8a6', glow: '#0d9488', badgeBg: '#042f2e', badgeBorder: '#14b8a6', badgeText: '#99f6e4' },
  'Glúteos': { primary: '#f43f5e', glow: '#e11d48', badgeBg: '#4c0519', badgeBorder: '#f43f5e', badgeText: '#fecdd3' },
  Adutores: { primary: '#06b6d4', glow: '#0891b2', badgeBg: '#083344', badgeBorder: '#06b6d4', badgeText: '#a5f3fc' },
  Abdutores: { primary: '#3b82f6', glow: '#2563eb', badgeBg: '#172554', badgeBorder: '#3b82f6', badgeText: '#bfdbfe' },
  Panturrilhas: { primary: '#eab308', glow: '#ca8a04', badgeBg: '#422006', badgeBorder: '#eab308', badgeText: '#fef08a' },
  'Corpo inteiro': { primary: '#ef4444', glow: '#dc2626', badgeBg: '#450a0a', badgeBorder: '#ef4444', badgeText: '#fecaca' },
  'Cardiorrespiratórios': { primary: '#f97316', glow: '#ea580c', badgeBg: '#431407', badgeBorder: '#f97316', badgeText: '#fed7aa' },
  Mobilidade: { primary: '#2dd4bf', glow: '#0d9488', badgeBg: '#042f2e', badgeBorder: '#2dd4bf', badgeText: '#99f6e4' },
  Alongamentos: { primary: '#34d399', glow: '#059669', badgeBg: '#064e3b', badgeBorder: '#34d399', badgeText: '#a7f3d0' }
};

const DEFAULT_THEME: MuscleTheme = {
  primary: '#6366f1',
  glow: '#4f46e5',
  badgeBg: '#1e1b4b',
  badgeBorder: '#6366f1',
  badgeText: '#c7d2fe'
};

function getMovementGraphicSvg(id: string, group: string, equipment: string, theme: MuscleTheme): string {
  const p = theme.primary;

  // Supinos (Bench Presses)
  if (id.includes('supino') || id.includes('press-banco')) {
    const isIncline = id.includes('inclinado');
    const isDecline = id.includes('declinado');
    const isDumbbell = equipment.includes('Halter');
    const benchAngle = isIncline ? -25 : (isDecline ? 20 : 0);
    const benchY = isIncline ? 25 : (isDecline ? 50 : 40);

    return `
      <g transform="translate(320, 230)">
        <!-- Bench -->
        <g transform="rotate(${benchAngle} 0 ${benchY})">
          <rect x="-160" y="${benchY}" width="320" height="16" rx="8" fill="#1e293b" stroke="#475569" stroke-width="2" />
          <rect x="-120" y="${benchY + 16}" width="20" height="70" fill="#334155" />
          <rect x="100" y="${benchY + 16}" width="20" height="70" fill="#334155" />
          <!-- Athlete Torso -->
          <rect x="-110" y="${benchY - 22}" width="220" height="22" rx="11" fill="#475569" />
          <!-- Head -->
          <circle cx="-130" cy="${benchY - 11}" r="16" fill="#64748b" />
          <!-- Chest Activation Glow -->
          <ellipse cx="-20" cy="${benchY - 11}" rx="32" ry="14" fill="${p}" fill-opacity="0.8" stroke="#ffffff" stroke-width="1.5" />
          <ellipse cx="40" cy="${benchY - 11}" rx="32" ry="14" fill="${p}" fill-opacity="0.8" stroke="#ffffff" stroke-width="1.5" />
        </g>
        <!-- Arms and Weight -->
        ${isDumbbell ? `
          <!-- Dumbbells -->
          <path d="M -40 25 L -50 -45" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
          <path d="M 40 25 L 50 -45" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
          <rect x="-75" y="-55" width="50" height="16" rx="4" fill="#94a3b8" stroke="#f1f5f9" stroke-width="2" />
          <rect x="25" y="-55" width="50" height="16" rx="4" fill="#94a3b8" stroke="#f1f5f9" stroke-width="2" />
        ` : `
          <!-- Barbell -->
          <path d="M -40 25 L -45 -45" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
          <path d="M 40 25 L 45 -45" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
          <line x1="-175" y1="-50" x2="175" y2="-50" stroke="#cbd5e1" stroke-width="8" stroke-linecap="round" />
          <rect x="-170" y="-90" width="14" height="80" rx="3" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5" />
          <rect x="156" y="-90" width="14" height="80" rx="3" fill="#ef4444" stroke="#fca5a5" stroke-width="1.5" />
        `}
        <!-- Kinetic Arrow -->
        <path d="M 0 10 L 0 -30" stroke="${p}" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="5 4" />
        <polygon points="0,-36 -6,-26 6,-26" fill="${p}" />
      </g>
    `;
  }

  // Crucifixo / Flyes
  if (id.includes('crucifixo') || id.includes('voador') || id.includes('peck-deck') || id.includes('crossover')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Center Torso -->
        <ellipse cx="0" cy="20" rx="35" ry="50" fill="#334155" stroke="#475569" stroke-width="2" />
        <circle cx="0" cy="-45" r="20" fill="#64748b" />
        <!-- Pectoral Muscles Highlight -->
        <path d="M -28 0 Q 0 -10 28 0 Q 0 45 -28 0 Z" fill="${p}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2" />
        <!-- Extended Arms with Arc Motion -->
        <path d="M -30 5 Q -120 -30 -140 -10" stroke="#38bdf8" stroke-width="12" fill="none" stroke-linecap="round" />
        <path d="M 30 5 Q 120 -30 140 -10" stroke="#38bdf8" stroke-width="12" fill="none" stroke-linecap="round" />
        <!-- Handles / Weights -->
        <circle cx="-140" cy="-10" r="14" fill="#94a3b8" stroke="#cbd5e1" stroke-width="3" />
        <circle cx="140" cy="-10" r="14" fill="#94a3b8" stroke="#cbd5e1" stroke-width="3" />
        <!-- Converging Motion Arc Arrows -->
        <path d="M -130 -30 Q -60 -70 -10 -50" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="5 4" />
        <polygon points="-5,-48 -14,-56 -18,-44" fill="${p}" />
        <path d="M 130 -30 Q 60 -70 10 -50" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="5 4" />
        <polygon points="5,-48 18,-44 14,-56" fill="${p}" />
      </g>
    `;
  }

  // Flexões e Paralelas
  if (id.includes('flexao') || id.includes('paralelas') || id.includes('dips')) {
    return `
      <g transform="translate(320, 240)">
        <!-- Horizontal Ground or Parallel Bars -->
        <line x1="-180" y1="90" x2="180" y2="90" stroke="#475569" stroke-width="6" stroke-linecap="round" />
        <!-- Body in Plank / Dip -->
        <path d="M -140 70 L 40 10 L 140 -20" stroke="#38bdf8" stroke-width="20" stroke-linecap="round" fill="none" />
        <!-- Head -->
        <circle cx="155" cy="-28" r="18" fill="#94a3b8" />
        <!-- Supporting Arms -->
        <line x1="30" y1="20" x2="30" y2="90" stroke="#cbd5e1" stroke-width="12" stroke-linecap="round" />
        <line x1="-120" y1="65" x2="-130" y2="90" stroke="#64748b" stroke-width="10" stroke-linecap="round" />
        <!-- Highlighted Push Muscles -->
        <circle cx="30" cy="20" r="22" fill="${p}" fill-opacity="0.8" stroke="#ffffff" stroke-width="2" />
        <!-- Motion Arrow -->
        <path d="M 55 40 L 55 5" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="55,0 49,10 61,10" fill="${p}" />
      </g>
    `;
  }

  // Puxadas e Barra Fixa (Lat Pulldowns / Pull-ups)
  if (id.includes('puxada') || id.includes('barra-fixa') || id.includes('pulldown')) {
    return `
      <g transform="translate(320, 220)">
        <!-- Overhead Bar / Pulley -->
        <line x1="-180" y1="-80" x2="180" y2="-80" stroke="#94a3b8" stroke-width="8" stroke-linecap="round" />
        <!-- Lat Pulley Cable Center -->
        <line x1="0" y1="-120" x2="0" y2="-80" stroke="#64748b" stroke-width="4" />
        <!-- Athlete Torso & Head -->
        <circle cx="0" cy="-10" r="18" fill="#64748b" />
        <!-- Lat V-Taper Back Highlight -->
        <path d="M -45 10 L 45 10 L 20 80 L -20 80 Z" fill="${p}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2" />
        <!-- Arms Reaching to Bar -->
        <path d="M -30 20 L -120 -75" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <path d="M 30 20 L 120 -75" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <!-- Downward Kinetic Arrows -->
        <path d="M -70 -20 L -50 15" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="-46,21 -57,14 -47,8" fill="${p}" />
        <path d="M 70 -20 L 50 15" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="46,21 47,8 57,14" fill="${p}" />
      </g>
    `;
  }

  // Remadas (Rows)
  if (id.includes('remada') || id.includes('serrote') || id.includes('cavalinho')) {
    return `
      <g transform="translate(320, 230)">
        <!-- Athlete Hinged at 45 deg -->
        <circle cx="-60" cy="-30" r="18" fill="#64748b" />
        <path d="M -50 -15 L 20 30 L 70 100" stroke="#475569" stroke-width="22" stroke-linecap="round" fill="none" />
        <!-- Back Muscles (Rhomboids, Lats) Glow -->
        <ellipse cx="-15" cy="5" rx="28" ry="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Arm Pulling Weight to Torso -->
        <path d="M -30 0 L -10 15 L 10 -15" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <!-- Barbell / Dumbbell -->
        <rect x="-20" y="-35" width="60" height="18" rx="4" fill="#94a3b8" stroke="#cbd5e1" stroke-width="2" />
        <!-- Pull Kinetic Arrow -->
        <path d="M 10 35 L 10 -5" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="10,-10 5,0 15,0" fill="${p}" />
      </g>
    `;
  }

  // Ombros: Desenvolvimento (Shoulder Press)
  if (id.includes('desenvolvimento') || id.includes('militar')) {
    return `
      <g transform="translate(320, 230)">
        <!-- Torso Upright -->
        <rect x="-35" y="-10" width="70" height="90" rx="16" fill="#334155" />
        <circle cx="0" cy="-45" r="18" fill="#64748b" />
        <!-- Deltoid Glow Highlights -->
        <circle cx="-38" cy="-5" r="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <circle cx="38" cy="-5" r="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Arms Pushing Overhead -->
        <path d="M -35 -5 L -55 -70" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <path d="M 35 -5 L 55 -70" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <!-- Overhead Weight -->
        <line x1="-120" y1="-75" x2="120" y2="-75" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" />
        <rect x="-115" y="-105" width="14" height="60" rx="3" fill="#ef4444" />
        <rect x="101" y="-105" width="14" height="60" rx="3" fill="#ef4444" />
        <!-- Upward Kinetic Arrows -->
        <path d="M 0 -15 L 0 -55" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="0,-60 -5,-50 5,-50" fill="${p}" />
      </g>
    `;
  }

  // Elevação Lateral / Frontal / Face Pull
  if (id.includes('elevacao') || id.includes('face-pull')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Athlete Torso -->
        <rect x="-30" y="-20" width="60" height="90" rx="14" fill="#334155" />
        <circle cx="0" cy="-50" r="18" fill="#64748b" />
        <!-- Deltoids Activated -->
        <circle cx="-32" cy="-15" r="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <circle cx="32" cy="-15" r="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Arms Abducted Laterally (T-shape) -->
        <line x1="-30" y1="-15" x2="-140" y2="-15" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <line x1="30" y1="-15" x2="140" y2="-15" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <!-- Weights at Ends -->
        <circle cx="-145" cy="-15" r="14" fill="#94a3b8" stroke="#cbd5e1" stroke-width="2" />
        <circle cx="145" cy="-15" r="14" fill="#94a3b8" stroke="#cbd5e1" stroke-width="2" />
        <!-- Upward Curved Motion Arrows -->
        <path d="M -110 30 Q -130 5 -135 -30" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="4 3" />
        <polygon points="-135,-35 -142,-26 -130,-26" fill="${p}" />
        <path d="M 110 30 Q 130 5 135 -30" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="4 3" />
        <polygon points="135,-35 130,-26 142,-26" fill="${p}" />
      </g>
    `;
  }

  // Bíceps (Curls)
  if (group === 'Bíceps' || id.includes('biceps') || id.includes('rosca')) {
    return `
      <g transform="translate(320, 230)">
        <rect x="-30" y="-30" width="60" height="95" rx="14" fill="#334155" />
        <circle cx="0" cy="-60" r="18" fill="#64748b" />
        <!-- Upper Arms fixed -->
        <line x1="-25" y1="-20" x2="-25" y2="35" stroke="#475569" stroke-width="14" stroke-linecap="round" />
        <line x1="25" y1="-20" x2="25" y2="35" stroke="#475569" stroke-width="14" stroke-linecap="round" />
        <!-- Forearms Curled Up -->
        <line x1="-25" y1="35" x2="-15" y2="-20" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <line x1="25" y1="35" x2="15" y2="-20" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <!-- Glowing Biceps Peak -->
        <ellipse cx="-20" cy="5" rx="15" ry="20" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <ellipse cx="20" cy="5" rx="15" ry="20" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Barbell / Weight at Top -->
        <line x1="-80" y1="-25" x2="80" y2="-25" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round" />
        <circle cx="-80" cy="-25" r="14" fill="#ec4899" />
        <circle cx="80" cy="-25" r="14" fill="#ec4899" />
        <!-- Curled Motion Arrow -->
        <path d="M 45 40 Q 65 10 35 -15" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="4 3" />
        <polygon points="30,-18 38,-10 44,-20" fill="${p}" />
      </g>
    `;
  }

  // Tríceps
  if (group === 'Tríceps' || id.includes('triceps') || id.includes('pulley') || id.includes('corda')) {
    return `
      <g transform="translate(320, 230)">
        <rect x="-30" y="-30" width="60" height="95" rx="14" fill="#334155" />
        <circle cx="0" cy="-60" r="18" fill="#64748b" />
        <!-- Upper Arms Vertical -->
        <line x1="-28" y1="-20" x2="-28" y2="30" stroke="#475569" stroke-width="14" stroke-linecap="round" />
        <line x1="28" y1="-20" x2="28" y2="30" stroke="#475569" stroke-width="14" stroke-linecap="round" />
        <!-- Triceps Activation Behind Arms -->
        <ellipse cx="-33" cy="5" rx="12" ry="22" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <ellipse cx="33" cy="5" rx="12" ry="22" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Forearms Extended Downward -->
        <line x1="-28" y1="30" x2="-28" y2="85" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <line x1="28" y1="30" x2="28" y2="85" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <!-- Pulley Bar / Rope -->
        <line x1="-50" y1="88" x2="50" y2="88" stroke="#cbd5e1" stroke-width="6" stroke-linecap="round" />
        <!-- Downward Extension Arrow -->
        <path d="M 0 35 L 0 75" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="0,80 -5,70 5,70" fill="${p}" />
      </g>
    `;
  }

  // Agachamento (Squat) / Pernas
  if (id.includes('agachamento') || id.includes('hack') || id.includes('squat')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Athlete Squatting (Deep Hip Crease & Knees) -->
        <circle cx="0" cy="-45" r="18" fill="#64748b" />
        <!-- Torso upright -->
        <path d="M 0 -25 L 0 25" stroke="#475569" stroke-width="24" stroke-linecap="round" />
        <!-- Thighs Horizontal (Quads glowing) -->
        <path d="M 0 25 L -55 35 M 0 25 L 55 35" stroke="${p}" stroke-width="18" stroke-linecap="round" />
        <!-- Shins vertical to floor -->
        <path d="M -55 35 L -55 95 M 55 35 L 55 95" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" />
        <!-- Feet flat on floor -->
        <line x1="-80" y1="95" x2="80" y2="95" stroke="#64748b" stroke-width="4" stroke-linecap="round" />
        <!-- Barbell on Traps -->
        <line x1="-160" y1="-25" x2="160" y2="-25" stroke="#cbd5e1" stroke-width="7" stroke-linecap="round" />
        <rect x="-155" y="-65" width="14" height="80" rx="3" fill="#10b981" />
        <rect x="141" y="-65" width="14" height="80" rx="3" fill="#10b981" />
        <!-- Upward Kinetic Drive Arrow -->
        <path d="M 0 10 L 0 -15" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="0,-20 -5,-10 5,-10" fill="${p}" />
      </g>
    `;
  }

  // Leg Press (45 / horizontal)
  if (id.includes('leg-press')) {
    return `
      <g transform="translate(320, 230)">
        <!-- Angled Sled Track 45 deg -->
        <line x1="-120" y1="100" x2="120" y2="-100" stroke="#334155" stroke-width="8" stroke-linecap="round" />
        <!-- Seat Pad -->
        <rect x="-110" y="50" width="80" height="20" rx="6" fill="#1e293b" transform="rotate(-45 -70 60)" />
        <!-- Leg Press Platform -->
        <rect x="70" y="-80" width="80" height="24" rx="4" fill="#64748b" transform="rotate(45 110 -68)" />
        <!-- Legs extending along 45 deg -->
        <path d="M -70 50 L -10 10 L 80 -45" stroke="${p}" stroke-width="18" stroke-linecap="round" fill="none" />
        <!-- Kinetic Arrow -->
        <path d="M 10 0 L 50 -35" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="55,-40 45,-37 49,-28" fill="${p}" />
      </g>
    `;
  }

  // Extensora / Flexora (Leg Extension / Curl)
  if (id.includes('extensora') || id.includes('flexora')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Machine Seat & Frame -->
        <rect x="-110" y="20" width="90" height="18" rx="4" fill="#334155" />
        <rect x="-110" y="-50" width="18" height="70" rx="4" fill="#334155" />
        <!-- Pivot Joint -->
        <circle cx="0" cy="28" r="14" fill="#64748b" stroke="#cbd5e1" stroke-width="3" />
        <!-- Upper Leg Fixed on Seat -->
        <line x1="-80" y1="20" x2="0" y2="28" stroke="#475569" stroke-width="18" stroke-linecap="round" />
        <!-- Target Muscle Highlight (Quad or Hamstring) -->
        <ellipse cx="-40" cy="20" rx="30" ry="12" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Moving Lever with Roller Pad -->
        <line x1="0" y1="28" x2="70" y2="10" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" />
        <circle cx="70" cy="10" r="16" fill="#94a3b8" />
        <!-- Radial Motion Arrow -->
        <path d="M 30 65 Q 65 60 70 30" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="4 3" />
        <polygon points="70,25 63,33 74,35" fill="${p}" />
      </g>
    `;
  }

  // Levantamento Terra / Stiff / RDL
  if (id.includes('terra') || id.includes('stiff') || id.includes('rdl')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Athlete Hip Hinge Posture -->
        <circle cx="45" cy="-45" r="18" fill="#64748b" />
        <!-- Back Flat in Hinge -->
        <line x1="40" y1="-30" x2="-20" y2="20" stroke="#475569" stroke-width="20" stroke-linecap="round" />
        <!-- Glutes & Hamstrings Glowing -->
        <ellipse cx="-15" cy="25" rx="24" ry="16" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Legs Soft Knee -->
        <path d="M -20 20 L -30 60 L -35 100" stroke="#38bdf8" stroke-width="16" stroke-linecap="round" fill="none" />
        <!-- Barbell / Weight Pulled Along Shins -->
        <line x1="-35" y1="65" x2="25" y2="-15" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round" />
        <circle cx="-35" cy="65" r="18" fill="#ef4444" />
        <!-- Upward Posterior Chain Drive Arrow -->
        <path d="M 0 35 L 35 -10" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="40,-15 30,-9 36,-1" fill="${p}" />
      </g>
    `;
  }

  // Elevação Pélvica (Hip Thrust)
  if (id.includes('pelvica') || id.includes('gluteo') || group === 'Glúteos') {
    return `
      <g transform="translate(320, 235)">
        <!-- Bench Supporting Upper Back -->
        <rect x="-140" y="20" width="60" height="70" rx="8" fill="#334155" />
        <!-- Athlete Bridge / Thrust Lockout -->
        <path d="M -110 30 L -10 10 L 80 85" stroke="#475569" stroke-width="22" stroke-linecap="round" fill="none" />
        <!-- Glute Activation Hub -->
        <ellipse cx="-10" cy="10" rx="26" ry="18" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Barbell across Hips -->
        <line x1="-70" y1="0" x2="50" y2="20" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round" />
        <circle cx="-70" cy="0" r="18" fill="#f43f5e" />
        <circle cx="50" cy="20" r="18" fill="#f43f5e" />
        <!-- Upward Thrust Arrow -->
        <path d="M -10 45 L -10 0" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="-10,-5 -15,5 -5,5" fill="${p}" />
      </g>
    `;
  }

  // Panturrilhas (Calf Raises)
  if (group === 'Panturrilhas' || id.includes('gemeos') || id.includes('panturrilha')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Step / Block Elevation -->
        <rect x="-60" y="80" width="120" height="25" rx="4" fill="#334155" />
        <!-- Lower Leg & Ankle Extension -->
        <line x1="0" y1="-80" x2="0" y2="40" stroke="#475569" stroke-width="16" stroke-linecap="round" />
        <!-- Gastrocnemius / Soleus Muscle Bellies Glow -->
        <ellipse cx="0" cy="-20" rx="22" ry="32" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- Foot on Toes (Plantarflexion) -->
        <path d="M 0 40 L 0 75 L 30 75" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        <!-- Vertical Lift Arrow -->
        <path d="M 45 60 L 45 0" stroke="${p}" stroke-width="3.5" stroke-dasharray="4 3" />
        <polygon points="45,-5 40,5 50,5" fill="${p}" />
      </g>
    `;
  }

  // Abdômen / Core / Prancha
  if (group === 'Abdômen/Core' || group === 'Lombar' || id.includes('abdominal') || id.includes('prancha')) {
    return `
      <g transform="translate(320, 240)">
        <!-- Floor Mat -->
        <line x1="-180" y1="80" x2="180" y2="80" stroke="#475569" stroke-width="6" stroke-linecap="round" />
        <!-- Core Torso -->
        <rect x="-90" y="10" width="180" height="24" rx="12" fill="#334155" />
        <circle cx="110" cy="15" r="18" fill="#64748b" />
        <!-- Rectus Abdominis / Core Segment Highlight -->
        <rect x="-40" y="6" width="80" height="32" rx="10" fill="${p}" fill-opacity="0.9" stroke="#ffffff" stroke-width="2" />
        <!-- 6-pack Grid Overlay -->
        <line x1="0" y1="10" x2="0" y2="34" stroke="#ffffff" stroke-width="1.5" />
        <line x1="-25" y1="22" x2="25" y2="22" stroke="#ffffff" stroke-width="1.5" />
        <!-- Elbow & Foot Support Points -->
        <circle cx="-85" cy="70" r="10" fill="#38bdf8" />
        <circle cx="85" cy="70" r="10" fill="#38bdf8" />
      </g>
    `;
  }

  // Cardiorrespiratórios (Treadmill, Bike, Rowing, Rope)
  if (group === 'Cardiorrespiratórios' || id.includes('corrida') || id.includes('bike') || id.includes('remo')) {
    return `
      <g transform="translate(320, 235)">
        <!-- Dynamic Running / Cycling / Cardio Figure -->
        <circle cx="-10" cy="-60" r="18" fill="#64748b" />
        <path d="M -10 -40 L -20 15 L 40 45" stroke="#334155" stroke-width="18" stroke-linecap="round" fill="none" />
        <!-- Legs in Motion -->
        <path d="M -20 15 L -65 40 L -80 85" stroke="${p}" stroke-width="14" stroke-linecap="round" fill="none" />
        <path d="M -20 15 L 35 30 L 60 75" stroke="#38bdf8" stroke-width="14" stroke-linecap="round" fill="none" />
        <!-- Heart / Cardio Pulse Wave -->
        <path d="M -160 90 L -60 90 L -40 60 L -20 120 L 0 50 L 20 90 L 160 90" stroke="#ef4444" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    `;
  }

  // Mobilidade e Alongamentos
  return `
    <g transform="translate(320, 235)">
      <!-- Flexible Human Joint Trajectory -->
      <circle cx="0" cy="-55" r="18" fill="#64748b" />
      <!-- Torso in Dynamic Stretch -->
      <path d="M 0 -35 Q 20 15 50 50" stroke="#475569" stroke-width="18" stroke-linecap="round" fill="none" />
      <!-- Target Stretch Area Glowing -->
      <ellipse cx="25" cy="20" rx="30" ry="16" fill="${p}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2" />
      <!-- Reaching Arm / Joint Angle -->
      <path d="M 0 -25 L -70 10 L -90 60" stroke="#38bdf8" stroke-width="12" stroke-linecap="round" fill="none" />
      <path d="M 50 50 L 80 85" stroke="#2dd4bf" stroke-width="14" stroke-linecap="round" />
      <!-- Gentle Stretch Harmonic Wave -->
      <path d="M -120 70 Q -60 40 0 70 T 120 70" stroke="${p}" stroke-width="3" fill="none" stroke-dasharray="4 3" />
    </g>
  `;
}

export function generateExerciseIllustrationSvg(exercise: SeedExercise): string {
  const theme = MUSCLE_THEMES[exercise.muscle_group] || DEFAULT_THEME;
  const p = theme.primary;
  const movementSvg = getMovementGraphicSvg(exercise.id, exercise.muscle_group, exercise.equipment || '', theme);

  const cleanName = exercise.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cleanGroup = (exercise.muscle_group || 'GERAL').toUpperCase();
  const cleanEquip = (exercise.equipment || 'PESO LIVRE').toUpperCase();
  const cleanMech = (exercise.mechanics || 'EXERCÍCIO').toUpperCase();

  const secondaries = Array.isArray(exercise.secondary_muscles) && exercise.secondary_muscles.length > 0
    ? exercise.secondary_muscles.join(', ')
    : 'Estabilizadores gerais';

  return `
<svg width="640" height="480" viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background Gradient -->
    <linearGradient id="canvasBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="60%" stop-color="#111827" />
      <stop offset="100%" stop-color="#1e1b4b" />
    </linearGradient>

    <!-- Radial Muscle Focus Glow -->
    <radialGradient id="muscleGlow" cx="50%" cy="46%" r="52%">
      <stop offset="0%" stop-color="${theme.glow}" stop-opacity="0.28" />
      <stop offset="65%" stop-color="${theme.glow}" stop-opacity="0.06" />
      <stop offset="100%" stop-color="#090d16" stop-opacity="0" />
    </radialGradient>

    <!-- Drop Shadow Filter -->
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Background Canvas -->
  <rect width="640" height="480" rx="24" fill="url(#canvasBg)" />
  <rect width="640" height="480" rx="24" fill="url(#muscleGlow)" />

  <!-- Subtle Technical Biomechanical Grid Lines -->
  <g stroke="#334155" stroke-width="1" stroke-opacity="0.16">
    <line x1="36" y1="0" x2="36" y2="480" />
    <line x1="160" y1="0" x2="160" y2="480" />
    <line x1="320" y1="0" x2="320" y2="480" />
    <line x1="480" y1="0" x2="480" y2="480" />
    <line x1="604" y1="0" x2="604" y2="480" />
    <line x1="0" y1="68" x2="640" y2="68" />
    <line x1="0" y1="412" x2="640" y2="412" />
  </g>

  <!-- Corner Tech Accents -->
  <path d="M 24 44 L 24 24 L 44 24" stroke="${p}" stroke-width="2" fill="none" opacity="0.4" />
  <path d="M 616 44 L 616 24 L 596 24" stroke="${p}" stroke-width="2" fill="none" opacity="0.4" />
  <path d="M 24 436 L 24 456 L 44 456" stroke="${p}" stroke-width="2" fill="none" opacity="0.4" />
  <path d="M 616 436 L 616 456 L 596 456" stroke="${p}" stroke-width="2" fill="none" opacity="0.4" />

  <!-- Top Badges Header -->
  <g transform="translate(36, 26)">
    <!-- Muscle Group Badge -->
    <rect width="130" height="26" rx="13" fill="${theme.badgeBg}" stroke="${theme.badgeBorder}" stroke-width="1.5" />
    <text x="65" y="17" fill="${theme.badgeText}" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="800" letter-spacing="1" text-anchor="middle">${cleanGroup}</text>
  </g>

  <g transform="translate(176, 26)">
    <!-- Equipment Badge -->
    <rect width="115" height="26" rx="13" fill="#1e293b" stroke="#475569" stroke-width="1.2" />
    <text x="57" y="17" fill="#cbd5e1" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" letter-spacing="0.5" text-anchor="middle">${cleanEquip}</text>
  </g>

  <g transform="translate(490, 26)">
    <!-- Category / Mechanics Badge -->
    <rect width="114" height="26" rx="13" fill="#0f172a" stroke="#334155" stroke-width="1" />
    <text x="57" y="17" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" letter-spacing="0.5" text-anchor="middle">${cleanMech}</text>
  </g>

  <!-- Central Biomechanical Diagram -->
  ${movementSvg}

  <!-- Footer Information Container -->
  <g transform="translate(36, 422)">
    <text x="0" y="18" fill="#ffffff" font-family="system-ui, -apple-system, sans-serif" font-size="18" font-weight="800">${cleanName}</text>
    <text x="0" y="38" fill="#94a3b8" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="600">Alvo: <tspan fill="${p}" font-weight="700">${cleanGroup}</tspan> • Secundários: ${secondaries}</text>
  </g>

  <!-- Branding Badge -->
  <text x="604" y="460" fill="#475569" font-family="system-ui, -apple-system, sans-serif" font-size="9" font-weight="700" letter-spacing="1" text-anchor="end">ZEMDA PERSONAL • ILUSTRAÇÃO DE REFERÊNCIA</text>
</svg>
  `.trim();
}

export async function generateExerciseIllustrationWebp(exercise: SeedExercise): Promise<Buffer> {
  const svg = generateExerciseIllustrationSvg(exercise);
  return await sharp(Buffer.from(svg))
    .webp({ quality: 90 })
    .toBuffer();
}

export async function syncAllExerciseLibraryImages(rawDb: any): Promise<{
  total: number;
  created: number;
  reused: number;
}> {
  if (!r2StorageService.isConfiguredClient || process.env.R2_MOCK_STORAGE === 'true') {
    return { total: DEFAULT_EXERCISE_LIBRARY.length, created: 0, reused: 0 };
  }
  console.log(`[ExerciseImageSync] Iniciando auditoria e sincronização de ilustrações de fallback para ${DEFAULT_EXERCISE_LIBRARY.length} exercícios...`);

  // Garante tenant global para a foreign key de file_attachments
  try {
    rawDb.exec(`
      INSERT OR IGNORE INTO tenants (id, slug, name, trade_name, email, status)
      VALUES ('global', 'global', 'Zemda Sistema Global', 'Zemda Global', 'sistema@zemda.com.br', 'active');
    `);
  } catch (tErr) {
    console.warn('[ExerciseImageSync] Aviso ao assegurar tenant global:', tErr);
  }

  // Garante tabela file_attachments
  rawDb.exec(`
    CREATE TABLE IF NOT EXISTS file_attachments (
      id TEXT PRIMARY KEY,
      clinic_id TEXT NOT NULL,
      patient_id TEXT,
      appointment_id TEXT,
      assessment_id TEXT,
      exercise_id TEXT,
      professional_id TEXT,
      module_type TEXT,
      test_id TEXT,
      uploaded_by TEXT NOT NULL,
      storage_provider TEXT NOT NULL DEFAULT 'cloudflare_r2',
      object_key TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  try {
    const attachCols = rawDb.prepare('PRAGMA table_info(file_attachments)').all().map((c: any) => c.name);
    if (!attachCols.includes('exercise_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN exercise_id TEXT');
    if (!attachCols.includes('professional_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN professional_id TEXT');
    if (!attachCols.includes('module_type')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN module_type TEXT');
    if (!attachCols.includes('test_id')) rawDb.exec('ALTER TABLE file_attachments ADD COLUMN test_id TEXT');
  } catch (_) {}

  let createdCount = 0;
  let reusedCount = 0;

  for (const ex of DEFAULT_EXERCISE_LIBRARY) {
    // 1. Verifica se já existe anexo legítimo no banco com arquivo real (excluindo antigos fakes)
    const existingAttach = rawDb.prepare(`
      SELECT fa.id, fa.object_key
      FROM file_attachments fa
      JOIN personal_exercises pe ON pe.exercise_file_id = fa.id
      WHERE pe.id = ? 
        AND fa.storage_provider = 'cloudflare_r2'

    `).get(ex.id) as any;

    if (existingAttach && existingAttach.id) {
      // Confirma no serviço de storage R2
      // Existing media is immutable; failures belong in the read-only audit.
      // Do not replace an uploaded photograph with generated artwork.
      reusedCount++;
      continue;
    }

    // 2. Gera a imagem ilustrativa própria e coerente com o exercício em formato WebP
    const webpBuffer = await generateExerciseIllustrationWebp(ex);

    // 3. Define a chave padrão R2 com isolamento: clinics/global/exercises/{exerciseId}/{uuid}.webp
    const fileUuid = uuidv4();
    const objectKey = `clinics/global/exercises/${ex.id}/${fileUuid}.webp`;

    // 4. Envia o arquivo REAL para o Cloudflare R2
    await r2StorageService.uploadFile(objectKey, webpBuffer, 'image/webp');

    if (!await r2StorageService.fileExists(objectKey)) throw new Error('R2 não confirmou o objeto enviado');

    // 5. Cria registro legítimo em file_attachments (evita prefixo att-ex-)
    const attachmentId = `att-illustration-${uuidv4()}`;
    rawDb.prepare(`
      INSERT INTO file_attachments (
        id, clinic_id, patient_id, appointment_id, assessment_id, exercise_id,
        uploaded_by, storage_provider, object_key, original_filename, mime_type,
        file_size, category, created_at, updated_at
      ) VALUES (
        ?, 'global', null, null, null, ?,
        'system', 'cloudflare_r2', ?, ?, 'image/webp',
        ?, 'exercises', datetime('now'), datetime('now')
      )
      ON CONFLICT(id) DO UPDATE SET
        object_key = excluded.object_key,
        file_size = excluded.file_size,
        updated_at = datetime('now')
    `).run(
      attachmentId,
      ex.id,
      objectKey,
      `${ex.id}.webp`,
      webpBuffer.length
    );

    // 6. Atualiza personal_exercises.exercise_file_id com este ID real
    rawDb.prepare(`
      UPDATE personal_exercises
      SET exercise_file_id = ?, updated_at = datetime('now')
      WHERE id = ? AND tenant_id = 'global' AND exercise_file_id IS NULL
    `).run(attachmentId, ex.id);

    // Atualiza o objeto em memória para coerência do processo
    ex.exercise_file_id = attachmentId;

    createdCount++;
  }

  console.log(`[ExerciseImageSync] Concluído com sucesso: ${createdCount} novas imagens geradas e enviadas ao R2, ${reusedCount} já existentes preservadas.`);
  return {
    total: DEFAULT_EXERCISE_LIBRARY.length,
    created: createdCount,
    reused: reusedCount
  };
}
