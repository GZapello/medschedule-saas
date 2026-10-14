# Auditoria mobile e Android — Zemda

Data: **14/10/2026**. Escopo: somente `frontend/`. Nenhum arquivo de `backend/` foi alterado. Não houve alteração de APIs, regras clínicas, cálculos financeiros, migrations ou banco de dados.

**Resultado:** preparação frontend/Android implementada e artefatos técnicos gerados. A publicação depende de assinatura release, configuração externa Google, validação em aparelho e revisão das exigências do Play Console. O AAB desta auditoria é **sem assinatura**, não um arquivo pronto para submissão.

## 1. Arquivos alterados

A lista completa está no apêndice ao final. Principais pontos: estilos mobile isolados, `ResponsiveTable`, navegação compartilhada, agenda, SuperAdmin Android, utilitários nativos de navegação/download/impressão, configuração Capacitor, projeto Android, assets oficiais e testes frontend.

Os relatórios de execução e binários ficam em `frontend/test-results/`, ignorados pelo Git. `android/local.properties` também permanece local/ignorado; foi corrigido o escape do caminho do SDK para passar no lint.

## 2. Problemas encontrados

- Inventário inicial: **956 ocorrências** dos padrões estruturais pesquisados em `src/`, registrado em `mobile-audit-inventory.txt`; links/downloads em `mobile-link-inventory.txt`.
- **51 tabelas** mantinham representação horizontal; algumas impunham largura mínima.
- Abas clínicas compartilhadas dependiam de arraste lateral e rolagem por mouse.
- A agenda permitia ativar a semana com largura mínima de 800 px no celular.
- Cabeçalhos de cinco módulos passavam cedo demais para uma linha em 768 px.
- O chip do seletor de paciente e as ações do perfil Personal ultrapassavam 320 px quando havia paciente selecionado.
- Modais usavam limites em `vh`, controles pequenos e formulários densos; havia mascaramento global por `body { overflow-x: hidden }`.
- Package antigo, tráfego HTTP/misto, certificados de usuário em produção, depuração WebView indiscriminada e backup permitido.
- Google GSI web era usado no WebView Android, plataforma que o Google não suporta para esse fluxo.
- Downloads via blob/âncoras e documentos de impressão dependiam de comportamento de navegador desktop. Redirecionamentos programáticos do checkout/atualização também precisavam sair do WebView.

## 3. Correções feitas e limites da verificação

- Estilos de adaptação limitados a telas abaixo de 1024 px, com refinamentos abaixo de 640 px. O desktop conserva suas tabelas, abas e agenda semanal; o novo acesso Android no SuperAdmin é uma adição solicitada.
- Causas de largura mínima corrigidas; no mobile o `body` volta a permitir overflow visível para que os testes detectem problemas reais. Não foi usado ocultamento global como solução. O teste verifica também contêineres internos com `overflow-x: auto/scroll`.
- Agenda mobile por dia com seletor de data, anterior/próximo e cards verticais. Horários avulsos continuam entrando nos slots existentes; regras de disponibilidade foram preservadas.
- Tabelas com uma única fonte de dados/ações e linhas apresentadas como cards rotulados no mobile. A adaptação não afeta impressão A4.
- Safe areas nos quatro lados, viewport com `viewport-fit=cover`, limites `100dvh`, modal rolável, inputs sem zoom automático e touch targets de 44 px nos controles principais. Campos numéricos específicos recebem teclado adequado.
- Odontograma preserva dentes/faces e ganha ajuste responsivo, zoom/pan interno e pinça. Mapas, marcações, caneta, borracha e coordenadas normalizadas existentes foram preservados.
- Botão Voltar usa `@capacitor/app`, fecha o overlay superior, depois drawer/subpágina, e não encerra o app na tela principal.
- Login Google nativo reutiliza ID token e callbacks existentes; não foi criado endpoint de autenticação.
- Exportações e anexos nativos usam cache privado + compartilhar/salvar. Impressão HTML usa serviço Android. Links externos/WhatsApp/checkout/atualizações usam navegador do sistema; e-mail/telefone usam apps apropriados.
- Mantidos lazy loading dos módulos e conteúdo completo de mídia/exercícios. Não houve refatoração de regras ou retirada de funcionalidades. O build ainda informa chunk principal de aproximadamente 548 kB; não é erro de compilação.

Evidência automatizada:

- **1.498 verificações** de rota/aba/viewport aprovadas: `test-results/mobile-comprehensive-final.log`.
- Larguras mobile/tablet: **320, 360, 375, 390, 412, 430, 480, 600 e 768 px**. Desktop: **1024, 1280, 1440 e 1920 px**.
- Cobertos landing, login, cadastro, dashboard, agenda, pacientes/perfil, atendimentos, financeiro, estoque, orçamentos, configurações, relatórios, exames, dez módulos clínicos, perfis Personal/Estetic, Zemda360 e áreas do SuperAdmin.
- **136 verificações** adicionais aprovadas de modais (inclusive portais fora do root React), altura reduzida a 450 px e fechamento/retorno pelo evento Voltar, incluindo seções internas de Configurações e SuperAdmin: `test-results/mobile-interactions-portal2.log`.
- Caneta, borracha, coordenadas normalizadas, 32 dentes e marcação após zoom aprovados nas **nove larguras mobile/tablet**: `test-results/mobile-graphics2.log`.
- **112 verificações desktop** aprovadas e **108 comparações de geometria dos controles com o frontend original**, usando CSS original reconstruído, sem diferenças. As quatro vistas SuperAdmin ficam fora da comparação geométrica por terem o menu Android novo. Evidência: `test-results/desktop-differences.json`.
- **88 verificações de regressão** aprovadas após os ajustes finais de exportação/navegação nativa: `test-results/mobile-delivery-regression.log`.
- **13 verificações** adicionais com URL de APK configurada confirmaram que o link aparece no SuperAdmin e não aparece em login/dashboard/pacientes de usuários normais: `test-results/android-download-role.log`.
- Dependências de produção: `npm audit --omit=dev` registrou **zero vulnerabilidades**. O audit completo registrou 12 avisos em ferramentas de desenvolvimento; não foi forçada migração de Tailwind/CLI nesta tarefa.

Os testes usam componentes reais, identidade e dados sintéticos e bloqueiam mutações/chamadas externas. Não são certificação de todos os dados reais possíveis nem substituem E2E de autenticação/cobrança no ambiente de homologação. **ADB não encontrou aparelho conectado:** teclado real, permissões, OAuth real, gestos, impressão e retorno de apps externos precisam de validação final em Android.

## 4. Telas convertidas de tabela para cards

São 51 tabelas em 33 arquivos de tela/componente, incluindo pacientes, financeiro/caixa, estoque/movimentações, orçamentos/itens, auditoria, histórico clínico, recibos, comissões, equipe/profissionais/horários, importação, configurações, taxonomia, exames, relatórios e comparações clínicas, Personal, Estetic, Fono/audiologia, Odonto, Zemda360 e SuperAdmin.

A lista exata de componentes está no apêndice “Tabelas responsivas”. Componentes que já eram cards/listas foram preservados.

## 5. Abas e navegação mobile

O `HorizontalTabNav` compartilhado apresenta “Seção atual” no mobile e mantém o conteúdo/rolagem originais no desktop. Isso atende ZemdaFono, Fisio, Nutri, TO, Psico, PP, Odonto, Med, Personal e Estetic, além do perfil de paciente. O perfil do aluno tem “Seção do aluno”. O SuperAdmin tem “Área global”, com Clínicas, Profissões, Assinaturas, Integridade, Integrações, Testes grátis, WhatsApp, Laboratório e Aplicativo Android. Zemda360 conserva seus seletores compactos e mapas responsivos.

Barras menores restantes usam quebra de linha, sem rolagem lateral. Não foram removidas áreas clínicas.

## 6. Capacitor

Capacitor Android/Core/CLI **8.5.1**, sincronização concluída. Plugins sincronizados: App, AppLauncher, Browser, Filesystem, Share e SocialLogin (somente Google habilitado). O plugin local `ZemdaPrint` é registrado no MainActivity.

Produção usa `https`, `cleartext: false`, `allowMixedContent: false` e depuração WebView desligada. Debug mantém exceções locais limitadas na configuração de rede. Backup legado/nuvem/transferência entre dispositivos exclui dados locais. FileProvider expõe somente cache de exportações e fotos privadas de captura necessárias aos recursos existentes.

## 7. Build Android

`npm install`, `npm run build` e `npx cap sync android` executados com sucesso. `assembleDebug`, `bundleRelease` e `lintDebug` foram executados; as rodadas aprovadas estão registradas em `test-results/android-complete.log`, `test-results/android-delivery.log` e a entrega final em `test-results/android-final-build.log` (lint aprovado em `test-results/android-handoff.log`).

O projeto usa API 36/min SDK 24, JDK 21, AGP 8.13 e Gradle 8.14.3. O lint corrigiu quatro erros locais/de configuração; a execução aprovada tem **zero erros**, com avisos residuais documentados no relatório HTML. Há aviso de deprecações Gradle para uma futura versão 9; a versão atual foi mantida.

Uma limpeza de cache foi rejeitada pela revisão automática (“blocked by policy”). Os arquivos anteriores foram preservados e a compilação foi realizada com diretório novo **dentro de frontend/**, sem precisar apagar o cache.

## 8. Package ID final

**`br.com.zemda.app`**, consistente em Capacitor, namespace/applicationId Gradle, strings/custom scheme e package/diretório Java. O usuário confirmou que `com.medschedule.app` nunca foi publicado nem vinculado ao Play Console. Configurações externas continuam dependendo dos respectivos consoles; não foram inventadas credenciais.

## 9. Versão

**versionName: `1.1.2` — versionCode: `10102`.** Valores existentes preservados e centralizados no `package.json`. A UI, os metadados Vite e o Gradle leem essa fonte. Data de build é informada no card como build frontend.

## 10. APK de teste

`frontend/test-results/android-final/app/outputs/apk/debug/app-debug.apk`

APK debug com assinatura v2 verificada por `apksigner`; label Zemda, package `br.com.zemda.app`, versão `1.1.2/10102` e target 36 confirmados no binário. Não foi instalado porque não havia dispositivo conectado. Nenhuma biblioteca `.so` foi encontrada no APK; o binário não empacota bibliotecas nativas próprias que exijam alinhamento ELF.

O APK fica separado de `public/` e `dist/`, sem inclusão automática no bundle Vite.

## 11. AAB

`frontend/test-results/android-final/app/outputs/bundle/release/app-release.aab`

**AAB técnico sem assinatura.** A verificação com `jarsigner` confirmou ausência de assinatura. Configure uma chave de upload fora do Git e gere novamente com `npm run android:bundle` antes de enviar ao Play Console. Tamanho, hashes e metadados finais constam em `test-results/android-artifacts.json`.

## 12. Pendências para Google Play

- Assinatura de upload/Play App Signing e AAB assinado.
- Homologação em Android real: telas/teclado, permissões, câmera, áudio Fono, mapas, fotos/postura, TAV/VAI, downloads, impressão, botão Voltar, portrait/landscape e autenticação completa.
- Revisão do checkout Asaas para a assinatura digital SaaS conforme [política de pagamentos](https://support.google.com/googleplay/android-developer/answer/10281818?hl=en-en); nenhuma regra financeira foi alterada. Abrir checkout externamente não representa aprovação dessa política.
- Confirmar/completar opção dentro do app e página pública para solicitação de [exclusão de conta](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en). Não foi identificado fluxo dedicado no frontend auditado; não foi criado backend para isso.
- Metadados e imagens da loja, classificação, conta de acesso para revisão, política de privacidade, Segurança dos dados e [declaração de app de saúde](https://support.google.com/googleplay/android-developer/answer/14738291?hl=en).
- Teste fechado e requisitos de produção aplicáveis à conta do desenvolvedor.

## 13. Configurações externas

- `VITE_GOOGLE_CLIENT_ID` web e OAuth Android para `br.com.zemda.app` + certificados debug/release/Play no Google Cloud. Firebase/outros serviços somente se realmente utilizados e associados ao package anterior.
- Hospedar APK e configurar `VITE_ZEMDA_ANDROID_TEST_DOWNLOAD_URL`; a interface SuperAdmin não protege criptograficamente o arquivo hospedado. Restringir o arquivo exige hospedagem privada/autorização/URL assinada futuramente.
- Se existir distribuição/atualização pública de APK pelo serviço atual, atualizar a hospedagem para o novo package. Nenhum endpoint foi modificado.
- Keystore e seus valores no ambiente/gerenciador de segredos, nunca no repositório.

Procedimentos completos e comandos: `ANDROID_RELEASE.md`.

## Apêndice — tabelas responsivas

| Componente | Tabelas |
|---|---:|
| src/components/audit/AuditView.tsx | 1 |
| src/components/billing/BillingView.tsx | 1 |
| src/components/billing/GlobalBillingView.tsx | 1 |
| src/components/budgets/BudgetsView.tsx | 3 |
| src/components/common/EvolutionComparisonModal.tsx | 1 |
| src/components/estetic/ZemdaEsteticWorkspace.tsx | 1 |
| src/components/exams/PendingExamsView.tsx | 1 |
| src/components/financial/FinancialView.tsx | 2 |
| src/components/import/ImportDataView.tsx | 2 |
| src/components/inventory/InventoryView.tsx | 2 |
| src/components/nutrition/NutritionWorkspace.tsx | 1 |
| src/components/patients/PatientsView.tsx | 1 |
| src/components/payroll/ProfessionalPayrollView.tsx | 1 |
| src/components/personal/PersonalAssessmentComparisonModal.tsx | 1 |
| src/components/personal/PersonalAssessmentReport.tsx | 4 |
| src/components/personal/PersonalEvolutionCharts.tsx | 2 |
| src/components/personal/PersonalPdfExportModal.tsx | 3 |
| src/components/personal/PersonalPostureComparison.tsx | 1 |
| src/components/personal/PersonalTechnicalFields.tsx | 1 |
| src/components/physiotherapy/RegionalPhysioAssessmentModal.tsx | 2 |
| src/components/receipts/ReceiptsView.tsx | 1 |
| src/components/settings/SettingsView.tsx | 2 |
| src/components/speech-therapy/audiology/AudiologyWorkspaceSection.tsx | 3 |
| src/components/speech-therapy/audiology/PrintableAudiologyModal.tsx | 1 |
| src/components/speech-therapy/PhonologyComparisonView.tsx | 1 |
| src/components/speech-therapy/SpeechTherapyWorkspace.tsx | 1 |
| src/components/staff/StaffManagementView.tsx | 1 |
| src/components/superadmin/FreeTrialsAdminView.tsx | 2 |
| src/components/superadmin/SuperAdminView.tsx | 2 |
| src/components/superadmin/SystemIntegrityView.tsx | 1 |
| src/components/taxonomy/TaxonomyView.tsx | 1 |
| src/components/zemda-body/AnthropometricAssessmentView.tsx | 1 |
| src/components/zemda-body/TherapeuticPlanView.tsx | 2 |

## Apêndice — arquivos alterados/criados

- .env.example
- .gitignore
- ANDROID_RELEASE.md
- MOBILE_ANDROID_AUDIT.md
- android/.gitignore
- android/app/build.gradle
- android/app/capacitor.build.gradle
- android/app/src/main/AndroidManifest.xml
- android/app/src/main/java/com/medschedule/app/MainActivity.java (arquivo antigo movido/removido)
- android/app/src/main/res/drawable-land-hdpi/splash.png
- android/app/src/main/res/drawable-land-mdpi/splash.png
- android/app/src/main/res/drawable-land-xhdpi/splash.png
- android/app/src/main/res/drawable-land-xxhdpi/splash.png
- android/app/src/main/res/drawable-land-xxxhdpi/splash.png
- android/app/src/main/res/drawable-port-hdpi/splash.png
- android/app/src/main/res/drawable-port-mdpi/splash.png
- android/app/src/main/res/drawable-port-xhdpi/splash.png
- android/app/src/main/res/drawable-port-xxhdpi/splash.png
- android/app/src/main/res/drawable-port-xxxhdpi/splash.png
- android/app/src/main/res/drawable/splash.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
- android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
- android/app/src/main/res/values/strings.xml
- android/app/src/main/res/values/styles.xml
- android/app/src/main/res/xml/file_paths.xml
- android/app/src/main/res/xml/network_security_config.xml
- android/capacitor.settings.gradle
- android/gradle.properties
- capacitor.config.ts
- index.html
- mobile-audit-inventory.txt
- mobile-link-inventory.txt
- package-lock.json
- package.json
- scripts/android-build.mjs
- src/App.tsx
- src/components/ai-copilot/AICopilotDrawer.tsx
- src/components/ai-copilot/QuickAIAssistantShortcut.tsx
- src/components/audit/AuditView.tsx
- src/components/auth/ForgotPasswordModal.tsx
- src/components/auth/GoogleAccountLinkDialog.tsx
- src/components/auth/GoogleAuthButton.tsx
- src/components/auth/RegisterUserModal.tsx
- src/components/auth/RegistrationProfessionSelect.tsx
- src/components/billing/BillingView.tsx
- src/components/billing/GlobalBillingView.tsx
- src/components/budgets/BudgetsView.tsx
- src/components/calendar/CalendarView.tsx
- src/components/calendar/NewAppointmentModal.tsx
- src/components/calendar/TeleconsultationModal.tsx
- src/components/clinical/AppointmentConsultation.tsx
- src/components/clinical/ClinicalDraftRecoveryModal.tsx
- src/components/clinical/ClinicalInventorySelector.tsx
- src/components/clinical/ClinicalModuleShell.tsx
- src/components/clinical/ClinicalRecordsView.tsx
- src/components/clinical/ClinicalTrendChart.tsx
- src/components/clinical/ConsultationPaymentModal.tsx
- src/components/clinical/FinishConsultationModal.tsx
- src/components/clinical/GeneralClinicalWorkspace.tsx
- src/components/clinical/PatientFollowUpDocumentModal.tsx
- src/components/clinical/PatientPreviousRecordsModal.tsx
- src/components/clinical/PrintableDocumentModal.tsx
- src/components/clinical/QuickConsultationModal.tsx
- src/components/clinical/ReferralModal.tsx
- src/components/clinical/SelectConsultationModuleModal.tsx
- src/components/clinical/TeleconsultationTranscriptModal.tsx
- src/components/clinical/useClinicalReview.tsx
- src/components/clinical/useConsultationCompletion.tsx
- src/components/common/ClinicalFileUploader.tsx
- src/components/common/CookiePreferencesModal.tsx
- src/components/common/ErrorBoundary.tsx
- src/components/common/EvolutionComparisonModal.tsx
- src/components/common/EvolutionPhotoField.tsx
- src/components/common/ExternalTestsManager.tsx
- src/components/common/FileImageUploader.tsx
- src/components/common/LegalReacceptanceModal.tsx
- src/components/common/MeasurableGoalsManager.tsx
- src/components/common/MobileGraphicViewport.tsx
- src/components/common/NetworkOfflineModal.tsx
- src/components/common/PatientSearchSelect.tsx
- src/components/common/ProfessionalModuleHeader.tsx
- src/components/common/ResponsiveSectionNav.tsx
- src/components/common/ResponsiveTable.tsx
- src/components/common/SectionErrorBoundary.tsx
- src/components/common/Sidebar.tsx
- src/components/common/SignatureChoiceModal.tsx
- src/components/common/UniversalWhatsAppModal.tsx
- src/components/common/UpdateNotificationModal.tsx
- src/components/consents/PatientConsentsPanel.tsx
- src/components/consents/consent-api.ts
- src/components/dashboard/TodayWorklist.tsx
- src/components/dentistry/DentalAIDictationModal.tsx
- src/components/dentistry/DentalProstheticsKanban.tsx
- src/components/dentistry/OdontogramCanvas.tsx
- src/components/dentistry/Perio6SitesGrid.tsx
- src/components/dentistry/ProcedureSuggestionModal.tsx
- src/components/dentistry/ToothDossierDrawer.tsx
- src/components/estetic/ZemdaEsteticWorkspace.tsx
- src/components/exams/PendingExamsView.tsx
- src/components/financial/FinancialView.tsx
- src/components/import/ImportDataView.tsx
- src/components/import/MedicalRecordScanner.tsx
- src/components/inventory/InventoryView.tsx
- src/components/nutrition/ManualMealFoodModal.tsx
- src/components/nutrition/NutritionWorkspace.tsx
- src/components/occupational-therapy/OccupationalParticipationModal.tsx
- src/components/occupational-therapy/RoutineMapModal.tsx
- src/components/occupational-therapy/TOEvolutionReportModal.tsx
- src/components/occupational-therapy/TaskAnalysisModal.tsx
- src/components/onboarding/OnboardingHelpModal.tsx
- src/components/onboarding/OnboardingSpotlight.tsx
- src/components/onboarding/OnboardingWelcomeModal.tsx
- src/components/onboarding/OnboardingWizardView.tsx
- src/components/onboarding/WhatsNewModal.tsx
- src/components/patients/EditPatientModal.tsx
- src/components/patients/NewPatientModal.tsx
- src/components/patients/PatientProfileModal.tsx
- src/components/patients/PatientsView.tsx
- src/components/payroll/ProfessionalPayrollView.tsx
- src/components/personal/PersonalAIAssistantModal.tsx
- src/components/personal/PersonalAssessmentComparisonModal.tsx
- src/components/personal/PersonalAssessmentModal.tsx
- src/components/personal/PersonalAssessmentReport.tsx
- src/components/personal/PersonalBeforeAfterModal.tsx
- src/components/personal/PersonalEvolutionCharts.tsx
- src/components/personal/PersonalExerciseLibraryModal.tsx
- src/components/personal/PersonalPdfExportModal.tsx
- src/components/personal/PersonalPostureComparison.tsx
- src/components/personal/PersonalPublicExerciseDemoModal.tsx
- src/components/personal/PersonalPublicStudentRecordsModal.tsx
- src/components/personal/PersonalPublicStudentWorkoutView.tsx
- src/components/personal/PersonalStudentLinkModal.tsx
- src/components/personal/PersonalStudentProfile.tsx
- src/components/personal/PersonalTechnicalFields.tsx
- src/components/personal/PersonalWorkoutBuilder.tsx
- src/components/personal/PersonalWorkoutExecutionModal.tsx
- src/components/personal/ZemdaPersonalView.tsx
- src/components/physiotherapy/PhysiotherapyRecordsView.tsx
- src/components/physiotherapy/PhysiotherapyWorkspace.tsx
- src/components/physiotherapy/RegionalEvaluationsListModal.tsx
- src/components/physiotherapy/RegionalLongitudinalComparisonModal.tsx
- src/components/physiotherapy/RegionalPhysioAssessmentModal.tsx
- src/components/professionals/ProfessionalsView.tsx
- src/components/profile/AccountSettingsModal.tsx
- src/components/profile/ConnectCertificateModal.tsx
- src/components/profile/ProfileSpecialties.tsx
- src/components/psychology/PsychologyAIOrganizerModal.tsx
- src/components/psychology/PsychologyDocumentModal.tsx
- src/components/psychology/PsychologyHistoryModal.tsx
- src/components/psychology/PsychologyWorkspace.tsx
- src/components/psychology/psychology-print.util.ts
- src/components/psychopedagogy/PsychopedagogyDocumentModal.tsx
- src/components/psychopedagogy/PsychopedagogyWorkspace.tsx
- src/components/public-booking/PublicBookingView.tsx
- src/components/receipts/ReceiptsView.tsx
- src/components/reports/ReportsView.tsx
- src/components/schedules/WorkSchedulesView.tsx
- src/components/services/NewRoomModal.tsx
- src/components/services/NewServiceModal.tsx
- src/components/services/ServicesView.tsx
- src/components/settings/DigitalCertificatesSection.tsx
- src/components/settings/NewInsuranceModal.tsx
- src/components/settings/SettingsView.tsx
- src/components/settings/UnifiedTeamManagement.tsx
- src/components/speech-therapy/DysphagiaMatrixModal.tsx
- src/components/speech-therapy/FluencyCounterModal.tsx
- src/components/speech-therapy/FonoEvolutionReportModal.tsx
- src/components/speech-therapy/Idv10AssessmentSection.tsx
- src/components/speech-therapy/InteractiveAudiogram.tsx
- src/components/speech-therapy/LanguageSampleModal.tsx
- src/components/speech-therapy/PhonologyComparisonView.tsx
- src/components/speech-therapy/SpeechTherapyWorkspace.tsx
- src/components/speech-therapy/audiology/AudiologyWorkspaceSection.tsx
- src/components/speech-therapy/audiology/PrintableAudiologyModal.tsx
- src/components/staff/StaffManagementView.tsx
- src/components/superadmin/AndroidAppAdmin.tsx
- src/components/superadmin/FreeTrialsAdminView.tsx
- src/components/superadmin/SuperAdminView.tsx
- src/components/superadmin/SystemIntegrityView.tsx
- src/components/support/SupportTicketsView.tsx
- src/components/taxonomy/TaxonomyView.tsx
- src/components/zemda-body/AnthropometricAssessmentView.tsx
- src/components/zemda-body/TherapeuticPlanView.tsx
- src/components/zemda-body/ZemdaBodyModal.tsx
- src/components/zemda-body/ZemdaBodyPanel.tsx
- src/components/zemda-body/ZemdaBodyRecordsView.tsx
- src/components/zemda-body/ZemdaBodyWorkspace.tsx
- src/config/version.ts
- src/hooks/useAndroidSectionBack.ts
- src/hooks/useHorizontalTabScroll.ts
- src/hooks/useMobileLayout.ts
- src/main.tsx
- src/shared/clinical-assessments/ClinicalAssessmentsPanel.tsx
- src/styles/mobile.css
- src/utils/download.ts
- src/utils/mobileOverlay.ts
- src/utils/nativeGoogleAuth.ts
- src/utils/nativeNavigation.ts
- src/utils/nativePrint.ts
- tests/mobile-graphics.cjs
- tests/mobile-interactions.cjs
- tests/mobile-overflow.cjs
- vite.config.ts
