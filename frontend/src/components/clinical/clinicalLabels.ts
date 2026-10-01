// Mapa compartilhado de labels e terminologias clínicas do Zemda
export const clinicalLabels: Record<string, string> = {
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

export const labels = clinicalLabels;
