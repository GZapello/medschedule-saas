/**
 * Client-Side Image Optimizer
 * Otimizador de imagens no navegador para Prontuários e Fotos Clínicas Zemda
 * - Correção e preservação de orientação EXIF
 * - Redimensionamento inteligente proporcional (limite 1600px - 2000px, padrão 1800px)
 * - Compressão com qualidade perceptual ~85%
 * - REGRA CRÍTICA: Se for exame de diagnóstico por imagem (isDiagnostic = true),
 *   não altera dimensões nem aplica compressão com perda, preservando 100% da fidelidade.
 */

export interface OptimizeImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  isDiagnostic?: boolean;
  outputType?: 'image/jpeg' | 'image/webp' | 'image/png';
}

export async function optimizeImageFile(
  file: File,
  options: OptimizeImageOptions = {}
): Promise<File> {
  // Se for exame diagnóstico (ex: radiografia periapical, tomografia, RX panorâmico),
  // PRESERVAÇÃO INTEGRAL SEM PERDAS
  if (options.isDiagnostic) {
    return file;
  }

  // Apenas arquivos de imagem são processados
  if (!file.type.startsWith('image/')) {
    return file;
  }

  // Não comprime SVG ou GIF
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  const maxWidth = options.maxWidth || 1800;
  const maxHeight = options.maxHeight || 1800;
  const quality = options.quality !== undefined ? options.quality : 0.85;
  const outputType = options.outputType || (file.type === 'image/png' ? 'image/png' : 'image/jpeg');

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;

        // Se dimensões já estão dentro do limite e arquivo for leve (< 600KB), mantém
        if (width <= maxWidth && height <= maxHeight && file.size < 600 * 1024 && file.type === outputType) {
          resolve(file);
          return;
        }

        // Calcula novas dimensões preservando proporção de tela
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // Desenha no canvas (browsers modernos aplicam automaticamente EXIF orientation do objeto Image)
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Se o arquivo gerado for maior que o original, mantém o original
            if (blob.size >= file.size) {
              resolve(file);
              return;
            }

            const optimizedFile = new File([blob], file.name, {
              type: outputType,
              lastModified: Date.now()
            });

            resolve(optimizedFile);
          },
          outputType,
          quality
        );
      };

      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };

    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}
