/**
 * Utilitários de formatação clínica e profissional da Plataforma Zemda
 */

/**
 * Aplica automaticamente o prefixo "Dr." para masculino e "Dra." para feminino (Item 9)
 * Preserva caso o usuário já tenha inserido o título manualmente.
 */
export function formatDoctorName(name?: string, gender?: string): string {
  if (!name) return '';
  const clean = name.trim();
  if (
    clean.startsWith('Dr.') ||
    clean.startsWith('Dra.') ||
    clean.startsWith('Dr ') ||
    clean.startsWith('Dra ') ||
    clean.startsWith('Doutor') ||
    clean.startsWith('Doutora')
  ) {
    return clean;
  }
  const prefix = gender === 'F' ? 'Dra. ' : 'Dr. ';
  return `${prefix}${clean}`;
}
