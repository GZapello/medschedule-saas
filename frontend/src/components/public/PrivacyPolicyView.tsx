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
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white font-sans antialiased">
      {/* Background Ambient Glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-teal-500/10 via-emerald-500/5 to-transparent blur-3xl rounded-full" />
        <div className="absolute top-1/3 -right-64 w-[500px] h-[500px] bg-indigo-600/5 blur-3xl rounded-full" />
      </div>

      {/* Top Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-950/85 border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div
            onClick={handleGoHome}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <img
              src="/brand/zemda-icon.png"
              alt="Zemda"
              className="w-10 h-10 object-contain rounded-xl drop-shadow-md group-hover:scale-105 transition-transform"
            />
            <div className="flex flex-col">
              <span className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
                Zemda
                <span className="inline-block w-2 h-2 rounded-full bg-teal-400" />
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-teal-400">
                Tecnologia em Saúde
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGoHome}
              className="px-4 py-2 text-xs font-bold text-slate-300 hover:text-white rounded-xl hover:bg-slate-900 border border-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Voltar</span>
            </button>
            {onLogin && (
              <button
                type="button"
                onClick={onLogin}
                className="hidden sm:inline-flex px-4 py-2 text-xs font-bold text-slate-200 hover:text-white rounded-xl hover:bg-slate-800 transition-all cursor-pointer"
              >
                Entrar
              </button>
            )}
            {onRegisterClinic && (
              <button
                type="button"
                onClick={onRegisterClinic}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-gradient-to-r from-teal-400 to-emerald-400 hover:from-teal-300 hover:to-emerald-300 rounded-xl transition-all cursor-pointer"
              >
                Cadastrar Clínica
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        {/* Title Header */}
        <div className="space-y-4 text-center sm:text-left border-b border-slate-800 pb-8 mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-500/10 border border-teal-500/25 text-teal-300 text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Política de Privacidade e Proteção de Dados — LGPD
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Última atualização: 16 de setembro de 2026 • Versão vigente: 2026.1
          </p>
        </div>

        {/* Legal Text Body */}
        <div className="space-y-10 text-slate-300 text-sm leading-relaxed font-normal">
          {/* 1. Apresentação e Papéis */}
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">1.</span> Papéis na LGPD: Controlador vs. Operador
            </h2>
            <p>
              A presente Política descreve como a plataforma <strong>Zemda</strong> (operada por <em>Zemda Tecnologia em Saúde</em>, com cadastro empresarial em estruturação: <em>[Razão Social e CNPJ a definir]</em>) trata dados pessoais em conformidade estrita com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).
            </p>
            <p>
              Em respeito à transparência e à realidade arquitetural da plataforma, esclarecemos a divisão técnica e jurídica das responsabilidades:
            </p>

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-teal-400 font-bold text-sm">
                  <Building2 className="w-4 h-4" />
                  <span>A Clínica é a CONTROLADORA</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  A Clínica, Consultório ou Profissional contratante é o <strong>Controlador</strong> dos dados pessoais e dados sensíveis de saúde de seus pacientes. Compete à Clínica tomar decisões sobre o tratamento, obter consentimento quando exigível, garantir o sigilo profissional de seus colaboradores e responder aos seus pacientes.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Lock className="w-4 h-4" />
                  <span>O Zemda é o OPERADOR</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  O Zemda atua como <strong>Operador</strong> em relação aos dados dos pacientes e registros clínicos, prestando serviços de infraestrutura tecnológica em nuvem, custódia e isolamento seguro de dados estritamente conforme as diretrizes do contrato de software com a Clínica.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-400">
              * O Zemda atua como <strong>Controlador</strong> exclusivamente quanto aos dados cadastrais e de cobrança dos gestores da clínica (assinantes diretos do software), necessários para a formalização contratual e cumprimento de deveres fiscais.
            </p>
          </section>

          {/* 2. DADOS SENSÍVEIS DE SAÚDE */}
          <section className="space-y-4 p-6 rounded-3xl bg-slate-900 border border-emerald-500/30">
            <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-base">
              <HeartPulse className="w-5 h-5 shrink-0" />
              <span>2. Tratamento de Dados Pessoais Sensíveis e Dados de Saúde</span>
            </div>
            <p className="text-slate-300">
              Dados de saúde são classificados como <strong>dados pessoais sensíveis</strong> (Art. 5º, II e Art. 11 da LGPD), exigindo o mais elevado rigor de segurança técnica e salvaguardas éticas.
            </p>
            <div className="space-y-2 text-xs text-slate-400 leading-relaxed">
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">3.</span> Quais Dados Pessoais São Coletados
            </h2>
            <p>O Zemda coleta e armazena as seguintes categorias de dados:</p>
            <ul className="list-disc pl-6 space-y-2 text-slate-400 text-xs">
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">4.</span> Finalidades do Tratamento e Bases Legais (LGPD)
            </h2>
            <p>O tratamento de dados é realizado estritamente respaldado nas bases legais previstas nos Artigos 7º e 11 da LGPD:</p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-400 text-xs">
              <li><strong>Execução de Contrato (Art. 7º, V):</strong> Para fornecimento dos módulos de agendamento, prontuário eletrônico, cobrança e suporte contratados.</li>
              <li><strong>Cumprimento de Obrigação Legal ou Regulatória (Art. 7º, II e Art. 11, II, &ldquo;a&rdquo;):</strong> Guarda obrigatória de prontuários médicos por 20 anos (Lei Federal 13.787/2018) e retenção de registros de conexão (Marco Civil da Internet).</li>
              <li><strong>Tutela da Saúde (Art. 7º, VIII e Art. 11, II, &ldquo;f&rdquo;):</strong> Registro e armazenamento de prontuários por profissionais da área da saúde no exercício de sua atividade.</li>
              <li><strong>Legítimo Interesse e Segurança (Art. 7º, IX e Art. 11, II, &ldquo;g&rdquo;):</strong> Prevenção a fraudes, segurança cibernética e auditoria de acessos não autorizados.</li>
              <li><strong>Consentimento (Art. 7º, I):</strong> Para cookies analíticos facultativos ou comunicações opcionais não essenciais.</li>
            </ul>
          </section>

          {/* 5. Compartilhamento */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">5.</span> Compartilhamento com Fornecedores Essenciais
            </h2>
            <p>O Zemda não comercializa dados pessoais. O compartilhamento restringe-se a operadores e prestadores indispensáveis à prestação do serviço:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-400 text-xs">
              <li><strong>Provedores de Hospedagem e Nuvem:</strong> Servidores protegidos com criptografia de ponta a ponta e redundância;</li>
              <li><strong>Asaas Instituição de Pagamento:</strong> Processamento seguro de assinaturas e faturas bancárias;</li>
              <li><strong>Google Analytics (GA4):</strong> Métricas estatísticas totalmente anônimas, ativadas apenas com consentimento prévio do usuário e sem nenhum dado clínico;</li>
              <li><strong>Autoridades Públicas:</strong> Exclusivamente mediante ordem judicial fundamentada ou estrita determinação legal.</li>
            </ul>
          </section>

          {/* 6. Retenção e Eliminação */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">6.</span> Retenção e Eliminação de Dados
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
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">7.</span> Medidas Técnicas de Segurança
            </h2>
            <p>O Zemda emprega padrões avançados de segurança cibernética:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-400 text-xs">
              <li>Criptografia de comunicações via TLS/HTTPS em 100% das conexões web e mobile;</li>
              <li>Armazenamento de senhas sob hash criptográfico robusto irreversível;</li>
              <li>Isolamento de privilégios de acesso por papéis (RBAC);</li>
              <li>Backups programados automatizados e registros detalhados de auditoria.</li>
            </ul>
          </section>

          {/* 8. Direitos dos Titulares */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">8.</span> Direitos dos Titulares de Dados (Art. 18 LGPD)
            </h2>
            <p>
              A LGPD assegura aos titulares de dados os seguintes direitos fundamentais:
            </p>
            <div className="grid sm:grid-cols-2 gap-2 text-xs text-slate-400 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Confirmação da existência de tratamento</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Acesso transparente aos seus dados</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Correção de dados incompletos ou inexatos</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Portabilidade nos termos da regulamentação</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Eliminação de dados tratados sob consentimento</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Informação sobre compartilhamentos</div>
              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">✓ Revogação do consentimento a qualquer tempo</div>
            </div>
            <p className="text-xs text-slate-400 pt-2">
              <strong>Importante para Pacientes:</strong> Como a Clínica é a Controladora do prontuário médico, qualquer paciente que deseje obter cópia de seu prontuário ou exercer direitos sobre seus registros clínicos deve direcionar a requisição diretamente à clínica ou ao profissional que realizou o atendimento.
            </p>
          </section>

          {/* 9. Cookies e Preferências */}
          <section className="space-y-3 p-5 rounded-3xl bg-slate-900 border border-slate-800">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Cookie className="w-5 h-5 text-teal-400" />
                <span>9. Gerenciamento de Preferências de Cookies</span>
              </div>
              <button
                type="button"
                onClick={openCookiePreferencesModal}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Abrir Preferências de Cookies
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Você pode ativar ou desativar os cookies analíticos do Google Analytics a qualquer momento sem qualquer restrição de acesso às funcionalidades do sistema.
            </p>
          </section>

          {/* 10. Canal DPO */}
          <section className="space-y-3 border-t border-slate-800 pt-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-400" />
              <span>10. Canal de Solicitações LGPD e Encarregado de Dados (DPO)</span>
            </h2>
            <p>
              Para exercer seus direitos como titular de dados cadastrais, tirar dúvidas sobre esta Política ou contatar nosso Encarregado de Proteção de Dados (DPO), envie mensagem para nosso canal dedicado:
            </p>
            <p className="font-mono text-teal-400 font-bold">
              privacidade@zemda.com.br • dpo@zemda.com.br
            </p>
            <p className="text-xs text-slate-500">
              As solicitações serão respondidas nos prazos e termos estipulados pela legislação aplicável e pela Autoridade Nacional de Proteção de Dados (ANPD).
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-900 py-10 bg-slate-950 px-4 text-center text-xs text-slate-500">
        <p>© {new Date().getFullYear()} Zemda — Tecnologia em Saúde. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
};
