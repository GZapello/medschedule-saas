# Plano de resposta a incidentes de segurança

> Isto não é parecer jurídico. É um roteiro operacional mínimo para os sócios/administradores do Zemda seguirem se houver suspeita de incidente (vazamento, invasão, ransomware, exclusão indevida). Ver também `docs/LGPD-CHECKLIST.md` (item 9).

## O que conta como incidente

- Acesso, cópia ou exclusão de dados sem autorização (invasão, credencial vazada, bug de autorização).
- Perda de disponibilidade que impeça a clínica de atender (banco corrompido, exclusão acidental, ransomware).
- Vazamento de segredos (`JWT_SECRET`, chaves de API, credenciais do banco) em repositório público, e-mail ou qualquer canal não controlado.
- Erro de código que exponha dados de uma clínica a outra (falha de isolamento multi-tenant).

## Papéis

- **Zemda é operador** dos dados dos pacientes; **a clínica é controladora**. Isso muda quem comunica o quê (ver passo 3).
- Quem responde primeiro: qualquer sócio que detectar ou for avisado do incidente. Não espere "ter certeza" — comece a conter assim que houver suspeita razoável.

## Passo 1 — Conter (primeiras horas)

Na ordem que fizer sentido para o caso:

1. **Segredo vazado ou comprometido:** trocar imediatamente no Railway (Variables) e reiniciar o serviço.
   - `JWT_SECRET` novo derruba todas as sessões ativas (usuários precisam logar de novo) — use isso a seu favor se suspeitar de sessão sequestrada.
   - `ZEMDA_FILES_SIGNING_SECRET`, `BACKUP_ENCRYPTION_KEY`, chaves do R2/Asaas/Resend/Gemini/Meta: trocar conforme o que foi exposto.
2. **Conta ou dispositivo comprometido:** desativar o usuário (`status = inactive` ou pelo painel de equipe), revogar tokens de convite pendentes.
3. **Vulnerabilidade de código explorável:** se possível, aplicar um fix mínimo e fazer deploy antes de qualquer outra coisa (ex.: fechar uma rota, adicionar uma checagem de perfil).
4. **Exclusão ou corrupção de dados:** parar de escrever no banco (ver `docs/BACKUP.md`, procedimento de restauração) antes que o próximo backup automático sobrescreva a única cópia boa.
5. **Repositório com segredo commitado:** o segredo já vazou (git preserva histórico); trocá-lo é obrigatório mesmo depois de "remover" o arquivo.

## Passo 2 — Avaliar

- **O que**: quais tabelas/arquivos foram acessados, alterados ou exportados.
- **Quem**: quais clínicas e quais titulares (pacientes, profissionais) foram afetados. Cruzar com `audit_logs` (mesmo incompleta — ver checklist item 6) e com os logs do Railway.
- **Desde quando**: primeira ocorrência suspeita, para dimensionar o log a revisar.
- **Dado de saúde envolvido?** Se sim, o risco é maior e a obrigação de comunicar é mais provável (LGPD art. 11 + art. 48).
- **Criança envolvida?** Mesma lógica, com atenção redobrada.

Documente por escrito o que foi encontrado, mesmo em texto simples — isso vira o registro do incidente (passo 4) e é a base para decidir se comunica.

## Passo 3 — Comunicar

- **Zemda → Clínicas afetadas:** avisar diretamente e o quanto antes, por ser o operador. A clínica decide como/quando avisar os próprios pacientes, mas o Zemda deve dar a ela informação suficiente para isso (o que aconteceu, quais dados, o que já foi feito).
- **Controlador (a clínica) → ANPD e titulares:** a LGPD (art. 48; Resolução CD/ANPD nº 15/2024) exige comunicação em prazo razoável, atualmente interpretado como **até 3 dias úteis** da ciência, quando o incidente possa acarretar risco ou dano relevante. Dado de saúde e de criança tende a se enquadrar. Isso é responsabilidade formal da clínica controladora, mas o Zemda deve fornecer os fatos a tempo dela cumprir o prazo — não espere a clínica perguntar.
- Modelo mínimo de aviso à clínica: o que aconteceu, quando foi detectado, quais dados/pacientes dela foram potencialmente afetados, o que já foi feito para conter, o que ela precisa fazer (ex.: avisar a ANPD, orientar pacientes).
- Evite prometer prazos ou causas antes de confirmar; é melhor avisar cedo com "estamos apurando" do que atrasar a comunicação esperando certeza total.

## Passo 4 — Registrar

Mantenha um registro do incidente mesmo que não seja comunicado formalmente (a norma exige manter registro internamente). Guarde num lugar duradouro (não só no chat/e-mail que resolveu o problema): data/hora de detecção, o que foi encontrado (passo 2), ações de contenção (passo 1), quem foi avisado e quando (passo 3), e o resultado do passo 5.

## Passo 5 — Corrigir e revisar

- Corrigir a causa raiz (não só o sintoma).
- Verificar se o mesmo padrão de falha existe em outro lugar do código.
- Atualizar `docs/LGPD-CHECKLIST.md` se o incidente revelar um item novo.
- Se o incidente envolveu o banco, testar a restauração de um backup limpo antes de considerar encerrado (`docs/BACKUP.md`).

## Contatos de referência

- Canal de privacidade/DPO do Zemda: `privacidade@zemda.com.br` / `dpo@zemda.com.br` (mencionados na Política de Privacidade).
- Painel do Railway: para trocar variáveis de ambiente e reiniciar o serviço.
- GitHub: para revogar tokens/chaves de deploy, se aplicável.
