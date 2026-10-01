import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  sectionName?: string;
  title?: string;
  message?: string;
  children: ReactNode;
  onRetry?: () => void;
  compact?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/**
 * Remove tokens, segredos e informações potencialmente sensíveis da mensagem técnica de erro.
 */
function sanitizeErrorMessage(msg: string): string {
  if (!msg) return 'Erro desconhecido';
  return msg
    .replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[REDACTED_CPF]')
    .replace(/[?&](token|auth|password|jwt)=[^&#]*/gi, '?$1=[REDACTED]');
}

export class SectionErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    const sanitizedMsg = sanitizeErrorMessage(error?.message || String(error));
    console.error(`[SectionErrorBoundary:${this.props.sectionName || 'Seção'}]`, {
      section: this.props.sectionName || 'Desconhecida',
      error: sanitizedMsg,
      componentStack: errorInfo?.componentStack?.slice(0, 500)
    });
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false
    });
    if (this.props.onRetry) {
      try {
        this.props.onRetry();
      } catch (err) {
        console.error('[SectionErrorBoundary.handleRetry] Erro ao reexecutar callback onRetry:', err);
      }
    }
  };

  public render() {
    if (this.state.hasError) {
      const { sectionName, title, message, compact } = this.props;
      const { error, showDetails } = this.state;
      const sanitizedError = sanitizeErrorMessage(error?.message || 'Falha de renderização no componente.');

      if (compact) {
        return (
          <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{title || `Falha ao carregar ${sectionName || 'este bloco'}.`}</span>
            </div>
            <button
              type="button"
              onClick={this.handleRetry}
              className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 font-semibold rounded-lg border border-rose-300 text-[11px] shadow-2xs transition-colors flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RefreshCw className="w-3 h-3" />
              Recarregar
            </button>
          </div>
        );
      }

      return (
        <div className="bg-white border border-rose-200 rounded-2xl p-6 shadow-xs my-4 text-center sm:text-left space-y-4 animate-in fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {title || `Não foi possível carregar: ${sectionName || 'esta seção'}`}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {message || 'Ocorreu uma instabilidade na renderização deste módulo. A navegação e os demais recursos do Zemda permanecem ativos e seguros.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-center sm:justify-end">
              <button
                type="button"
                onClick={this.handleRetry}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar Novamente
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => this.setState({ showDetails: !showDetails })}
              className="text-2xs font-bold text-slate-400 hover:text-slate-600 flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>Detalhes técnicos do erro</span>
              {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {showDetails && (
              <div className="bg-slate-950 text-rose-300 p-3 rounded-xl text-2xs font-mono overflow-x-auto text-left border border-slate-800 space-y-1">
                <p><strong>Módulo afetado:</strong> {sectionName || 'Geral'}</p>
                <p><strong>Mensagem:</strong> {sanitizedError}</p>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
