# AGENTS.md — Diretrizes e Regras de Engenharia do Zemda

Este documento define regras fundamentais e mandatórias para todos os agentes de IA, desenvolvedores e colaboradores que operam no repositório do Zemda.

---

## 🛡️ ÁREA PROTEGIDA DO SISTEMA: Biblioteca de Exercícios do ZemdaPersonal

> **REGRA CRÍTICA E INEGOCIÁVEL:**  
> A biblioteca de exercícios do **ZemdaPersonal** (`backend/src/config/exercise-library.*`, `backend/src/services/exercise-media.ts`, `frontend/public/exercise-media/`, `frontend/public/exercise-photos/`, `frontend/public/exercise-fallbacks/`) é uma **ÁREA PROTEGIDA DO SISTEMA**.

### 1. Proibições Absolutas
- **NUNCA** excluir, limpar, truncar ou executar comandos destrutivos (`DELETE`, `DROP`, `TRUNCATE`) nas tabelas `personal_exercises` e `personal_workout_exercises`.
- **NUNCA** substituir ou recriar a biblioteca oficial do zero. O repositório possui um catálogo oficial com **187 exercícios canônicos**, dezenas de animações e centenas de arquivos de mídia verificados.
- **NUNCA** remover arquivos das pastas estáticas `frontend/public/exercise-media/`, `frontend/public/exercise-photos/` e `frontend/public/exercise-fallbacks/`.
- **NUNCA** alterar os IDs estáveis dos exercícios oficiais (prefixo `ex-*`), seus nomes canônicos ou suas mídias vinculadas.
- **NUNCA** encadear o seed da biblioteca (`seedExerciseLibrary`) dependente de migrações não isoladas. O seed deve possuir tratamento de erro independente e garantia de execução mesmo em caso de falha de outros módulos.

### 2. Regras de Isolamento e Persistência
- **Catálogo Oficial:** Pertence ao tenant `'global'`, com `is_custom = 0` e `is_active = 1`.
- **Exercícios das Clínicas:** Exercícios criados por profissionais recebem o `tenant_id` da clínica e `is_custom = 1`. Jamais interferem nos 187 exercícios globais.
- **Customização por Clínica:** Quando uma clínica edita um exercício global, um clone é criado com `tenant_id = clinic_id`, `is_custom = 1` e `source_exercise_id = id_global`, ocultando o global exclusivamente para aquela clínica.
- **Auto-Recuperação (Self-Healing):** A rota `/v1/personal/exercises` (`PersonalController.listExercises`) possui gatilho de auto-recuperação (`ensureExerciseLibrarySeeded`). Se o catálogo oficial estiver incompleto (< 187 registros), o seed não-destrutivo é executado imediatamente para restabelecer os 187 exercícios sem afetar dados personalizados ou treinos vinculados.
- **Histórico e Snapshots Imutáveis:** Os exercícios vinculados a treinos de alunos (`personal_workout_exercises`) são snapshots históricos congelados. Nenhuma modificação no catálogo altera treinos já realizados ou prescritos.

### 3. Validação Obrigatória
Antes de qualquer entrega ou deploy, a suíte de integridade deve ser executada com sucesso:
```bash
cd backend
npm run test:exercise-protection
```
Este teste valida a presença dos 187 exercícios oficiais, integridade dos arquivos de mídia, não-destrutividade e auto-recuperação.

---

## 📱 Foto do Treino Concluído (Mobile & Web)
- O seletor de galeria deve utilizar `<label htmlFor="...">` vinculado a inputs de arquivos nativos com suporte a `image/*`, JPEG, PNG, WebP e HEIC/HEIF.
- Dispositivos móveis (iOS Safari, Android Chrome) bloqueiam cliques sintéticos disparados de forma assíncrona (como `setTimeout`). A seleção de arquivos da galeria deve ser sempre acionada diretamente pelo gesto do usuário.
