// Utilitário para conversão de valores monetários em Real para valor por extenso em Português

const UNIDADES = [
  '', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
  'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'
];

const DEZENAS = [
  '', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'
];

const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos',
  'seiscentos', 'setecentos', 'oitocentos', 'novecentos'
];

function converterGrupo(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';

  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;

  const partes: string[] = [];

  if (c > 0) partes.push(CENTENAS[c]);

  const resto = n % 100;
  if (resto > 0) {
    if (resto < 20) {
      partes.push(UNIDADES[resto]);
    } else {
      partes.push(DEZENAS[d]);
      if (u > 0) {
        partes.push(UNIDADES[u]);
      }
    }
  }

  return partes.join(' e ');
}

export function valorPorExtenso(valor: number): string {
  if (isNaN(valor) || valor <= 0) return 'zero real';

  const inteiro = Math.floor(valor);
  const centavos = Math.round((valor - inteiro) * 100);

  const partesTexto: string[] = [];

  if (inteiro > 0) {
    const milhares = Math.floor(inteiro / 1000);
    const unidades = inteiro % 1000;

    const partesMilhares: string[] = [];
    if (milhares > 0) {
      if (milhares === 1) {
        partesMilhares.push('mil');
      } else {
        partesMilhares.push(`${converterGrupo(milhares)} mil`);
      }
    }

    if (unidades > 0) {
      partesMilhares.push(converterGrupo(unidades));
    }

    const textoReais = partesMilhares.join(' e ');
    const sufixoReal = inteiro === 1 ? 'real' : 'reais';
    partesTexto.push(`${textoReais} ${sufixoReal}`);
  }

  if (centavos > 0) {
    const textoCentavos = converterGrupo(centavos);
    const sufixoCentavos = centavos === 1 ? 'centavo' : 'centavos';
    partesTexto.push(`${textoCentavos} ${sufixoCentavos}`);
  }

  if (partesTexto.length === 0) {
    return 'zero real';
  }

  return partesTexto.join(' e ');
}
