import React, { useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  FileText,
  Building2,
  Users,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Cookie,
  HeartPulse,
  Scale
} from 'lucide-react';
import { openCookiePreferencesModal } from '../../utils/cookieConsent';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

interface PrivacyPolicyViewProps {
  onBack?: () => void;
  onLogin?: () => void;
  onRegisterClinic?: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({
  onBack,
  onLogin,
  onRegisterClinic
}) => {
  useEffect(() => {
    document.title = 'Política de Privacidade e Proteção de Dados — LGPD • Zemda';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleGoHome = () => {
    if (onBack) {
      onBack();
    } else {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 font-sans antialiased selection:bg-teal-500 selection:text-white flex flex-col justify-between">
      <div>
        {/* Top Header Unificado */}
        <PublicHeader
          onLogin={onLogin}
          onRegisterClinic={onRegisterClinic}
          isLegalOrAuxiliary={true}
          onNavigateHome={handleGoHome}
        />

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {/* Back Action Bar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={handleGoHome}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-teal-700 bg-white border border-slate-200/80 rounded-xl hover:border-teal-300 transition-all shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar ao início</span>
            </button>
            <span className="text-[11px] font-semibold text-slate-400">
              Versão vigente: 2026.1
            </span>
          </div>

          {/* Title Header Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xs mb-8 space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200/80 text-teal-800 text-xs font-bold">
              <ShieldCheck className="w-3.5 h-3.5 text-teal-600" />
              <span>Conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight">
              Política de Privacidade e Proteção de Dados — LGPD
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Última atualização: 16 de setembro de 2026 • Segurança da informação, sigilo profissional e privacidade em saúde.
            </p>
          </div>

          {/* Legal Content Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-12 shadow-xs space-y-10 text-slate-600 text-sm leading-relaxed">
            {/* 1. Apresentação e Papéis */}
            <section className="space-y-4">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">1.</span> Papéis na LGPD: Controlador vs. Operador
              </h2>
              <p>
                A presente Política descreve como a plataforma <strong>Zemda</strong> (operada por <em>Zemda Tecnologia em Saúde</em>, com cadastro empresarial em estruturação: <em>[Razão Social e CNPJ a definir]</em>) trata dados pessoais em conformidade estrita com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
              </p>
              <p>
                Em respeito à transparência e à realidade arquitetural da plataforma, esclarecemos a divisão técnica e jurídica das responsabilidades:
              </p>

              <div className="grid sm:grid-cols-2 gap-4 pt-2">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-teal-800 font-bold text-sm">
                    <Building2 className="w-4 h-4 text-teal-600" />
                    <span>A Clínica é a CONTROLADORA</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    A Clínica, Consultório ou Profissional contratante é o <strong>Controlador</strong> dos dados pessoais e dados sensíveis de saúde de seus pacientes. Compete à Clínica tomar decisões sobre o tratamento, obter consentimento quando exigível, garantir o sigilo profissional de seus colaboradores e responder aos seus pacientes.
                  </p>
                </div>

                <div className="p-5 rounded-2xl bg-teal-50/60 border border-teal-200/80 space-y-2">
                  <div className="flex items-center gap-2 text-teal-900 font-bold text-sm">
                    <Lock className="w-4 h-4 text-teal-600" />
                    <span>O Zemda é o OPERADOR</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    O Zemda atua como <strong>Operador</strong> em relação aos dados dos pacientes e registros clínicos, prestando serviços de infraestrutura tecnológica em nuvem, custódia e isolamento seguro de dados estritamente conforme as diretrizes do contrato de software com a Clínica.
                  </p>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                * O Zemda atua como <strong>Controlador</strong> exclusivamente quanto aos dados cadastrais e de cobrança dos gestores da clínica (assinantes diretos do software), necessários para a formalização contratual e cumprimento de deveres fiscais.
              </p>
            </section>

            {/* 2. DADOS SENSÍVEIS DE SAÚDE */}
            <section className="space-y-4 p-6 rounded-3xl bg-emerald-50/60 border border-emerald-200/80">
              <div className="flex items-center gap-2.5 text-emerald-950 font-black text-base">
                <HeartPulse className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>2. Tratamento de Dados Pessoais Sensíveis e Dados de Saúde</span>
              </div>
              <p className="text-slate-700">
                Dados de saúde são classificados como <strong>dados pessoais sensíveis</strong> (Art. 5º, II e Art. 11 da LGPD), exigindo o mais elevado rigor de segurança técnica e salvaguardas éticas.
              </p>
              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <p>
                  ✓ <strong>Isolamento Multi-Tenant Estrito:</strong> Cada clínica possui segregação lógica intransponível no banco de dados. Os dados clínicos de uma clínica jamais são acessados por usuários de outros estabelecimentos.
                </p>
                <p>
                  ✓ <strong>Sigilo e Auditabilidade Permanente:</strong> Todos os acessos a prontuários, evoluções e anamneses geram logs de auditoria imutáveis com carimbo de data, hora e identificação do usuário profissional responsável, atendendo às determinações dos conselhos federais (CFM, COFFITO, CFO, CFP, CFN, CFFa).
                </p>
                <p>
                  ✓ <strong>Não Utilização para Treinamento de Modelos Públicos:</strong> Informações de pacientes, prontuários ou dados clínicos <strong>nunca são compartilhados com redes sociais, brokers de dados nem utilizados para treinar modelos abertos de inteligência artificial</strong>. O recurso de IA Zemda realiza processamento efêmero para formatação de texto apenas quando solicitado expressamente pelo profissional, sem retenção permanente externa.
                </p>
              </div>
            </section>

            {/* 3. Quais Dados são Coletados */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">3.</span> Quais Dados Pessoais São Coletados
              </h2>
              <p>O Zemda coleta e armazena as seguintes categorias de dados:</p>
              <ul className="list-disc pl-6 space-y-2 text-slate-600 text-xs">
                <li>
                  <strong>Dados Cadastrais da Clínica e do Gestor:</strong> Nome completo, razão social, nome fantasia, CNPJ ou CPF, endereço, cidade, UF, CEP, e-mail de contato e telefone corporativo.
                </li>
                <li>
                  <strong>Dados Profissionais de Colaboradores:</strong> Nome, profissão/especialidade, conselho de classe (CRM, CREFITO, CRO, etc.), número de registro profissional e áreas de atuação.
                </li>
                <li>
                  <strong>Dados Financeiros de Assinatura:</strong> Identificadores de faturas, histórico de mensalidades e status de cobrança processados pelo gateway Asaas. O Zemda não armazena números de cartões de crédito.
                </li>
                <li>
                  <strong>Dados de Pacientes Inseridos pelas Clínicas:</strong> Nome, contato, data de nascimento, convênio e registros de prontuário eletrônico vinculados à assistência médica/terapêutica prestada pela Clínica.
                </li>
                <li>
                  <strong>Logs Técnicos e de Segurança:</strong> Endereço IP, tipo de navegador (user-agent), timestamps de login e ações realizadas na plataforma para garantia de rastreabilidade contra acessos indevidos.
                </li>
                <li>
                  <strong>Cookies e Analytics:</strong> Métricas anônimas de uso e navegação, coletadas apenas mediante consentimento do usuário.
                </li>
              </ul>
            </section>

            {/* 4. Finalidades e Bases Legais */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">4.</span> Finalidades do Tratamento e Bases Legais (LGPD)
              </h2>
              <p>O tratamento de dados é realizado estritamente respaldado nas bases legais previstas nos Artigos 7º e 11 da LGPD:</p>
              <ul className="list-disc pl-6 space-y-1.5 text-slate-600 text-xs">
                <li><strong>Execução de Contrato (Art. 7º, V):</strong> Para fornecimento dos módulos de agendamento, prontuário eletrônico, cobrança e suporte contratados.</li>
                <li><strong>Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II e Art. 11, II, &ldquo;a&rdquo;):</strong> Guarda obrigatória de prontuários médicos por 20 anos (Lei Federal 13.787/2018) e retenção de registros de conexão (Marco Civil da Internet).</li>
                <li><strong>Tutela da Saúde (Art. 7º, VIII e Art. 11, II, &ldquo;f&rdquo;):</strong> Registro e armazenamento de prontuários por profissionais da área da saúde no exercício de sua atividade.</li>
                <li><strong>Legítimo Interesse e Segurança (Art. 7º, IX e Art. 11, II, &ldquo;g&rdquo;):</strong> Prevenção a fraudes, segurança cibernética e auditoria de acessos não autorizados.</li>
                <li><strong>Consentimento (Art. 7º, I):</strong> Para cookies analíticos facultativos ou comunicações opcionais não essenciais.</li>
              </ul>
            </section>

            {/* 5. Compartilhamento */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">5.</span> Compartilhamento com Fornecedores Essenciais
              </h2>
              <p>O Zemda não comercializa dados pessoais. O compartilhamento restringe-se a operadores e prestadores indispensáveis à prestação do serviço:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-xs">
                <li><strong>Provedores de Hospedagem e Nuvem:</strong> Servidores protegidos com criptografia de ponta a ponta e redundância;</li>
                <li><strong>Asaas Instituição de Pagamento:</strong> Processamento seguro de assinaturas e faturas bancárias;</li>
                <li><strong>Google Analytics (GA4):</strong> Métricas estatísticas totalmente anônimas, ativadas apenas com consentimento prévio do usuário e sem nenhum dado clínico;</li>
                <li><strong>Autoridades Públicas:</strong> Exclusivamente mediante ordem judicial fundamentada ou estrita determinação legal.</li>
              </ul>
            </section>

            {/* 6. Retenção e Eliminação */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">6.</span> Retenção e Eliminação de Dados
              </h2>
              <p>
                Os dados de prontuários são preservados pelo prazo mínimo obrigatório de 20 (vinte) anos a contar do último atendimento, conforme a Lei 13.787/2018 e resoluções dos Conselhos Federais de Saúde.
              </p>
              <p>
                Dados cadastrais puramente administrativos são eliminados quando encerrada a finalidade ou quando requerido pelo titular, ressalvada a retenção legal para fins tributários e fiscais.
              </p>
            </section>

            {/* 7. Segurança da Informação */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">7.</span> Medidas Técnicas de Segurança
              </h2>
              <p>O Zemda emprega padrões avançados de segurança cibernética:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600 text-xs">
                <li>Criptografia de comunicações via TLS/HTTPS em 100% das conexões web e desktop;</li>
                <li>Armazenamento de senhas sob hash criptográfico robusto irreversível;</li>
                <li>Isolamento de privilégios de acesso por papéis (RBAC);</li>
                <li>Backups programados automatizados e registros detalhados de auditoria.</li>
              </ul>
            </section>

            {/* 8. Direitos dos Titulares */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">8.</span> Direitos dos Titulares de Dados (Art. 18 LGPD)
              </h2>
              <p>
                A LGPD assegura aos titulares de dados os seguintes direitos fundamentais:
              </p>
              <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-700 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Confirmação da existência de tratamento</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Acesso transparente aos seus dados</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Correção de dados incompletos ou inexatos</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Portabilidade nos termos da regulamentação</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Eliminação de dados tratados sob consentimento</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Informação sobre compartilhamentos</div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80">✓ Revogação do consentimento a qualquer tempo</div>
              </div>
              <p className="text-xs text-slate-500 pt-2">
                <strong>Importante para Pacientes:</strong> Como a Clínica é a Controladora do prontuário médico, qualquer paciente que deseje obter cópia de seu prontuário ou exercer direitos sobre seus registros clínicos deve direcionar a requisição diretamente à clínica ou ao profissional que realizou o atendimento.
              </p>
            </section>

            {/* 9. Cookies e Preferências */}
            <section className="space-y-3 p-6 rounded-3xl bg-teal-50/70 border border-teal-200/80">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2 text-teal-950 font-black text-base">
                  <Cookie className="w-5 h-5 text-teal-700" />
                  <span>9. Gerenciamento de Preferências de Cookies</span>
                </div>
                <button
                  type="button"
                  onClick={openCookiePreferencesModal}
                  className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs hover:shadow-md cursor-pointer"
                >
                  Abrir Preferências de Cookies
                </button>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Você pode ativar ou desativar os cookies analíticos do Google Analytics e, separadamente, os cookies de marketing do Meta Pixel a qualquer momento sem restrição de acesso às funcionalidades do sistema. Com consentimento de marketing, a Meta recebe visitas às páginas públicas institucionais, URL pública, endereço IP e identificadores do navegador para mensuração de anúncios e remarketing. O Pixel não é utilizado na área autenticada, em agendamentos, convites ou formulários de cadastro e não recebe dados de pacientes ou informações clínicas.
              </p>
            </section>

            {/* 10. Canal DPO */}
            <section className="space-y-3 border-t border-slate-100 pt-6">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-teal-600" />
                <span>10. Canal de Solicitações LGPD e Encarregado de Dados (DPO)</span>
              </h2>
              <p>
                Para exercer seus direitos como titular de dados cadastrais, tirar dúvidas sobre esta Política ou contatar nosso Encarregado de Proteção de Dados (DPO), envie mensagem para nosso canal dedicado:
              </p>
              <p className="font-mono text-teal-700 font-bold">
                privacidade@zemda.com.br • dpo@zemda.com.br
              </p>
              <p className="text-xs text-slate-400">
                As solicitações serão respondidas nos prazos e termos estipulados pela legislação aplicável e pela Autoridade Nacional de Proteção de Dados (ANPD).
              </p>
            </section>
          </div>
        </main>
      </div>

      {/* Footer Unificado */}
      <PublicFooter
        onLogin={onLogin}
        onRegisterClinic={onRegisterClinic}
        onNavigateHome={handleGoHome}
      />
    </div>
  );
};
