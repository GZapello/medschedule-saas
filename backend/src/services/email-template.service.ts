export interface ZemdaEmailTemplateOptions {
  title: string;
  preheader?: string;
  headline: string;
  badge?: string;
  contentHtml: string;
  ctaText?: string;
  ctaUrl?: string;
  footerNote?: string;
}

/**
 * Construtor universal de e-mails responsivos nos padrões visuais do Zemda.
 * Compatível com Gmail, Outlook Desktop/Web, Apple Mail e clientes mobile.
 */
export function buildZemdaEmailLayout(options: ZemdaEmailTemplateOptions): string {
  const {
    title,
    preheader = 'Zemda — Plataforma de Gestão em Saúde',
    headline,
    badge = 'Plataforma Integrada',
    contentHtml,
    ctaText,
    ctaUrl,
    footerNote
  } = options;

  const currentYear = new Date().getFullYear();
  const logoUrl = 'https://zemda.com.br/brand/zemda-logo.png';

  const ctaBlock = ctaText && ctaUrl
    ? `
      <div style="margin: 28px 0 20px; text-align: center;">
        <!--[if mso]>
        <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${ctaUrl}" style="height:44px;v-text-anchor:middle;width:240px;" arcsize="20%" stroke="f" fillcolor="#0d9488">
          <w:anchorlock/>
          <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;">${ctaText}</center>
        </v:roundrect>
        <![endif]-->
        <!--[if !mso]><!-- -->
        <a href="${ctaUrl}" style="display: inline-block; background-color: #0d9488; color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 12px; font-weight: 700; font-size: 14px; letter-spacing: 0.2px; box-shadow: 0 2px 6px rgba(13, 148, 136, 0.25);">
          ${ctaText}
        </a>
        <!--<![endif]-->
      </div>
    `
    : '';

  const noteBlock = footerNote
    ? `<p style="margin: 20px 0 0; font-size: 12px; line-height: 1.5; color: #64748b;">${footerNote}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${title}</title>
  <!-- Preheader invisível para visualização nos clientes de e-mail -->
  <span style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </span>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    a[x-apple-data-detectors] { color: inherit !important; text-decoration: none !important; }
    @media only screen and (max-width: 600px) {
      .responsive-table { width: 100% !important; }
      .responsive-padding { padding: 24px 20px !important; }
      .header-padding { padding: 24px 20px !important; }
    }
  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 32px 12px;">
    <tr>
      <td align="center">
        <!-- Container Principal -->
        <table role="presentation" width="100%" class="responsive-table" style="max-width: 560px; background-color: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);">
          <!-- Header Branding com Logotipo Oficial -->
          <tr>
            <td class="header-padding" style="padding: 28px 32px 24px; text-align: center; border-bottom: 1px solid #0f172a; background: linear-gradient(135deg, #042f2e 0%, #0f172a 100%);">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center">
                    <img src="${logoUrl}" alt="Zemda" width="130" height="auto" style="display: block; margin: 0 auto; max-width: 130px; height: auto; border: 0;" />
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding-top: 6px;">
                    <span style="font-size: 11px; color: #99f6e4; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">
                      ${badge}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Corpo do Conteúdo -->
          <tr>
            <td class="responsive-padding" style="padding: 36px 32px 28px; text-align: left; font-size: 14px; line-height: 1.6; color: #334155;">
              <h1 style="margin: 0 0 16px; font-size: 20px; font-weight: 800; color: #0f172a; line-height: 1.35; letter-spacing: -0.3px;">
                ${headline}
              </h1>

              ${contentHtml}

              ${ctaBlock}

              ${noteBlock}
            </td>
          </tr>

          <!-- Rodapé Institucional -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8fafc; border-top: 1px solid #f1f5f9; text-align: center; font-size: 12px; line-height: 1.6; color: #64748b;">
              <p style="margin: 0 0 6px;">
                <strong>Zemda</strong> · Plataforma Integrada de Gestão e Prontuário em Saúde
              </p>
              <p style="margin: 0 0 8px; color: #94a3b8; font-size: 11px;">
                &copy; ${currentYear} Zemda Tecnologia. Todos os direitos reservados.
              </p>
              <p style="margin: 0; font-size: 11px;">
                <a href="https://zemda.com.br" style="color: #0d9488; text-decoration: none; font-weight: 600;">zemda.com.br</a>
                &nbsp;·&nbsp;
                <a href="mailto:suporte@zemda.com.br" style="color: #0d9488; text-decoration: none;">suporte@zemda.com.br</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
