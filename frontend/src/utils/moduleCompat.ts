import { Professional, Service } from '../types';

/**
 * Regra de compatibilidade Serviço x Profissional para o agendamento público (workstream WS-D:
 * módulo por especialidade + reordenação do wizard Serviço -> Data -> Profissional -> Horário -> Dados).
 *
 * O backend computa `module` em cada serviço e profissional retornados pelas rotas públicas
 * (GET /v1/public/tenants/:slug e GET /v1/public/professionals/:slug), derivando da profissão via
 * resolveCanonicalProfession() (backend/src/utils/profession-module.ts). Regras:
 *
 * - service.module nulo (sem specialty_id ou specialty sem profession_id) => compatível com QUALQUER
 *   profissional. Isso preserva o comportamento anterior a essa filtragem para clínicas que não
 *   configuraram especialidade nos serviços — nunca reduzir a lista a zero profissionais por causa
 *   de um cadastro incompleto.
 * - Caso contrário, só é compatível o profissional com o MESMO módulo primário.
 * - 'ZemdaBody': hoje NUNCA é retornado como module de um serviço — não existe como ZemdaModule, e
 *   nenhuma specialty/profession resolve para ele (é um complemento universal liberado a qualquer
 *   profissional/gestor clínico ativo, independente da profissão — ver clinic_users.zemda_body_enabled
 *   e backend/src/controllers/body-assessment.controller.ts:hasZemdaBodyAccess). O branch abaixo é uma
 *   salvaguarda para o caso de isso mudar no futuro (ex.: um serviço vir a ser explicitamente marcado
 *   como ZemdaBody); com os dados de hoje ele nunca é exercitado.
 */
export function isProfessionalCompatibleWithService(
  service: Pick<Service, 'module'> | null | undefined,
  professional: Pick<Professional, 'module' | 'zemda_body_enabled'>
): boolean {
  const serviceModule = service?.module ?? null;
  if (!serviceModule) return true;
  if (serviceModule === 'ZemdaBody') return !!professional.zemda_body_enabled;
  return serviceModule === (professional.module ?? null);
}
