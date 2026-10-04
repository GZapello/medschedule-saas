import PDFDocument from 'pdfkit';
import { Response } from 'express';
import { ConsentService, consentBaseUrl, consentAuthenticationLabel } from './consent.service';

/** Server-side PDF uses exactly the immutable snapshots, never current patient/template data. */
export async function writeConsentPdf(data: any, res: Response): Promise<void> {
  const {row,signature,evidence:e,invalidated,integrity}=data;
  const qr=await ConsentService.qr(`${consentBaseUrl()}/verificar/${signature.verification_code}`);
  const doc=new PDFDocument({size:'A4',margin:48,info:{Title:row.title,Author:e.clinic.name}});
  res.setHeader('Content-Type','application/pdf');
  res.setHeader('Content-Disposition',`attachment; filename="termo-${signature.id}.pdf"`);
  res.setHeader('Cache-Control','no-store');
  doc.pipe(res);
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#134e4a').text(e.clinic.name);
  doc.moveDown(.5).fontSize(18).text(row.title);
  doc.moveDown(.5).font('Helvetica').fontSize(10).fillColor('#334155').text(`Paciente: ${e.patient.name} | Versão: ${e.version}`);
  doc.moveDown().fontSize(11).fillColor('#0f172a').text(row.content_text,{lineGap:4});
  doc.moveDown().font('Helvetica-Bold').text('Declarações aceitas');
  doc.font('Helvetica').fontSize(10);
  for (const declaration of e.declarations) doc.moveDown(.3).text(`- ${declaration}`);
  const evidenceHeight=signature.photo_data_url?650:e.signer.kind==='guardian'?590:530;
  if(doc.y+evidenceHeight>doc.page.height-48) doc.addPage();
  else doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#134e4a').text('TERMO ASSINADO ELETRONICAMENTE');
  doc.moveDown().font('Helvetica').fontSize(10).fillColor('#0f172a');
  const fields=[
    ['Paciente',e.patient.name],['Clínica',e.clinic.name],['Profissional solicitante',e.professional.name],
    ['Data e hora',new Date(e.signedAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (America/Sao_Paulo)'],
    ['Método de autenticação',consentAuthenticationLabel(e.authMethod)],['OTP validado',e.otpVerified?'Sim':'Não utilizado'],
    ['Identificador da assinatura',e.signatureId],['Versão do documento',e.version],['SHA-256 do conteúdo',e.contentHash],
    ['SHA-256 das evidências',signature.evidence_hash]
  ];
  if(e.signer.kind==='guardian') {
    doc.font('Helvetica-Bold').text('Assinado eletronicamente pelo responsável legal do paciente.').font('Helvetica').moveDown();
    fields.splice(1,0,['Responsável legal',e.signer.name],['CPF do responsável',e.signer.cpf],['Parentesco',e.signer.relationship]);
  }
  for(const [label,value] of fields) doc.text(`${label}: ${value}`,{lineGap:3});
  if(invalidated || !integrity) doc.moveDown().fillColor('#b91c1c').text(invalidated?'DOCUMENTO CANCELADO/INVALIDADO — evidências originais preservadas.':'INTEGRIDADE NÃO CONFIRMADA').fillColor('#0f172a');
  doc.moveDown().text('Assinatura manuscrita:');
  doc.image(Buffer.from(signature.signature_data_url.split(',')[1],'base64'),48,doc.y+8,{fit:[300,90]});
  doc.y+=110;
  if(signature.photo_data_url) {
    if(doc.y>600) doc.addPage();
    doc.text('REGISTRO FOTOGRÁFICO DA ASSINATURA');
    doc.fontSize(9).text('Registro fotográfico realizado no momento da assinatura');
    doc.image(Buffer.from(signature.photo_data_url.split(',')[1],'base64'),48,doc.y+8,{fit:[90,90]});
    doc.y+=110;
  }
  if(doc.y>640) doc.addPage();
  const y=doc.y;
  doc.image(Buffer.from(qr.split(',')[1],'base64'),48,y,{width:96});
  doc.fontSize(9).text('Verifique a autenticidade pelo QR Code.',156,y+12,{width:330});
  doc.text(`${consentBaseUrl()}/verificar/${signature.verification_code}`,156,y+32,{width:330,link:`${consentBaseUrl()}/verificar/${signature.verification_code}`});
  doc.end();
}
