export interface ParsedVideoInfo {
  provider: 'youtube' | 'vimeo' | 'google_drive' | 'direct' | 'generic';
  embedUrl: string | null;
  originalUrl: string;
  isEmbeddable: boolean;
  label: string;
}

export function parseExternalVideoUrl(rawUrl: string | null | undefined): ParsedVideoInfo | null {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }

    const host = url.hostname.toLowerCase();

    // YouTube (inclui youtube.com, youtu.be, m.youtube.com e Shorts)
    const ytMatch = trimmed.match(
      /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?|shorts)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/i
    );
    if (ytMatch && ytMatch[1]) {
      const videoId = ytMatch[1];
      return {
        provider: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1`,
        originalUrl: trimmed,
        isEmbeddable: true,
        label: 'YouTube'
      };
    }

    // Vimeo
    const vimeoMatch = trimmed.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (vimeoMatch && vimeoMatch[1]) {
      const vimeoId = vimeoMatch[1];
      return {
        provider: 'vimeo',
        embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
        originalUrl: trimmed,
        isEmbeddable: true,
        label: 'Vimeo'
      };
    }

    // Google Drive
    const driveMatch = trimmed.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (driveMatch && driveMatch[1]) {
      const driveId = driveMatch[1];
      return {
        provider: 'google_drive',
        embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
        originalUrl: trimmed,
        isEmbeddable: true,
        label: 'Google Drive'
      };
    }

    const driveOpenMatch = trimmed.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
    if (driveOpenMatch && driveOpenMatch[1]) {
      const driveId = driveOpenMatch[1];
      return {
        provider: 'google_drive',
        embedUrl: `https://drive.google.com/file/d/${driveId}/preview`,
        originalUrl: trimmed,
        isEmbeddable: true,
        label: 'Google Drive'
      };
    }

    // Outros links HTTP/HTTPS válidos (ex: Loom, Instagram, vídeo direto)
    return {
      provider: 'generic',
      embedUrl: null,
      originalUrl: trimmed,
      isEmbeddable: false,
      label: host.replace(/^www\./, '')
    };
  } catch {
    return null;
  }
}

export function isValidVideoUrl(url: string | null | undefined): boolean {
  return parseExternalVideoUrl(url) !== null;
}
