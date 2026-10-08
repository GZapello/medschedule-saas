# Auditoria do tour de demonstração — 08/10/2026

Escopo: guia após o primeiro acesso, Central de Ajuda e persistência do guia. O wizard de cadastro da clínica, planos e criação de conta não fazem parte desta alteração.

## Decisões

- Sidebar fornece um manifesto das rotas realmente visíveis para o perfil; grupos recolhidos não alteram esse manifesto. O tour usa os mesmos acessos, e abre o grupo e a gaveta mobile antes da medição.
- A filtragem também respeita os gates atuais das APIs: Relatórios aceita administrador; Financeiro/Estoque aceitam administrador ou recepção. O perfil `financial` com permissões no menu ainda recebe 403 nessas APIs; seu guia mostra somente Orçamentos quando permitido. Essa divergência da aplicação foi documentada, sem ampliar acessos ou alterar regras fora do guia.
- Cada alvo tem seletor `data-tour` exato. Os módulos usam a raiz da rota como escopo, pois abas com o mesmo nome existem em especialidades diferentes.
- O posicionamento evita o alvo e, quando há espaço, os demais controles de navegação. Resize, scroll, transições da sidebar e abertura de modais suspendem o card até a nova geometria estabilizar. Campos e dropdowns do alvo continuam utilizáveis.
- A ausência de um alvo após 12 segundos apresenta recuperação e mantém a etapa. Timeout não é prova de falta de autorização. Não há pulo automático de um alvo ausente.
- Equipe e Serviços apontam para os respectivos cartões do hub de Configurações, onde esses recursos estão disponíveis atualmente.
- A rota de Recibos existe, mas não existe um item correspondente na sidebar. A etapa antiga foi removida do tour financeiro.
- Removidas etapas de autosave/finalização/ferramentas que dependiam de consulta ou paciente aberto. O tour de demonstração não abre dados clínicos nem cria consultas para fabricar esses alvos.
- ZemdaEstetic demonstra seleção do cliente e área autorizada. As abas de ficha/fotos/procedimentos só aparecem após selecionar um paciente; as etapas antigas não pertencem ao tour de primeiro acesso.
- Zemda360 demonstra o histórico, seleção de paciente e botão Nova Avaliação. O título do histórico não é mais identificado como se fosse o canvas anatômico.
- ZemdaPersonal usa `personal-dashboard-tab`, e capabilities compartilhadas com Fisioterapia não fazem o guia sugerir uma profissão diferente.
- Backend guarda o ID do tour, ID estável da etapa e índice. O cache usa tenant+usuário. X/ESC só fecham; Pular grava skipped; apenas Não mostrar novamente grava dismissed.
- As únicas mudanças em telas fora dos componentes do guia são marcadores de alvo/carregamento e o preparo da navegação/sidebar.

## Inventário de etapas atuais

O contador é calculado depois da filtragem de permissões, módulo e rotas. Os seletores abaixo são conferidos contra os componentes atuais. `nav-clinical-module` é um marcador do registro resolvido antes de iniciar para `nav-zemda-fisio`, `nav-zemda-med` etc.; nunca é procurado genericamente no DOM.

| Tour | Etapa | Rota | Alvo | Origem |
|---|---|---|---|---|
| solo_professional | solo_dashboard | dashboard | `nav-dashboard` | `common/Sidebar.tsx` |
| solo_professional | solo_calendar | calendar | `nav-calendar` | `common/Sidebar.tsx` |
| solo_professional | solo_patients | patients | `nav-patients` | `common/Sidebar.tsx` |
| solo_professional | solo_clinical | clinical | `nav-clinical` | `common/Sidebar.tsx` |
| solo_professional | solo_module | Módulo profissional autorizado | `nav-clinical-module` | `common/Sidebar.tsx` |
| solo_professional | solo_zemda360 | zemda-body | `nav-zemda-body` | `common/Sidebar.tsx` |
| solo_professional | solo_exams | pending-exams | `nav-pending-exams` | `common/Sidebar.tsx` |
| solo_professional | solo_financial | financial | `nav-financial` | `common/Sidebar.tsx` |
| solo_professional | solo_settings | settings | `nav-settings` | `common/Navbar.tsx` |
| clinic_admin | admin_dashboard | dashboard | `nav-dashboard` | `common/Sidebar.tsx` |
| clinic_admin | admin_calendar | calendar | `nav-calendar` | `common/Sidebar.tsx` |
| clinic_admin | admin_patients | patients | `nav-patients` | `common/Sidebar.tsx` |
| clinic_admin | admin_staff | settings | `settings-team` | `settings/SettingsView.tsx` |
| clinic_admin | admin_services | settings | `settings-services` | `settings/SettingsView.tsx` |
| clinic_admin | admin_financial | financial | `nav-financial` | `common/Sidebar.tsx` |
| clinic_admin | admin_inventory | inventory | `nav-inventory` | `common/Sidebar.tsx` |
| clinic_admin | admin_reports | reports | `nav-reports` | `common/Sidebar.tsx` |
| clinic_admin | admin_settings | settings | `nav-settings` | `common/Navbar.tsx` |
| receptionist | rec_calendar | calendar | `nav-calendar` | `common/Sidebar.tsx` |
| receptionist | rec_new_appt | calendar | `btn-new-appointment` | `calendar/CalendarView.tsx` |
| receptionist | rec_patients | patients | `nav-patients` | `common/Sidebar.tsx` |
| receptionist | rec_whatsapp | calendar | `nav-calendar` | `common/Sidebar.tsx` |
| receptionist | rec_financial | financial | `nav-financial` | `common/Sidebar.tsx` |
| financial | fin_overview | financial | `nav-financial` | `common/Sidebar.tsx` |
| financial | fin_budgets | budgets | `nav-budgets` | `common/Sidebar.tsx` |
| financial | fin_reports | reports | `nav-reports` | `common/Sidebar.tsx` |
| clinical_professional | clin_calendar | calendar | `nav-calendar` | `common/Sidebar.tsx` |
| clinical_professional | clin_start | Módulo profissional autorizado | `nav-clinical-module` | `common/Sidebar.tsx` |
| zemda_fono | fono_evo | zemda-fono | `tab-phonemes` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_fono | fono_lang | zemda-fono | `tab-language` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_fono | fono_audio | zemda-fono | `tab-audiology` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_fono | fono_fluency | zemda-fono | `tab-fluency` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_fono | fono_dysphagia | zemda-fono | `tab-dysphagia` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_fono | fono_voice | zemda-fono | `tab-voice` | `speech-therapy/SpeechTherapyWorkspace.tsx` |
| zemda_psico | psico_sessions | zemda-psico | `tab-sessions` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_anamnese | zemda-psico | `tab-anamnese` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_eem | zemda-psico | `tab-eem` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_risk | zemda-psico | `tab-risk` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_screenings | zemda-psico | `tab-screenings` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_goals | zemda-psico | `tab-goals` | `psychology/PsychologyWorkspace.tsx` |
| zemda_psico | psico_ai | zemda-psico | `psico-ai-btn` | `psychology/PsychologyWorkspace.tsx` |
| zemda_odonto | odonto_odontogram | zemda-odonto | `tab-odontogram` | `dentistry/DentistryWorkspace.tsx` |
| zemda_odonto | odonto_plans | zemda-odonto | `tab-treatment_plans` | `dentistry/DentistryWorkspace.tsx` |
| zemda_odonto | odonto_perio | zemda-odonto | `tab-perio` | `dentistry/DentistryWorkspace.tsx` |
| zemda_odonto | odonto_endo | zemda-odonto | `tab-endo` | `dentistry/DentistryWorkspace.tsx` |
| zemda_odonto | odonto_ortho | zemda-odonto | `tab-ortho_hof` | `dentistry/DentistryWorkspace.tsx` |
| zemda_odonto | odonto_photos | zemda-odonto | `tab-photos_exams` | `dentistry/DentistryWorkspace.tsx` |
| zemda_nutri | nutri_evo | zemda-nutri | `tab-evolution` | `nutrition/NutritionWorkspace.tsx` |
| zemda_nutri | nutri_antropo | zemda-nutri | `tab-anthropometry` | `nutrition/NutritionWorkspace.tsx` |
| zemda_nutri | nutri_bio | zemda-nutri | `tab-bioimpedance` | `nutrition/NutritionWorkspace.tsx` |
| zemda_nutri | nutri_recalls | zemda-nutri | `tab-recalls` | `nutrition/NutritionWorkspace.tsx` |
| zemda_nutri | nutri_meal_plans | zemda-nutri | `tab-meal_plans` | `nutrition/NutritionWorkspace.tsx` |
| zemda_fisio | fisio_evo | zemda-fisio | `tab-evolution` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_kinetic | zemda-fisio | `tab-kinetic_functional` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_pain | zemda-fisio | `tab-pain_zemdabody` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_adm | zemda-fisio | `tab-adm_goniometry` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_strength | zemda-fisio | `tab-muscle_strength` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_tests | zemda-fisio | `tab-functional_tests` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_fisio | fisio_home | zemda-fisio | `tab-home_exercises` | `physiotherapy/PhysiotherapyWorkspace.tsx` |
| zemda_to | to_profile | zemda-to | `tab-profile` | `occupational-therapy/OccupationalTherapyWorkspace.tsx` |
| zemda_to | to_adl | zemda-to | `tab-adl` | `occupational-therapy/OccupationalTherapyWorkspace.tsx` |
| zemda_to | to_sensory | zemda-to | `tab-sensory` | `occupational-therapy/OccupationalTherapyWorkspace.tsx` |
| zemda_to | to_assistive | zemda-to | `tab-assistive_tech` | `occupational-therapy/OccupationalTherapyWorkspace.tsx` |
| zemda_personal | personal_dashboard | zemda-personal | `personal-dashboard-tab` | `personal/ZemdaPersonalView.tsx` |
| zemda_personal | personal_students | zemda-personal | `personal-students-tab` | `personal/ZemdaPersonalView.tsx` |
| zemda_personal | personal_library | zemda-personal | `personal-exercises-tab` | `personal/ZemdaPersonalView.tsx` |
| zemda_personal | personal_templates | zemda-personal | `personal-templates-tab` | `personal/ZemdaPersonalView.tsx` |
| zemda_personal | personal_ai | zemda-personal | `personal-ai-btn` | `personal/ZemdaPersonalView.tsx` |
| zemda_pp | pp_sessions | zemda-pp | `tab-evolution` | `psychopedagogy/PsychopedagogyWorkspace.tsx` |
| zemda_pp | pp_learning | zemda-pp | `tab-learning` | `psychopedagogy/PsychopedagogyWorkspace.tsx` |
| zemda_pp | pp_plans | zemda-pp | `tab-plans_goals` | `psychopedagogy/PsychopedagogyWorkspace.tsx` |
| zemda_pp | pp_school | zemda-pp | `tab-family_school` | `psychopedagogy/PsychopedagogyWorkspace.tsx` |
| zemda_med | med_patient | zemda-med | `medical-patient-select` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_specialty | zemda-med | `tab-specialty` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_anamnese | zemda-med | `tab-anamnesis` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_assessments | zemda-med | `tab-assessments` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_physical_exam | zemda-med | `tab-physical_exam` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_soap | zemda-med | `tab-soap` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_diagnosis | zemda-med | `tab-diagnosis` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_conduct | zemda-med | `tab-conduct` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_med | med_history | zemda-med | `tab-history` | `medical/ZemdaMedWorkspace.tsx` |
| zemda_estetic | estetic_patient | zemda-estetic | `estetic-patient-select` | `estetic/ZemdaEsteticWorkspace.tsx` |
| zemda_estetic | estetic_area | zemda-estetic | `estetic-area-selector` | `estetic/ZemdaEsteticWorkspace.tsx` |
| zemda_body | body_canvas | zemda-body | `body-records-title` | `zemda-body/ZemdaBodyRecordsView.tsx` |
| zemda_body | body_patient | zemda-body | `body-patient-select` | `zemda-body/ZemdaBodyRecordsView.tsx` |
| zemda_body | body_new | zemda-body | `body-new-assessment` | `zemda-body/ZemdaBodyRecordsView.tsx` |

## Reprodução

```powershell
npm run build --prefix backend
Push-Location frontend
node node_modules/typescript/bin/tsc
node node_modules/vite/bin/vite.js build --outDir ../tmp/onboarding-dist
Pop-Location
npx playwright test -c e2e/onboarding.config.ts
```

O servidor de testes usa banco temporário e contas sintéticas. O build isolado em `tmp/onboarding-dist` evita interferência de outros builds em `frontend/dist`. Cada etapa dos percursos completos produz um PNG; traces são retidos em caso de falha.
