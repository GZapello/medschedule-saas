import React from 'react';

const labels: Record<string, string> = {
  clinicalHistory: 'Histórico clínico', bowelHabits: 'Hábitos intestinais', routineWakeUp: 'Horário de despertar',
  routineSleep: 'Horário de sono', physicalActivity: 'Atividade física', bmi: 'IMC', bmr: 'Taxa metabólica basal',
  totalEnergy: 'Gasto energético total', carbG: 'Carboidratos (g)', protG: 'Proteínas (g)', protGPerKg: 'Proteínas (g/kg)', fatG: 'Gorduras (g)',
  calorieTarget: 'Meta calórica', waterTargetMl: 'Meta de água (ml)', generalGuidelines: 'Orientações gerais', meals: 'Refeições',
  mealName: 'Refeição', mealTime: 'Horário', items: 'Itens', food: 'Alimento', portion: 'Porção', calories: 'Calorias',
  carb: 'Carboidratos', protein: 'Proteínas', fat: 'Gorduras', recallDate: 'Data do recordatório', isWeekend: 'Fim de semana',
  waterIntakeMl: 'Ingestão de água (ml)', name: 'Nome', time: 'Horário', goalForm: 'Meta em elaboração',
  description: 'Descrição', category: 'Categoria', targetValue: 'Objetivo', calcFormula: 'Fórmula', activityFactor: 'Fator de atividade',
  injuryFactor: 'Fator de lesão', carbPercent: 'Carboidratos (%)', proteinPercent: 'Proteínas (%)', fatPercent: 'Gorduras (%)',
  occupationalHistory: 'Histórico ocupacional', dailyRoutine: 'Rotina diária', interests: 'Interesses', environment: 'Ambiente',

  anamnesisData: 'Anamnese', anamnesis: 'Anamnese', assessment: 'Avaliação', assessmentData: 'Avaliação',
  profileData: 'Perfil ocupacional', adlData: 'Atividades de vida diária', sensoryData: 'Avaliação sensorial',
  motorCognitiveData: 'Avaliação motora e cognitiva', treatmentPlanData: 'Plano terapêutico', assistiveTechnologyData: 'Tecnologia assistiva',
  phonemesData: 'Fonemas', languageData: 'Linguagem', orofacialData: 'Motricidade orofacial', voiceData: 'Voz',
  fluencyData: 'Fluência', dysphagiaData: 'Disfagia', audiologyData: 'Audiologia', audioData: 'Amostra de voz',
  bioimpedanceData: 'Bioimpedância', recallData: 'Recordatório alimentar', mealPlanData: 'Plano alimentar', goalsData: 'Metas',
  anthropometryForm: 'Antropometria', calculationInputs: 'Parâmetros dos cálculos', calculationsData: 'Cálculos nutricionais',
  periodontalData: 'Periodontia', endodonticData: 'Endodontia', prostheticData: 'Prótese', orthodonticData: 'Ortodontia', facialData: 'Harmonização facial',
  odontogramData: 'Odontograma', toothChanges: 'Alterações dentárias', proceduresPerformed: 'Procedimentos',
  painScore: 'Escala de dor', painLocation: 'Local da dor', painCharacteristics: 'Características da dor', conductsExercises: 'Condutas e exercícios',
  bodyMapJson: 'Mapa de dor', bodyMapImage: 'Imagem do mapa de dor', notes: 'Observações', weight: 'Peso (kg)', height: 'Altura (cm)',
  waistCirc: 'Cintura (cm)', abdominalCirc: 'Circunferência abdominal (cm)', hipCirc: 'Quadril (cm)', clinicalEvolution: 'Evolução clínica', conducts: 'Condutas',

  // Odontologia & Orçamentos
  toothNumber: 'Dente / Região', tooth: 'Dente', face: 'Face', condition: 'Condição', previousCondition: 'Condição prévia',
  labName: 'Laboratório', workType: 'Tipo de trabalho protético', shadeColor: 'Cor (Escala VITA)', material: 'Material',
  sentDate: 'Data de envio', expectedDate: 'Previsão de entrega', receivedDate: 'Data de recebimento', costValue: 'Custo do laboratório (R$)',
  totalValue: 'Valor total bruto (R$)', discountValue: 'Desconto (R$)', finalValue: 'Valor líquido final (R$)', paymentTerms: 'Condições de pagamento',
  procedure: 'Procedimento', procedureName: 'Procedimento', status: 'Status', budgetNumber: 'Número do orçamento', budgetId: 'ID do orçamento',
  unitPrice: 'Valor unitário (R$)', totalPrice: 'Valor total (R$)', quantity: 'Quantidade',

  // Personal Trainer / Cineantropometria
  bodyFatPct: '% de Gordura', body_fat_percentage: '% de Gordura', leanMassKg: 'Massa magra (kg)', lean_mass_kg: 'Massa magra (kg)',
  fatMassKg: 'Massa gorda (kg)', fat_mass_kg: 'Massa gorda (kg)', muscleMassKg: 'Massa muscular (kg)', muscle_mass_kg: 'Massa muscular (kg)',
  whr: 'Relação cintura-quadril (RCQ)', whtr: 'Relação cintura-estatura (RCE)', tavVal: 'Taxa de adiposidade visceral (TAV)',
  tav_value: 'Taxa de adiposidade visceral (TAV)', tavClassification: 'Classificação TAV', tav_classification: 'Classificação TAV',
  division: 'Divisão de treino', structure_type: 'Estrutura do treino', exercises: 'Exercícios prescritos', sets: 'Séries',
  reps: 'Repetições', load_kg: 'Carga (kg)', rest_seconds: 'Descanso (segundos)', custom_name: 'Nome do exercício',

  // Mapeamento Anatômico 360 / Estética
  bodyModel: 'Modelo anatômico', module: 'Módulo clínico', chiefComplaint: 'Queixa principal', hpi: 'História da moléstia atual (HMA)',
  pastMedicalHistory: 'Histórico médico pregresso', familyHistory: 'Histórico familiar', habitsLifestyle: 'Hábitos e estilo de vida',
  vitalSigns: 'Sinais vitais', physicalExam: 'Exame físico', neurologicalExam: 'Exame neurológico', soapNotes: 'Notas SOAP',
  diagnosticHypotheses: 'Hipóteses diagnósticas', cidCode: 'Código CID', cidDescription: 'Descrição CID', returnInDays: 'Retorno em (dias)',
  adverseEvents: 'Eventos adversos / Intercorrências', techniqueNotes: 'Técnica e conduta', observations: 'Observações',
  region: 'Região corporal', productName: 'Produto', batchLot: 'Lote', expiryDate: 'Validade', returnDate: 'Data prevista de retorno'
};

const valueTranslations: Record<string, string> = {
  sent_to_lab: 'Enviado ao laboratório',
  in_production: 'Em confecção no laboratório',
  delivered_to_clinic: 'Entregue na clínica',
  tested_adjusted: 'Provado e ajustado',
  installed: 'Instalado em boca',
  canceled: 'Cancelado',
  planned: 'Planejado',
  approved: 'Aprovado',
  draft: 'Rascunho',
  pending: 'Pendente',
  female: 'Feminino',
  male: 'Masculino',
  completed: 'Concluído',
  healthy: 'Hígido',
  decayed: 'Cariado',
  restored: 'Restaurado',
  missing: 'Ausente',
  implant: 'Implante',
  crown: 'Coroa'
};

const metadata = new Set([
  'patientId', 'patient_id', 'appointmentId', 'appointment_id', 'professionalId', 'professional_id',
  'tenantId', 'tenant_id', 'saveOnly', 'payment', 'moduleType', 'module_type', 'sourceId', 'source_id',
  'sourceType', 'source_type', 'title', 'isSealed', 'is_sealed', 'clinicalEvolution', 'technicalNotes',
  'conducts', 'moduleData', 'attachmentIds', 'created_at', 'updated_at', 'id'
]);

function Value({ value }: { value: any }): React.ReactElement | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && value.startsWith('data:audio/')) return <audio controls src={value} className="max-w-full" />;
  if (typeof value === 'string' && /^data:image\/(png|jpeg|webp);/.test(value)) return <img src={value} alt="Imagem clínica salva" className="max-w-full max-h-96 rounded-xl border border-slate-200" />;
  if (typeof value === 'string' && /^[\[{]/.test(value)) {
    try { return <Value value={JSON.parse(value)} />; } catch { /* Texto livre */ }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400 italic">Nenhum</span>;
    return (
      <ul className="space-y-1.5 list-disc pl-4 my-1">
        {value.map((item, idx) => (
          <li key={idx} className="marker:text-indigo-400">
            <Value value={item} />
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value).filter(([key, val]) => !metadata.has(key) && val !== null && val !== '');
    if (entries.length === 0) return null;
    return (
      <dl className="space-y-1.5 border-l-2 border-slate-200 dark:border-slate-700 pl-3 my-1">
        {entries.map(([key, val]) => (
          <div key={key} className="text-xs">
            <dt className="font-bold text-slate-700 dark:text-slate-300">
              {labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}:
            </dt>
            <dd className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words">
              <Value value={val} />
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  if (typeof value === 'boolean') {
    return <span className="font-semibold text-slate-700 dark:text-slate-300">{value ? 'Sim' : 'Não'}</span>;
  }

  const strVal = String(value);
  if (valueTranslations[strVal]) {
    return <span className="font-medium text-slate-800 dark:text-slate-200">{valueTranslations[strVal]}</span>;
  }

  return <span>{strVal}</span>;
}

export function ClinicalSnapshot({ record }: { record: any }) {
  if (!record) return null;
  const medicalPayload = record.module_type === 'ZemdaMed' && record.technical_notes && !record.module_data_json && !record.clinical_data_json;
  return (
    <section className="space-y-3 text-xs text-slate-800 dark:text-slate-200">
      {medicalPayload && (
        <div className="p-3 bg-blue-50/50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/50">
          <h4 className="font-bold text-blue-900 dark:text-blue-300 mb-2">Dados da consulta médica</h4>
          <Value value={record.technical_notes} />
        </div>
      )}
      {record.procedure_name && (
        <p><strong className="text-slate-700 dark:text-slate-300">Procedimentos:</strong> {record.procedure_name}</p>
      )}
      {record.conducts && (
        <p className="whitespace-pre-wrap"><strong className="text-slate-700 dark:text-slate-300">Condutas:</strong> {record.conducts}</p>
      )}
      {record.module_data_json && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="font-bold text-slate-900 dark:text-white mb-2">
            Dados estruturados — {record.module_type || 'Prontuário Clínico'}
          </h4>
          <Value value={record.module_data_json} />
        </div>
      )}
      {record.clinical_data_json && record.clinical_data_json !== record.module_data_json && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
          <h4 className="font-bold text-slate-900 dark:text-white mb-2">Informações clínicas adicionais</h4>
          <Value value={record.clinical_data_json} />
        </div>
      )}
      {record.attachments?.length > 0 && (
        <div>
          <h4 className="font-bold mb-1">Anexos ({record.attachments.length})</h4>
          <div className="flex flex-wrap gap-2">
            {record.attachments.map((a: any) => (
              <a
                key={a.id}
                className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition"
                href={a.file_url}
                target="_blank"
                rel="noreferrer"
              >
                {a.title || a.name || 'Abrir anexo'}
              </a>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
