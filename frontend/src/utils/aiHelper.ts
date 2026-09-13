export interface ZemdaAIOptions {
  prompt?: string;
  patientId?: string;
  appointmentId?: string;
  tab?: 'chat' | 'audio_draft' | 'improve_text';
  autoSend?: boolean;
}

export const openZemdaAI = (options?: ZemdaAIOptions): void => {
  window.dispatchEvent(
    new CustomEvent('open-zemda-ai', {
      detail: options || {}
    })
  );
};
