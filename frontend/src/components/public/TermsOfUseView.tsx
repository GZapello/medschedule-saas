import React, { useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  Building2,
  Lock,
  CreditCard,
  AlertTriangle,
  ArrowLeft,
  Mail,
  Scale,
  Users,
  CheckCircle2,
  ExternalLink
} from 'lucide-react';

interface TermsOfUseViewProps {
  onBack?: () => void;
  onLogin?: () => void;
  onRegisterClinic?: () => void;
}

export const TermsOfUseView: React.FC<TermsOfUseViewProps> = ({
  onBack,
  onLogin,
  onRegisterClinic
}) => {
  useEffect(() => {
    document.title = 'Termos de Uso • Zemda';
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
        <div className="absolute top-1/3 -left-64 w-[500px] h-[500px] bg-teal-600/5 blur-3xl rounded-full" />
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
            <Scale className="w-3.5 h-3.5" />
            <span>Documento Legal Oficial</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Termos de Uso da Plataforma Zemda
          </h1>
          <p className="text-sm text-slate-400 max-w-2xl">
            Última atualização: 16 de setembro de 2026 • Versão vigente: 2026.1
          </p>
        </div>

        {/* Legal Text Body */}
        <div className="space-y-10 text-slate-300 text-sm leading-relaxed font-normal">
          {/* 1. Identificação */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">1.</span> Identificação do Serviço e Partes
            </h2>
            <p>
              Estes Termos de Uso regulam o acesso e a utilização da plataforma tecnológica <strong>Zemda</strong>, doravante denominada simplesmente &ldquo;Zemda&rdquo; ou &ldquo;Plataforma&rdquo;, desenvolvida e operada por <strong>Zemda Tecnologia em Saúde</strong> (empresa com cadastro empresarial em estruturação: <em>[Razão Social e CNPJ a definir; Endereço institucional a definir]</em>, doravante &ldquo;Provedora&rdquo;).
            </p>
            <p>
              A adesão a estes Termos aperfeiçoa-se no momento do cadastro de uma Clínica, Consultório ou Profissional de Saúde (doravante denominado &ldquo;Contratante&rdquo; ou &ldquo;Clínica&rdquo;) e de seus usuários autorizados (doravante &ldquo;Usuários&rdquo;).
            </p>
          </section>

          {/* 2. Finalidade */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">2.</span> Finalidade da Plataforma
            </h2>
            <p>
              O Zemda é um software como serviço (SaaS) concebido para organização operacional de clínicas, consultórios médicos e multiprofissionais de saúde, fornecendo ferramentas digitais de:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-slate-400">
              <li>Agenda de atendimentos online inteligente e agendamento para pacientes;</li>
              <li>Recepção, triagem e controle de fluxo presencial;</li>
              <li>Prontuário eletrônico do paciente (PEP) auditado para diversas especialidades (Fisioterapia, Odontologia, Nutrição, Terapia Ocupacional, Fonoaudiologia e Medicina);</li>
              <li>Gestão financeira, controle de livro caixa e emissão de recibos profissionais com numeração sequencial própria;</li>
              <li>Assistente de redação e auxílio operacional orientado por inteligência artificial (IA Zemda).</li>
            </ul>
          </section>

          {/* 3. Criação e Responsabilidade da Conta */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">3.</span> Criação e Responsabilidade da Conta
            </h2>
            <p>
              Para utilizar a plataforma, o gestor responsável deve realizar o cadastro da Clínica fornecendo informações verdadeiras, atualizadas e completas. O gestor declara expressamente que possui legitimidade legal e poderes para representar a clínica ou consultório cadastrado.
            </p>
            <p>
              O fornecimento de dados falsos, incompletos ou de terceiros sem autorização enseja a imediata suspensão ou rescisão do acesso, sem prejuízo das sanções civis e criminais cabíveis.
            </p>
          </section>

          {/* 4. Contas Individuais */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">4.</span> Contas Individuais e Proibição de Compartilhamento
            </h2>
            <p>
              Cada usuário colaborador (médico, fisioterapeuta, dentista, terapeuta, recepcionista ou administrador) deve possuir sua <strong>própria conta de acesso individual e intransferível</strong>, associada a seu e-mail e credencial única.
            </p>
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs leading-relaxed space-y-1">
              <p className="font-bold flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                Proibição Expressa de Compartilhamento de Senhas:
              </p>
              <p>
                É terminantemente proibido o compartilhamento de logins, senhas ou credenciais entre profissionais ou funcionários da mesma equipe. Todas as inserções, alterações e visualizações em prontuários clínicos são auditadas com carimbo de data, hora e identificação inequívoca do usuário logado.
              </p>
            </div>
          </section>

          {/* 5. Responsabilidade da Clínica */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">5.</span> Responsabilidade da Clínica pelos Usuários Cadastrados
            </h2>
            <p>
              A Clínica contratante é a única e integral responsável pelas permissões de acesso concedidas a seus colaboradores e pelo gerenciamento ativo de sua equipe na plataforma.
            </p>
            <p>
              Compete ao gestor da clínica emitir convites oficiais, definir papéis de acesso (RBAC), e revogar imediatamente as credenciais de qualquer funcionário ou prestador que se desvincule do estabelecimento.
            </p>
          </section>

          {/* 6. Planos e Limites de Usuários */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">6.</span> Planos de Assinatura e Limites de Capacidade
            </h2>
            <p>
              A plataforma é disponibilizada mediante planos de assinatura recorrentes (ex.: <em>Zemda Solo</em>, <em>Zemda Equipe</em> e <em>Zemda Clínica</em>), cada qual com limites especificados de usuários simultâneos ativos, profissionais e recursos disponíveis.
            </p>
            <p>
              A adição de usuários além da capacidade contratada exige a realização prévia de alteração de plano (upgrade).
            </p>
          </section>

          {/* 7. Cobrança e Recorrência */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">7.</span> Cobrança, Recorrência e Meios de Pagamento
            </h2>
            <p>
              Os pagamentos das assinaturas são processados de forma segura e automatizada por meio da instituição de pagamento parceira <strong>Asaas Gestão Financeira Instituição de Pagamento S.A.</strong>
            </p>
            <p>
              A assinatura possui periodicidade mensal com renovação automática no vencimento de cada ciclo, até que haja solicitação de cancelamento expressa pelo gestor da clínica. O Zemda não armazena dados completos de cartão de crédito em seus servidores, sendo estes transacionados diretamente no ambiente PCI-DSS do intermediador.
            </p>
          </section>

          {/* 8. Alteração de Plano */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">8.</span> Alteração de Plano (Upgrade e Downgrade)
            </h2>
            <p>
              O gestor pode solicitar a alteração de plano a qualquer momento pelo painel de configurações. Upgrades que demandem pagamento proporcional entram em vigor mediante confirmação da fatura correspondente. Downgrades aplicam-se ao término do período mensal já liquidado, desde que o número de usuários ativos seja previamente ajustado ao novo limite.
            </p>
          </section>

          {/* 9. Cancelamento */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">9.</span> Cancelamento da Assinatura
            </h2>
            <p>
              O cancelamento pode ser realizado pelo gestor na seção <em>Assinatura e Plano</em> da plataforma a qualquer tempo, sem multas contratuais. Ao cancelar, as cobranças futuras são encerradas e o acesso aos recursos pagos permanece ativo até o fim do ciclo mensal vigente.
            </p>
          </section>

          {/* 10. Inadimplência e Suspensão */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">10.</span> Inadimplência, Prazos de Carência e Suspensão
            </h2>
            <p>
              Em caso de não pagamento na data de vencimento, a clínica entrará em período de carência (grace period) para regularização de pendência financeira. Decorrido o prazo sem confirmação de liquidação, as funcionalidades operacionais da clínica poderão ser suspensas até a compensação da fatura.
            </p>
          </section>

          {/* 11. Preservação de Dados */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">11.</span> Preservação dos Dados e Obrigações Sanitárias
            </h2>
            <p>
              O cancelamento ou suspensão da conta não acarreta a exclusão imediata dos prontuários clínicos. O Zemda preserva os dados inseridos pela clínica conforme as normas da Lei Federal nº 13.787/2018 (guarda mínima de prontuários eletrônicos por 20 anos) e das resoluções dos respectivos conselhos federais de saúde (CFM, COFFITO, CFO, CFP, CFN, CFFa).
            </p>
            <p>
              A exportação dos prontuários e históricos pode ser requisitada pelo gestor autorizado em conformidade com as regras de portabilidade e encerramento.
            </p>
          </section>

          {/* 12. Uso Aceitável */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">12.</span> Política de Uso Aceitável
            </h2>
            <p>O Usuário compromete-se a não:</p>
            <ul className="list-disc pl-6 space-y-1 text-slate-400">
              <li>Praticar engenharia reversa, descompilação ou tentativa de obtenção do código-fonte;</li>
              <li>Inserir dados maliciosos, scripts mal-intencionados, vírus ou tentar burlar o isolamento multi-tenant;</li>
              <li>Utilizar a plataforma para atividades ilícitas, fraudulentas ou contrárias às normas sanitárias e éticas profissionais;</li>
              <li>Sobrecarregar os servidores da plataforma através de requisições artificiais automatizadas não autorizadas.</li>
            </ul>
          </section>

          {/* 13. Segurança das Credenciais */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">13.</span> Segurança das Credenciais
            </h2>
            <p>
              As senhas são armazenadas em formato criptográfico irreversível (hash seguro com salt). O usuário é o único responsável pela guarda de sua senha, devendo comunicar imediatamente à administração caso suspeite de extravio ou comprometimento de suas credenciais.
            </p>
          </section>

          {/* 14. Propriedade Intelectual */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">14.</span> Propriedade Intelectual
            </h2>
            <p>
              Todo o código-fonte, arquitetura, design visual, marcas, logotipos, banco de dados e algoritmos do Zemda são de propriedade exclusiva da Provedora e protegidos pela legislação de direitos autorais e propriedade intelectual. Os dados clínicos e cadastrais inseridos pela Clínica permanecem de propriedade desta e de seus respectivos pacientes titulares.
            </p>
          </section>

          {/* 15. Disponibilidade e Manutenção */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">15.</span> Disponibilidade, SLA e Manutenções
            </h2>
            <p>
              O Zemda adota as melhores práticas de infraestrutura em nuvem para assegurar alta disponibilidade. Eventuais manutenções preventivas programadas são realizadas preferencialmente fora do horário comercial convencional, sendo comunicadas com antecedência razoável.
            </p>
          </section>

          {/* 16. Integrações de Terceiros */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">16.</span> Integrações de Terceiros
            </h2>
            <p>
              A plataforma integra serviços de terceiros homologados para seu funcionamento pleno, tais como: processamento de pagamentos (Asaas), inteligência artificial para auxílio na redação clínica (Google Gemini API, em conformidade com termos estritos de não retenção de dados médicos para treino) e APIs de consulta pública de CEP. O Zemda não se responsabiliza por indisponibilidades externas desses provedores fora de seu controle direto.
            </p>
          </section>

          {/* 17 e 18. Responsabilidade Médica e ISENÇÃO EXPRESSA */}
          <section className="space-y-3 p-5 rounded-3xl bg-slate-900 border border-teal-500/30">
            <div className="flex items-center gap-2 text-teal-400 font-bold text-base">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>17 e 18. Autonomia Profissional e Isenção de Responsabilidade Médica</span>
            </div>
            <p className="text-slate-300 font-medium">
              O ZEMDA É UMA FERRAMENTA ESTRITAMENTE TECNOLÓGICA E ASSISTENCIAL DE GESTÃO, NÃO REALIZANDO ATOS MÉDICOS OU TERAPÊUTICOS.
            </p>
            <p className="text-slate-400 text-xs leading-relaxed">
              O sistema, seus módulos de suporte, sugestões de IA ou modelos pré-definidos de anamnese <strong>NÃO substituem, em hipótese alguma, o julgamento clínico, o diagnóstico, a prescrição ou a conduta privativa de profissionais de saúde habilitados</strong>. Cada profissional responde civil, penal e eticamente perante seu respectivo conselho regional de classe (CRM, CREFITO, CRO, CRP, CRN, CRFa) por todas as decisões assistenciais e anotações técnicas tomadas em relação a seus pacientes.
            </p>
          </section>

          {/* 19. Encerramento da Conta */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">19.</span> Encerramento da Conta
            </h2>
            <p>
              A Provedora reserva-se o direito de rescindir ou bloquear o acesso em casos de violação grave destes Termos, inadimplência reiterada não sanada ou utilização comprovadamente fraudulenta da plataforma.
            </p>
          </section>

          {/* 20. Alterações dos Termos */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">20.</span> Alterações destes Termos e Versionamento
            </h2>
            <p>
              Estes Termos podem ser atualizados periodicamente para refletir evoluções legislativas ou funcionais. Caso ocorram alterações materiais, o Zemda solicitará expressamente a concordância do Usuário em seu próximo acesso à plataforma.
            </p>
          </section>

          {/* 21. Legislação Aplicável e Foro */}
          <section className="space-y-3">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-teal-400 font-mono">21.</span> Legislação Brasileira e Foro
            </h2>
            <p>
              Estes Termos são regidos integralmente pelas Leis da República Federativa do Brasil, em especial a Lei Geral de Proteção de Dados (Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e o Código Civil Brasileiro. Fica eleito o foro da comarca da sede da Provedora para dirimir eventuais controvérsias decorrentes deste contrato, renunciando a qualquer outro por mais privilegiado que seja.
            </p>
          </section>

          {/* 22. Contato Oficial */}
          <section className="space-y-3 border-t border-slate-800 pt-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Mail className="w-5 h-5 text-teal-400" />
              <span>Canal de Atendimento e Suporte</span>
            </h2>
            <p>
              Para esclarecimentos, dúvidas sobre estes Termos ou solicitações administrativas, entre em contato através do e-mail oficial:
            </p>
            <p className="font-mono text-teal-400 font-bold">
              contato@zemda.com.br • suporte@zemda.com.br
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
