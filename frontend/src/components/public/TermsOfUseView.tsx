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
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

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
    <div className="min-h-screen bg-[#fafbfc] text-slate-800 font-sans antialiased selection:bg-teal-500 selection:text-white flex flex-col justify-between">
      <div>
        {/* Top Header unificado */}
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
              <Scale className="w-3.5 h-3.5 text-teal-600" />
              <span>Documento Legal Oficial</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-slate-950 tracking-tight">
              Termos de Uso da Plataforma Zemda
            </h1>
            <p className="text-xs sm:text-sm text-slate-500">
              Última atualização: 16 de setembro de 2026 • Aplicável a clínicas, consultórios e profissionais de saúde cadastrados.
            </p>
          </div>

          {/* Legal Content Card */}
          <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-12 shadow-xs space-y-10 text-slate-600 text-sm leading-relaxed">
            {/* 1. Identificação */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">1.</span> Identificação do Serviço e Partes
              </h2>
              <p>
                Estes Termos de Uso regulam o acesso e a utilização da plataforma tecnológica <strong>Zemda</strong>, doravante denominada simplesmente &ldquo;Zemda&rdquo; ou &ldquo;Plataforma&rdquo;, desenvolvida e operada por <strong>Zemda Tecnologia em Saúde</strong>.
              </p>
              <p>
                A adesão a estes Termos aperfeiçoa-se no momento do cadastro de uma Clínica, Consultório ou Profissional de Saúde (doravante denominado &ldquo;Contratante&rdquo; ou &ldquo;Clínica&rdquo;) e de seus usuários autorizados (doravante &ldquo;Usuários&rdquo;).
              </p>
            </section>

            {/* 2. Finalidade */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">2.</span> Finalidade da Plataforma
              </h2>
              <p>
                O Zemda é um software como serviço (SaaS) concebido para organização operacional de clínicas, consultórios médicos e multiprofissionais de saúde, fornecendo ferramentas digitais de:
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-slate-600">
                <li>Agenda de atendimentos online inteligente e agendamento para pacientes;</li>
                <li>Recepção, triagem e controle de fluxo presencial;</li>
                <li>Prontuário eletrônico do paciente (PEP) auditado para diversas especialidades (Fisioterapia, Odontologia, Nutrição, Terapia Ocupacional, Fonoaudiologia e Medicina);</li>
                <li>Gestão financeira, controle de livro caixa e emissão de recibos profissionais com numeração sequencial própria;</li>
                <li>Assistente de redação e auxílio operacional orientado por inteligência artificial (IA Zemda).</li>
              </ul>
            </section>

            {/* 3. Criação e Responsabilidade da Conta */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">3.</span> Criação e Responsabilidade da Conta
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
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">4.</span> Contas Individuais e Proibição de Compartilhamento
              </h2>
              <p>
                Cada usuário colaborador (médico, fisioterapeuta, dentista, terapeuta, recepcionista ou administrador) deve possuir sua <strong>própria conta de acesso individual e intransferível</strong>, associada a seu e-mail e credencial única.
              </p>
              <div className="p-5 rounded-2xl bg-amber-50/80 border border-amber-200/80 text-amber-950 text-xs leading-relaxed space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  Proibição Expressa de Compartilhamento de Senhas:
                </p>
                <p>
                  É terminantemente proibido o compartilhamento de logins, senhas ou credenciais entre profissionais ou funcionários da mesma equipe. Todas as inserções, alterações e visualizações em prontuários clínicos são auditadas com carimbo de data, hora e identificação inequívoca do usuário logado.
                </p>
              </div>
            </section>

            {/* 5. Responsabilidade da Clínica */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">5.</span> Responsabilidade da Clínica pelos Usuários Cadastrados
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
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">6.</span> Planos de Assinatura e Limites de Capacidade
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
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">7.</span> Cobrança, Recorrência e Meios de Pagamento
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
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">8.</span> Alteração de Plano (Upgrade e Downgrade)
              </h2>
              <p>
                O gestor pode solicitar a alteração de plano a qualquer momento pelo painel de configurações. Upgrades que demandem pagamento proporcional entram em vigor mediante confirmação da fatura correspondente. Downgrades aplicam-se ao término do período mensal já liquidado, desde que o número de usuários ativos seja previamente ajustado ao novo limite.
              </p>
            </section>

            {/* 9. Cancelamento */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">9.</span> Cancelamento da Assinatura
              </h2>
              <p>
                O cancelamento pode ser realizado pelo gestor na seção <em>Assinatura e Plano</em> da plataforma a qualquer tempo, sem multas contratuais. Ao cancelar, as cobranças futuras são encerradas e o acesso aos recursos pagos permanece ativo até o fim do ciclo mensal vigente.
              </p>
            </section>

            {/* 10. Inadimplência e Suspensão */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">10.</span> Inadimplência, Prazos de Carência e Suspensão
              </h2>
              <p>
                Em caso de não pagamento na data de vencimento, a clínica entrará em período de carência (grace period) para regularização de pendência financeira. Decorrido o prazo sem confirmação de liquidação, as funcionalidades operacionais da clínica poderão ser suspensas até a compensação da fatura.
              </p>
            </section>

            {/* 11. Preservação de Dados */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">11.</span> Preservação dos Dados e Obrigações Sanitárias
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
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">12.</span> Política de Uso Aceitável
              </h2>
              <p>O Usuário compromete-se a não:</p>
              <ul className="list-disc pl-6 space-y-1 text-slate-600">
                <li>Praticar engenharia reversa, descompilação ou tentativa de obtenção do código-fonte;</li>
                <li>Inserir dados maliciosos, scripts mal-intencionados, vírus ou tentar burlar o isolamento multi-tenant;</li>
                <li>Utilizar a plataforma para atividades ilícitas, fraudulentas ou contrárias às normas sanitárias e éticas profissionais;</li>
                <li>Sobrecarregar os servidores da plataforma através de requisições artificiais automatizadas não autorizadas.</li>
              </ul>
            </section>

            {/* 13. Segurança das Credenciais */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">13.</span> Segurança das Credenciais
              </h2>
              <p>
                As senhas são armazenadas em formato criptográfico irreversível (hash seguro com salt). O usuário é o único responsável pela guarda de sua senha, devendo comunicar imediatamente à administração caso suspeite de extravio ou comprometimento de suas credenciais.
              </p>
            </section>

            {/* 14. Propriedade Intelectual */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">14.</span> Propriedade Intelectual
              </h2>
              <p>
                Todo o código-fonte, arquitetura, design visual, marcas, logotipos, banco de dados e algoritmos do Zemda são de propriedade exclusiva da Provedora e protegidos pela legislação de direitos autorais e propriedade intelectual. Os dados clínicos e cadastrais inseridos pela Clínica permanecem de propriedade desta e de seus respectivos pacientes titulares.
              </p>
            </section>

            {/* 15. Disponibilidade e Manutenção */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">15.</span> Disponibilidade, SLA e Manutenções
              </h2>
              <p>
                O Zemda adota as melhores práticas de infraestrutura em nuvem para assegurar alta disponibilidade. Eventuais manutenções preventivas programadas são realizadas preferencialmente fora do horário comercial convencional, sendo comunicadas com antecedência razoável.
              </p>
            </section>

            {/* 16. Integrações de Terceiros */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">16.</span> Integrações de Terceiros
              </h2>
              <p>
                A plataforma integra serviços de terceiros homologados para seu funcionamento pleno, tais como: processamento de pagamentos (Asaas), inteligência artificial para auxílio na redação clínica (Google Gemini API, em conformidade com termos estritos de não retenção de dados médicos para treino) e APIs de consulta pública de CEP. O Zemda não se responsabiliza por indisponibilidades externas desses provedores fora de seu controle direto.
              </p>
            </section>

            {/* 17 e 18. Responsabilidade Médica e ISENÇÃO EXPRESSA */}
            <section className="space-y-3 p-6 rounded-3xl bg-teal-50/70 border border-teal-200/80">
              <div className="flex items-center gap-2 text-teal-900 font-black text-base">
                <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0" />
                <span>17 e 18. Autonomia Profissional e Isenção de Responsabilidade Médica</span>
              </div>
              <p className="text-teal-950 font-bold text-xs uppercase tracking-wide">
                O Zemda é uma ferramenta estritamente tecnológica e assistencial de gestão, não realizando atos médicos ou terapêuticos.
              </p>
              <p className="text-slate-600 text-xs leading-relaxed">
                O sistema, seus módulos de suporte, sugestões de IA ou modelos pré-definidos de anamnese <strong>NÃO substituem, em hipótese alguma, o julgamento clínico, o diagnóstico, a prescrição ou a conduta privativa de profissionais de saúde habilitados</strong>. Cada profissional responde civil, penal e eticamente perante seu respectivo conselho regional de classe (CRM, CREFITO, CRO, CRP, CRN, CRFa) por todas as decisões assistenciais e anotações técnicas tomadas em relação a seus pacientes.
              </p>
            </section>

            {/* 19. Encerramento da Conta */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">19.</span> Encerramento da Conta
              </h2>
              <p>
                A Provedora reserva-se o direito de rescindir ou bloquear o acesso em casos de violação grave destes Termos, inadimplência reiterada não sanada ou utilização comprovadamente fraudulenta da plataforma.
              </p>
            </section>

            {/* 20. Alterações dos Termos */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">20.</span> Alterações destes Termos e Versionamento
              </h2>
              <p>
                Estes Termos podem ser atualizados periodicamente para refletir evoluções legislativas ou funcionais. Caso ocorram alterações materiais, o Zemda solicitará expressamente a concordância do Usuário em seu próximo acesso à plataforma.
              </p>
            </section>

            {/* 21. Legislação Aplicável e Foro */}
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <span className="text-teal-600 font-mono">21.</span> Legislação Brasileira e Foro
              </h2>
              <p>
                Estes Termos são regidos integralmente pelas Leis da República Federativa do Brasil, em especial a Lei Geral de Proteção de Dados (Lei 13.709/2018), o Marco Civil da Internet (Lei 12.965/2014) e o Código Civil Brasileiro. Fica eleito o foro da comarca da sede da Provedora para dirimir eventuais controvérsias decorrentes deste contrato, renunciando a qualquer outro por mais privilegiado que seja.
              </p>
            </section>

            {/* 22. Contato Oficial */}
            <section className="space-y-3 border-t border-slate-100 pt-6">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
                <Mail className="w-5 h-5 text-teal-600" />
                <span>Canal de Atendimento e Suporte</span>
              </h2>
              <p>
                Para esclarecimentos, dúvidas sobre estes Termos ou solicitações administrativas, entre em contato através do e-mail oficial:
              </p>
              <p className="font-mono text-teal-700 font-bold">
                contato@zemda.com.br • suporte@zemda.com.br
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
