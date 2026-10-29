import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { CodeChallengeMethod } from 'google-auth-library';
import { db } from '../config/database';
import { encryptRefreshToken, decryptRefreshToken, calendarEncryptionConfigured } from '../utils/google-calendar-crypto';

export class GoogleCalendarError extends Error {}

export interface GoogleCalendarSettings {
  calendar_id: string;
  calendar_name: string;
  sync_enabled: boolean;
  sync_direction: 'both' | 'zemda_to_google' | 'google_to_zemda';
  block_external_events: boolean;
  create_google_meet: boolean;
  privacy_mode: 'private' | 'show_patient_name';
  sync_interval_option: 'future' | 'next_7_days' | 'next_30_days';
}

export interface GoogleCalendarConnectionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  professional_id: string | null;
  google_account_email: string;
  google_subject: string | null;
  watch_token: string | null;
  last_sync_error: string | null;
  calendar_id: string;
  calendar_name: string;
  encrypted_refresh_token: string;
  granted_scopes: string | null;
  sync_enabled: number;
  sync_direction: string;
  block_external_events: number;
  create_google_meet: number;
  privacy_mode: string;
  sync_interval_option: string;
  last_sync_at: string | null;
  sync_token: string | null;
  watch_channel_id: string | null;
  watch_resource_id: string | null;
  watch_expiration: string | null;
  created_at: string;
  updated_at: string;
}

export interface BusyRange {
  start: string;
  end: string;
  startMin: number;
  endMin: number;
}

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.freebusy'
];

// Cache em memória de intervalos de ocupação (FreeBusy) com TTL de 3 minutos
interface BusyCacheEntry {
  fetchedAt: number;
  ranges: BusyRange[];
}
const busyCache = new Map<string, BusyCacheEntry>();
const BUSY_CACHE_TTL_MS = 3 * 60 * 1000;

export class GoogleCalendarService {
  private static operations = new Map<string, Promise<unknown>>();
  private static async serialized<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.operations.get(key) || Promise.resolve();
    const next = previous.catch(() => {}).then(work);
    this.operations.set(key, next);
    try { return await next; } finally { if (this.operations.get(key) === next) this.operations.delete(key); }
  }
  private static appointmentKey(tenantId: string, appointmentId: string): string {
    const row = db.prepare(`
      SELECT gcc.id FROM appointments a
      LEFT JOIN google_calendar_connections gcc
        ON gcc.tenant_id = a.tenant_id AND (
          gcc.professional_id = a.professional_id OR
          gcc.user_id = (SELECT p.user_id FROM professionals p WHERE p.id = a.professional_id AND p.tenant_id = a.tenant_id)
        )
      WHERE a.id = ? AND a.tenant_id = ?
      LIMIT 1
    `).get(appointmentId, tenantId) as any;
    return row?.id || `${tenantId}:${appointmentId}`;
  }
  static async syncAppointmentCreated(id: string, tenant: string) { return this.serialized(this.appointmentKey(tenant, id), () => this.syncAppointmentCreatedInternal(id, tenant)); }
  static async syncAppointmentUpdated(id: string, tenant: string, force = false) { return this.serialized(this.appointmentKey(tenant, id), () => this.syncAppointmentUpdatedInternal(id, tenant, force)); }
  static async syncAppointmentCancelled(id: string, tenant: string) { return this.serialized(this.appointmentKey(tenant, id), () => this.syncAppointmentCancelledInternal(id, tenant)); }
  static async updateSettings(tenant: string, user: string, settings: Partial<GoogleCalendarSettings>) { return this.serialized(this.getConnection(tenant, user)?.id || `${tenant}:${user}`, () => this.updateSettingsInternal(tenant, user, settings)); }
  static async disconnect(tenant: string, user: string) { return this.serialized(this.getConnection(tenant, user)?.id || `${tenant}:${user}`, () => this.disconnectInternal(tenant, user)); }
  static async syncNow(tenant: string, user: string, professional?: string | null) { return this.serialized(this.getConnection(tenant, user)?.id || `${tenant}:${user}`, () => this.syncNowInternal(tenant, user, professional)); }
  static async resolveDivergence(id: string, tenant: string, action: 'apply_google' | 'keep_zemda', user: string) { return this.serialized(this.appointmentKey(tenant, id), () => this.resolveDivergenceInternal(id, tenant, action, user)); }

  static safeReturnUrl(value?: string): string {
    const origin = new URL(this.getRedirectUri()).origin;
    try {
      const url = new URL(value || '/configuracoes?tab=integrations', origin);
      if (url.origin === origin && !url.username && !url.password) return url.href;
    } catch { /* fall back to the app */ }
    return `${origin}/configuracoes?tab=integrations`;
  }

  /**
   * Resolve o ID do profissional vinculado ao usuário e clínica.
   */
  static resolveProfessionalId(tenantId: string, userId: string): string | null {
    const row = db.prepare(`
      SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ?
    `).get(tenantId, userId) as { id: string } | undefined;
    if (row?.id) return row.id;

    // Se professionals.user_id estiver nulo, busca pelo nome do usuário no mesmo tenant
    const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(userId) as { email: string; name: string } | undefined;
    if (user?.name) {
      const profByName = db.prepare(`
        SELECT id FROM professionals WHERE tenant_id = ? AND (user_id IS NULL OR user_id = '') AND LOWER(name) = LOWER(?) LIMIT 1
      `).get(tenantId, user.name) as { id: string } | undefined;
      if (profByName?.id) {
        try {
          db.prepare("UPDATE professionals SET user_id = ?, updated_at = datetime('now') WHERE id = ?").run(userId, profByName.id);
        } catch (_) {}
        return profByName.id;
      }
    }

    // Fallback para clínica com apenas 1 profissional ativo
    const soleProf = db.prepare(`
      SELECT id FROM professionals WHERE tenant_id = ? AND active = 1
    `).all(tenantId) as { id: string }[];
    if (soleProf.length === 1) {
      try {
        db.prepare("UPDATE professionals SET user_id = ?, updated_at = datetime('now') WHERE id = ? AND user_id IS NULL").run(userId, soleProf[0].id);
      } catch (_) {}
      return soleProf[0].id;
    }

    return null;
  }

  /**
   * Verifica se o administrador configurou as credenciais OAuth de Calendar no ambiente.
   */
  static isConfigured(): boolean {
    const clientId = (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)?.trim();
    const clientSecret = (process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)?.trim();
    return Boolean(clientId && clientSecret && calendarEncryptionConfigured());
  }

  /**
   * Obtém a Redirect URI configurada para Google Calendar.
   */
  static getRedirectUri(): string {
    if (process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim()) {
      return process.env.GOOGLE_CALENDAR_REDIRECT_URI.trim();
    }
    const appUrl = (process.env.APP_URL || process.env.PUBLIC_APP_URL || 'https://zemda.com.br').replace(/\/+$/, '');
    return `${appUrl}/api/v1/integrations/google-calendar/callback`;
  }

  /**
   * Cria uma instância de OAuth2Client para Google Calendar.
   */
  static createOAuth2Client(): OAuth2Client {
    const clientId = (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)?.trim();
    const clientSecret = (process.env.GOOGLE_CALENDAR_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET)?.trim();
    const redirectUri = this.getRedirectUri();

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Obtém um OAuth2Client autenticado com os tokens de uma conexão existente.
   */
  static getAuthenticatedClient(encryptedRefreshToken: string): OAuth2Client | null {
    const refreshToken = decryptRefreshToken(encryptedRefreshToken);
    if (!refreshToken) return null;

    const oauth2Client = this.createOAuth2Client();
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });
    return oauth2Client;
  }

  /**
   * Gera a URL de autorização OAuth 2.0 com state seguro persistido no banco.
   */
  static generateAuthUrl(
    tenantId: string,
    userId: string,
    professionalId: string | null,
    returnUrl?: string
  ): { url: string; state: string } {
    if (!this.isConfigured()) {
      throw new GoogleCalendarError('Google Agenda ainda não configurado pelo administrador.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const stateId = uuidv4();
    const verifier = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos

    // Remove estados antigos expirados
    try {
      db.prepare(`DELETE FROM google_calendar_oauth_states WHERE julianday(expires_at) <= julianday('now')`).run();
    } catch (_) {}

    // Insere novo state
    db.prepare(`
      INSERT INTO google_calendar_oauth_states (id, state, tenant_id, user_id, professional_id, return_url, expires_at, code_verifier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(stateId, state, tenantId, userId, professionalId, this.safeReturnUrl(returnUrl), expiresAt, verifier);

    const oauth2Client = this.createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Garante emissão do refresh_token
      scope: SCOPES,
      state,
      include_granted_scopes: false,
      code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: CodeChallengeMethod.S256
    });

    return { url, state };
  }

  /**
   * Processa o callback OAuth 2.0 do Google.
   */
  static async handleCallback(
    code: string,
    state: string
  ): Promise<{ success: boolean; error?: string; returnUrl?: string; email?: string }> {
    if (!code || !state) {
      return { success: false, error: 'Parâmetros code ou state ausentes no callback.' };
    }

    // Valida state
    const stateRow = db.prepare(`
      SELECT * FROM google_calendar_oauth_states
      WHERE state = ? AND julianday(expires_at) > julianday('now')
    `).get(state) as {
      id: string;
      tenant_id: string;
      user_id: string;
      professional_id: string | null;
      return_url: string | null;
      code_verifier: string | null;
    } | undefined;

    if (!stateRow) {
      return { success: false, error: 'Sessão de autorização inválida ou expirada. Tente novamente.' };
    }

    // Exclui state usado imediatamente para prevenir replay
    db.prepare(`DELETE FROM google_calendar_oauth_states WHERE id = ?`).run(stateRow.id);

    const oauth2Client = this.createOAuth2Client();

    let tokens;
    try {
      const response = await oauth2Client.getToken({ code, codeVerifier: stateRow.code_verifier || undefined });
      tokens = response.tokens;
    } catch (err: any) {
      console.error('[GoogleCalendarService] Erro ao trocar code por tokens:', 'Falha na operação Google Agenda');
      return { success: false, error: 'Falha ao autenticar com o Google.', returnUrl: stateRow.return_url || undefined };
    }

    oauth2Client.setCredentials(tokens);

    if (!tokens.id_token || !tokens.access_token) throw new GoogleCalendarError('Identidade Google não confirmada. Reconecte a conta.');
    const audience = (process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)?.trim();
    const identity = (await oauth2Client.verifyIdToken({ idToken: tokens.id_token, audience })).getPayload();
    if (!identity?.sub || !identity.email || !identity.email_verified) throw new GoogleCalendarError('Conta Google sem identidade verificada.');
    const accountEmail = identity.email;
    const granted = tokens.scope?.split(' ') || (await oauth2Client.getTokenInfo(tokens.access_token)).scopes;
    if (!SCOPES.filter(scope => scope.includes('/auth/calendar')).every(scope => granted.includes(scope))) {
      throw new GoogleCalendarError('Autorize as três permissões de agenda para concluir a conexão.');
    }
    const previous = this.getConnection(stateRow.tenant_id, stateRow.user_id);
    if (previous && previous.google_subject !== identity.sub) {
      throw new GoogleCalendarError('Desconecte a integração atual antes de conectar esta conta Google.');
    }

    // Busca e seleciona a agenda padrão automaticamente (prioriza a principal ou única válida)
    let selectedCalendarId = 'primary';
    let selectedCalendarName = 'Agenda principal';
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const listRes = await calendar.calendarList.list({ minAccessRole: 'writer' });
      const items = listRes.data.items || [];
      if (items.length > 0) {
        const primary = items.find(c => c.primary);
        if (primary) {
          selectedCalendarId = primary.id || 'primary';
          selectedCalendarName = primary.summary || 'Agenda principal';
        } else if (items.length === 1) {
          selectedCalendarId = items[0].id || 'primary';
          selectedCalendarName = items[0].summary || 'Agenda principal';
        } else {
          selectedCalendarId = items[0].id || 'primary';
          selectedCalendarName = items[0].summary || 'Agenda principal';
        }
      } else {
        const primaryRes = await calendar.calendarList.get({ calendarId: 'primary' });
        if (primaryRes.data.summary) {
          selectedCalendarName = primaryRes.data.summary;
        }
      }
    } catch (err) {
      console.warn('[GoogleCalendarService] Não foi possível listar ou obter resumo da agenda principal:', 'Falha na operação Google Agenda');
    }

    const refreshTokenToSave = tokens.refresh_token || (previous?.google_subject === identity.sub
      ? decryptRefreshToken(previous.encrypted_refresh_token) : null);

    if (!refreshTokenToSave) {
      return {
        success: false,
        error: 'O Google não retornou o token de atualização offline. Por favor, desconecte o app na conta Google e tente novamente.',
        returnUrl: stateRow.return_url || undefined
      };
    }

    const encryptedToken = encryptRefreshToken(refreshTokenToSave);
    const grantedScopes = granted.join(' ');
    const connectionId = previous?.id || uuidv4();

    // Se o professionalId não veio no state, tenta resolver
    let professionalId = stateRow.professional_id || this.resolveProfessionalId(stateRow.tenant_id, stateRow.user_id);

    // Upsert na tabela de conexões: ativa sincronização e seleciona agenda automaticamente
    db.prepare(`
      INSERT INTO google_calendar_connections (
        id, tenant_id, user_id, professional_id, google_account_email,
        calendar_id, calendar_name, encrypted_refresh_token, granted_scopes,
        sync_enabled, sync_direction, block_external_events, create_google_meet,
        privacy_mode, sync_interval_option, last_sync_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        1, 'both', 1, 1,
        'private', 'future', datetime('now'), datetime('now'), datetime('now')
      )
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        professional_id = COALESCE(excluded.professional_id, google_calendar_connections.professional_id),
        google_account_email = excluded.google_account_email,
        calendar_id = COALESCE(excluded.calendar_id, google_calendar_connections.calendar_id),
        calendar_name = COALESCE(excluded.calendar_name, google_calendar_connections.calendar_name),
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        granted_scopes = excluded.granted_scopes,
        sync_enabled = 1,
        sync_direction = COALESCE(google_calendar_connections.sync_direction, 'both'),
        updated_at = datetime('now')
    `).run(
      connectionId,
      stateRow.tenant_id,
      stateRow.user_id,
      professionalId,
      accountEmail,
      selectedCalendarId,
      selectedCalendarName,
      encryptedToken,
      grantedScopes
    );

    db.prepare('UPDATE google_calendar_connections SET google_subject = ? WHERE id = ?').run(identity.sub, connectionId);

    // Registra log de auditoria
    this.recordAuditLog(
      stateRow.tenant_id,
      stateRow.user_id,
      'GOOGLE_CALENDAR_CONNECTED',
      'google_calendar_connections',
      connectionId,
      { email: accountEmail, primaryCalendar: selectedCalendarName, calendarId: selectedCalendarId }
    );

    // Inicia monitoramento de entrada e sincronização inicial automática em background
    const activeConnection = this.getConnection(stateRow.tenant_id, stateRow.user_id);
    if (activeConnection) {
      await this.ensureWatch(activeConnection);
      void this.syncNowInternal(stateRow.tenant_id, stateRow.user_id, professionalId).catch(err => {
        console.warn('[GoogleCalendarService] Sincronização inicial automática pós-conexão:', err?.message);
      });
    }

    return {
      success: true,
      email: accountEmail,
      returnUrl: stateRow.return_url || undefined
    };
  }

  /**
   * Retorna a conexão do usuário autenticado no tenant especificado.
   */
  static getConnection(tenantId: string, userId: string): GoogleCalendarConnectionRow | null {
    const row = db.prepare(`
      SELECT * FROM google_calendar_connections
      WHERE tenant_id = ? AND user_id = ?
    `).get(tenantId, userId) as GoogleCalendarConnectionRow | undefined;

    return row || null;
  }

  /**
   * Retorna a conexão associada a um profissional específico no tenant.
   */
  static getConnectionForProfessional(tenantId: string, professionalId: string): GoogleCalendarConnectionRow | null {
    // 1. Busca por professional_id direto
    let row = db.prepare(`
      SELECT * FROM google_calendar_connections
      WHERE tenant_id = ? AND professional_id = ?
    `).get(tenantId, professionalId) as GoogleCalendarConnectionRow | undefined;

    if (row) return row;

    // 2. Busca através de professionals.user_id
    row = db.prepare(`
      SELECT gcc.* FROM google_calendar_connections gcc
      JOIN professionals p ON p.user_id = gcc.user_id AND p.tenant_id = gcc.tenant_id
      WHERE gcc.tenant_id = ? AND p.id = ?
    `).get(tenantId, professionalId) as GoogleCalendarConnectionRow | undefined;

    if (row) return row;

    // 3. Fallback: se houver conexão do usuário e o profissional corresponder ao usuário
    const prof = db.prepare('SELECT id, user_id, name FROM professionals WHERE id = ? AND tenant_id = ?').get(professionalId, tenantId) as any;
    if (prof?.user_id) {
      row = db.prepare(`
        SELECT * FROM google_calendar_connections
        WHERE tenant_id = ? AND user_id = ?
      `).get(tenantId, prof.user_id) as GoogleCalendarConnectionRow | undefined;
      if (row) {
        try {
          db.prepare('UPDATE google_calendar_connections SET professional_id = ? WHERE id = ?').run(professionalId, row.id);
        } catch (_) {}
        return row;
      }
    }

    // 4. Fallback seguro: se a clínica tiver apenas 1 conexão ativa com Google Calendar
    const allConns = db.prepare('SELECT * FROM google_calendar_connections WHERE tenant_id = ? AND sync_enabled = 1').all(tenantId) as GoogleCalendarConnectionRow[];
    if (allConns.length === 1) {
      const single = allConns[0];
      // Se a conexão já possui vínculo explícito a um profissional, só pode ser usada por ele
      if (single.professional_id) {
        return single.professional_id === professionalId ? single : null;
      }
      // Se o usuário proprietário da conexão for outro profissional da clínica, NÃO vazar
      if (single.user_id) {
        const ownerProf = db.prepare('SELECT id FROM professionals WHERE user_id = ? AND tenant_id = ?').get(single.user_id, tenantId) as any;
        if (ownerProf && ownerProf.id !== professionalId) {
          return null;
        }
      }
      // Se há mais de 1 profissional ativo cadastrado na clínica, não associar arbitrariamente à agenda alheia
      const totalProfs = db.prepare('SELECT COUNT(*) as c FROM professionals WHERE tenant_id = ? AND active = 1').get(tenantId) as any;
      if (totalProfs?.c > 1) {
        return null;
      }
      return single;
    }

    return null;
  }

  /**
   * Retorna o status da integração para o usuário/profissional atual.
   */
  static getStatus(tenantId: string, userId: string, professionalId?: string | null) {
    const configured = this.isConfigured();
    if (!configured && !this.getConnection(tenantId, userId)) {
      return {
        configured: false,
        connected: false,
        message: 'Google Agenda ainda não configurado pelo administrador'
      };
    }

    let conn = this.getConnection(tenantId, userId);
    if (!conn && professionalId) {
      conn = this.getConnectionForProfessional(tenantId, professionalId);
    }

    if (!conn) {
      return {
        configured: true,
        connected: false
      };
    }

    return {
      configured,
      connected: true,
      accountEmail: conn.google_account_email,
      calendarId: conn.calendar_id,
      calendarName: conn.calendar_name,
      syncEnabled: Boolean(conn.sync_enabled),
      syncDirection: conn.sync_direction,
      blockExternalEvents: Boolean(conn.block_external_events),
      createGoogleMeet: Boolean(conn.create_google_meet),
      privacyMode: conn.privacy_mode,
      syncIntervalOption: conn.sync_interval_option,
      lastSyncAt: conn.last_sync_at,
      lastSyncError: conn.last_sync_error,
      syncStatus: !conn.sync_enabled
        ? 'disabled'
        : (conn.last_sync_error?.toLowerCase().includes('reconex') || conn.last_sync_error?.toLowerCase().includes('reconect'))
          ? 'reconnection_required'
          : conn.last_sync_error
            ? 'sync_failed'
            : 'synced',
      notificationsActive: Boolean(conn.watch_expiration && Number(conn.watch_expiration) > Date.now())
    };
  }

  /**
   * Lista as agendas disponíveis da conta Google conectada.
   */
  static async listCalendars(tenantId: string, userId: string) {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) {
      throw new GoogleCalendarError('Nenhuma conta Google conectada para este usuário.');
    }

    const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
    if (!client) {
      throw new GoogleCalendarError('Falha ao autenticar cliente Google. Conecte novamente.');
    }

    const calendar = google.calendar({ version: 'v3', auth: client });
    const items: import('googleapis').calendar_v3.Schema$CalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const response = await calendar.calendarList.list({ pageToken, minAccessRole: 'writer' });
      items.push(...(response.data.items || []));
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return items.map(c => ({
      id: c.id || 'primary',
      summary: c.summary || 'Agenda sem título',
      primary: Boolean(c.primary),
      description: c.description || null
    }));
  }

  /**
   * Atualiza as configurações da integração.
   */
  private static async updateSettingsInternal(
    tenantId: string,
    userId: string,
    settings: Partial<GoogleCalendarSettings>
  ): Promise<void> {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) {
      throw new GoogleCalendarError('Nenhuma conta Google conectada.');
    }

    for (const field of ['sync_enabled', 'block_external_events', 'create_google_meet'] as const) {
      if (settings[field] !== undefined && typeof settings[field] !== 'boolean') throw new GoogleCalendarError('Preferência inválida.');
    }
    for (const [field, values] of Object.entries({ sync_direction: ['both', 'zemda_to_google', 'google_to_zemda'], privacy_mode: ['private', 'show_patient_name'], sync_interval_option: ['future', 'next_7_days', 'next_30_days'] })) {
      const value = (settings as any)[field];
      if (value !== undefined && !values.includes(value)) throw new GoogleCalendarError('Preferência inválida.');
    }
    if (settings.calendar_id !== undefined && settings.calendar_id !== conn.calendar_id) {
      if (db.prepare('SELECT 1 FROM google_calendar_event_links WHERE connection_id = ?').get(conn.id)) {
        throw new GoogleCalendarError('Esta agenda possui eventos vinculados. Desconecte antes de trocar a agenda; os eventos existentes serão preservados no Google.');
      }
      const calendars = await this.listCalendars(tenantId, userId);
      const selected = calendars.find(c => c.id === settings.calendar_id || (settings.calendar_id === 'primary' && c.primary));
      if (!selected) throw new GoogleCalendarError('Selecione uma agenda com permissão de escrita.');
      settings.calendar_name = selected.summary;
      await this.stopWatch(conn);
      db.prepare('UPDATE google_calendar_connections SET sync_token = NULL WHERE id = ?').run(conn.id);
    } else {
      settings.calendar_name = conn.calendar_name;
    }
    const newCalendarId = settings.calendar_id !== undefined ? settings.calendar_id : conn.calendar_id;
    const newCalendarName = settings.calendar_name !== undefined ? settings.calendar_name : conn.calendar_name;
    const newSyncEnabled = settings.sync_enabled !== undefined ? (settings.sync_enabled ? 1 : 0) : conn.sync_enabled;
    const newSyncDirection = settings.sync_direction || conn.sync_direction;
    const newBlockExternal = settings.block_external_events !== undefined ? (settings.block_external_events ? 1 : 0) : conn.block_external_events;
    const newCreateMeet = settings.create_google_meet !== undefined ? (settings.create_google_meet ? 1 : 0) : conn.create_google_meet;
    const newPrivacyMode = settings.privacy_mode || conn.privacy_mode;
    const newSyncInterval = settings.sync_interval_option || conn.sync_interval_option;

    db.prepare(`
      UPDATE google_calendar_connections
      SET
        calendar_id = ?,
        calendar_name = ?,
        sync_enabled = ?,
        sync_direction = ?,
        block_external_events = ?,
        create_google_meet = ?,
        privacy_mode = ?,
        sync_interval_option = ?,
        updated_at = datetime('now')
      WHERE id = ? AND tenant_id = ?
    `).run(
      newCalendarId,
      newCalendarName,
      newSyncEnabled,
      newSyncDirection,
      newBlockExternal,
      newCreateMeet,
      newPrivacyMode,
      newSyncInterval,
      conn.id,
      tenantId
    );

    // Invalida cache de FreeBusy caso o calendário selecionado ou configuração tenha mudado
    this.clearBusyCache(tenantId, conn.professional_id || undefined);
    const updated = this.getConnection(tenantId, userId)!;
    if (updated.sync_enabled) await this.ensureWatch(updated);
    else await this.stopWatch(updated);
  }

  /**
   * Desconecta a conta Google do usuário.
   */
  private static async disconnectInternal(tenantId: string, userId: string): Promise<{ revoked: boolean }> {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) return { revoked: true };
    // Pause first; a failed revocation must not leave background synchronization active.
    db.prepare('UPDATE google_calendar_connections SET sync_enabled = 0 WHERE id = ?').run(conn.id);
    await this.stopWatch(conn);
    let revoked = false;
    try {
      const token = decryptRefreshToken(conn.encrypted_refresh_token);
      if (token) { await this.createOAuth2Client().revokeToken(token); revoked = true; }
    } catch { /* Report remote revocation separately from local deletion. */ }
    db.transaction(() => {
      db.prepare('DELETE FROM google_calendar_event_links WHERE connection_id = ?').run(conn.id);
      db.prepare('DELETE FROM google_calendar_oauth_states WHERE tenant_id = ? AND user_id = ?').run(tenantId, userId);
      db.prepare('DELETE FROM google_calendar_connections WHERE id = ? AND tenant_id = ?').run(conn.id, tenantId);
    })();
    this.clearBusyCache(tenantId, conn.professional_id || undefined);
    this.recordAuditLog(tenantId, userId, 'GOOGLE_CALENDAR_DISCONNECTED', 'google_calendar_connections', conn.id, { revoked });
    return { revoked };
  }

  /**
   * Formata data/hora ISO ou local para string RFC3339 válida para o Google Calendar.
   */
  static formatRFC3339(dateTimeStr: string, timeZone: string = 'America/Sao_Paulo'): string {
    const cleaned = dateTimeStr.trim().replace(' ', 'T');
    if (cleaned.includes('+') || (cleaned.includes('-') && cleaned.length > 19) || cleaned.endsWith('Z')) {
      return cleaned;
    }
    const withSec = cleaned.length === 16 ? `${cleaned}:00` : cleaned;
    return `${withSec}-03:00`;
  }

  /**
   * Sincroniza criação de agendamento do Zemda para o Google Calendar.
   * Não falha o agendamento no Zemda caso ocorra erro no Google.
   */
  private static async syncAppointmentCreatedInternal(appointmentId: string, tenantId: string): Promise<void> {
    try {
      // 1. Busca dados do atendimento
      const appt = db.prepare(`
        SELECT a.id, a.tenant_id, a.patient_id, a.professional_id, a.service_id,
               a.start_time, a.end_time, a.status, a.modality, a.meeting_url,
               pat.full_name as patient_name,
               s.name as service_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        LEFT JOIN services s ON s.id = a.service_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!appt || appt.status === 'cancelled') return;

      // 2. Busca conexão ativa do profissional
      const conn = this.getConnectionForProfessional(tenantId, appt.professional_id);
      if (!conn || !conn.sync_enabled || conn.sync_direction === 'google_to_zemda') return;

      const apptLocalTime = this.formatRFC3339(appt.start_time);
      const apptTimeMs = Date.parse(apptLocalTime);
      const nowMs = Date.now();
      const apptDateStr = appt.start_time.slice(0, 10);
      const todayStr = this.toClinicTime(new Date().toISOString()).slice(0, 10);

      // Atendimentos do dia de hoje ou futuros são elegíveis
      if (apptDateStr < todayStr && apptTimeMs < nowMs - 24 * 3600 * 1000) {
        return;
      }
      const daysAhead = (apptTimeMs - nowMs) / 86400000;
      if (conn.sync_interval_option === 'next_7_days' && daysAhead > 7) return;
      if (conn.sync_interval_option === 'next_30_days' && daysAhead > 30) return;

      // 3. Verifica se já existe vínculo criado (idempotência local)
      const existingLink = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (existingLink?.sync_status === 'divergent') return;
      if (existingLink && existingLink.google_event_id) {
        return this.syncAppointmentUpdatedInternal(appointmentId, tenantId);
      }

      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) {
        this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, 'pending', 'Cliente Google não autenticado');
        return;
      }

      const calendar = google.calendar({ version: 'v3', auth: client });
      const timeZone = 'America/Sao_Paulo';

      // 4. Verificação adicional de idempotência no Google via extendedProperties.private
      try {
        const searchRes = await calendar.events.list({
          calendarId: conn.calendar_id || 'primary',
          privateExtendedProperty: [`zemdaAppointmentId=${appointmentId}`],
          maxResults: 1
        });
        if (searchRes.data.items && searchRes.data.items.length > 0) {
          const found = searchRes.data.items[0];
          if (found.id && found.status !== 'cancelled') {
            this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, 'synced', null, found.id);
            return this.syncAppointmentUpdatedInternal(appointmentId, tenantId);
          }
        }
      } catch (error: any) {
        console.warn(`[GoogleCalendarService] Verificação de idempotência no Google para ${appointmentId}:`, error?.message || 'prossegue para inserção');
      }

      // 5. Monta título e descrição conforme privacy_mode (sem dados clínicos confidenciais)
      let summary = 'Atendimento Zemda';
      if (conn.privacy_mode === 'show_patient_name' && appt.patient_name) {
        summary = `Atendimento Zemda — ${appt.patient_name}`;
      }

      const description = `Gerenciado pelo Zemda.\nAbra o Zemda para visualizar os dados do atendimento.\n\nhttps://zemda.com.br/?appointment=${appointmentId}`;

      const eventPayload: any = {
        id: crypto.createHash('sha256').update(`${conn.id}:${conn.calendar_id}:${appointmentId}`).digest('hex'),
        summary,
        description,
        start: {
          dateTime: this.formatRFC3339(appt.start_time, timeZone),
          timeZone
        },
        end: {
          dateTime: this.formatRFC3339(appt.end_time, timeZone),
          timeZone
        },
        extendedProperties: {
          private: {
            zemdaAppointmentId: appointmentId,
            zemdaTenantId: tenantId
          }
        }
      };

      // 6. Suporte a Google Meet para atendimentos online
      const shouldCreateMeet =
        appt.modality === 'online' &&
        Boolean(conn.create_google_meet) &&
        !appt.meeting_url;

      if (shouldCreateMeet) {
        eventPayload.conferenceData = {
          createRequest: {
            requestId: uuidv4(),
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        };
      }

      // 7. Insere evento na Google Calendar API (recupera ou restaura se já existir)
      const insertRes = await calendar.events.insert({
        calendarId: conn.calendar_id || 'primary',
        requestBody: eventPayload,
        conferenceDataVersion: shouldCreateMeet ? 1 : 0
      }).catch(async (error: any) => {
        if (Number(error.code || error.response?.status) !== 409) throw error;
        const existingEvent = await calendar.events.get({ calendarId: conn.calendar_id || 'primary', eventId: eventPayload.id });
        if (existingEvent.data.status === 'cancelled') {
          return calendar.events.patch({
            calendarId: conn.calendar_id || 'primary',
            eventId: eventPayload.id,
            conferenceDataVersion: shouldCreateMeet ? 1 : 0,
            requestBody: {
              ...eventPayload,
              status: 'confirmed'
            }
          });
        }
        return existingEvent;
      });

      const googleEventId = insertRes.data.id;
      if (!googleEventId) {
        throw new GoogleCalendarError('Google Calendar não retornou o ID do evento.');
      }

      const meetReady = !shouldCreateMeet || await this.captureMeet(calendar, conn, appointmentId, googleEventId, insertRes.data);

      // 8. Registra o vínculo com status 'synced'
      this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, meetReady ? 'synced' : 'pending', meetReady ? null : 'Criação do Google Meet pendente', googleEventId);

      this.recordAuditLog(
        tenantId,
        conn.user_id,
        'GOOGLE_CALENDAR_EVENT_CREATED',
        'appointments',
        appointmentId,
        { googleEventId, calendarId: conn.calendar_id }
      );
    } catch (err: any) {
      const errCode = Number(err?.code || err?.response?.status) || 0;
      const errMsg = err?.message || String(err);
      const isAuthError = errCode === 401 || errMsg.includes('invalid_grant') || errMsg.includes('invalid_token') || errMsg.includes('Reconecte');

      console.error(`[GoogleCalendarService] Falha ao sincronizar criação do agendamento ${appointmentId}:`, {
        code: errCode,
        message: isAuthError ? 'Autorização Google expirada ou inválida (invalid_grant/401)' : errMsg
      });

      let profId = '';
      try {
        const a = db.prepare('SELECT professional_id FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
        profId = a?.professional_id || '';
      } catch (_) {}
      const conn = profId ? this.getConnectionForProfessional(tenantId, profId) : null;

      if (conn) {
        const syncStatus = isAuthError ? 'error' : 'pending';
        const userFriendlyError = isAuthError
          ? 'Reconexão necessária: a autorização da conta Google expirou ou foi revogada.'
          : (errCode === 403
              ? 'Permissão insuficiente na agenda Google selecionada.'
              : 'Falha na comunicação com Google Agenda. Tente novamente ou use Sincronizar agora.');

        if (isAuthError) {
          db.prepare("UPDATE google_calendar_connections SET last_sync_error = ? WHERE id = ?").run(userFriendlyError, conn.id);
        }

        this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, syncStatus, userFriendlyError);
        this.recordAuditLog(
          tenantId,
          conn.user_id,
          'GOOGLE_CALENDAR_SYNC_ERROR',
          'appointments',
          appointmentId,
          { error: userFriendlyError, statusCode: errCode }
        );
      }
    }
  }

  /**
   * Sincroniza atualização de horário ou dados de um agendamento para o Google Calendar.
   */
  private static async syncAppointmentUpdatedInternal(appointmentId: string, tenantId: string, force = false): Promise<void> {
    try {
      const appt = db.prepare(`
        SELECT a.id, a.tenant_id, a.patient_id, a.professional_id,
               a.start_time, a.end_time, a.status, a.modality, a.meeting_url,
               pat.full_name as patient_name
        FROM appointments a
        JOIN patients pat ON pat.id = a.patient_id
        WHERE a.id = ? AND a.tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!appt) return;

      if (appt.status === 'cancelled') {
        return this.syncAppointmentCancelledInternal(appointmentId, tenantId);
      }

      const link = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (link?.sync_status === 'divergent' && !force) return;
      if (!link || !link.google_event_id) {
        // Se ainda não existia vínculo, tenta criar
        return this.syncAppointmentCreatedInternal(appointmentId, tenantId);
      }

      const conn = db.prepare(`
        SELECT * FROM google_calendar_connections WHERE id = ? AND tenant_id = ?
      `).get(link.connection_id, tenantId) as GoogleCalendarConnectionRow | undefined;

      if (!conn || !conn.sync_enabled || conn.sync_direction === 'google_to_zemda') return;
      if (conn.professional_id !== appt.professional_id) throw new GoogleCalendarError('O atendimento foi transferido para outro profissional. Revise o vínculo Google.');

      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) throw new GoogleCalendarError('Reconecte a conta Google.');

      const calendar = google.calendar({ version: 'v3', auth: client });
      const timeZone = 'America/Sao_Paulo';

      let summary = 'Atendimento Zemda';
      if (conn.privacy_mode === 'show_patient_name' && appt.patient_name) {
        summary = `Atendimento Zemda — ${appt.patient_name}`;
      }

      const remote = await calendar.events.get({ calendarId: link.calendar_id, eventId: link.google_event_id });
      const wantsMeet = appt.modality === 'online' && Boolean(conn.create_google_meet) && !appt.meeting_url;
      const conference = remote.data.conferenceData;
      const createMeet = wantsMeet && (!conference || conference.createRequest?.status?.statusCode === 'failure');
      const patched = await calendar.events.patch({
        calendarId: link.calendar_id,
        eventId: link.google_event_id,
        conferenceDataVersion: 1,
        requestBody: {
          ...(createMeet ? { conferenceData: { createRequest: { requestId: uuidv4(), conferenceSolutionKey: { type: 'hangoutsMeet' } } } } : {}),
          summary,
          start: {
            dateTime: this.formatRFC3339(appt.start_time, timeZone),
            timeZone
          },
          end: {
            dateTime: this.formatRFC3339(appt.end_time, timeZone),
            timeZone
          }
        }
      });

      const meetReady = !wantsMeet || await this.captureMeet(calendar, conn, appt.id, link.google_event_id, { ...remote.data, ...patched.data });
      db.prepare(`
        UPDATE google_calendar_event_links
        SET sync_status = ?, last_error = ?, last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(meetReady ? 'synced' : 'pending', meetReady ? null : 'Criação do Google Meet pendente', link.id);

      this.recordAuditLog(
        tenantId,
        conn.user_id,
        'GOOGLE_CALENDAR_EVENT_UPDATED',
        'appointments',
        appointmentId,
        { googleEventId: link.google_event_id }
      );
    } catch (err: any) {
      const errCode = Number(err?.code || err?.response?.status) || 0;
      const errMsg = err?.message || String(err);
      const isAuthError = errCode === 401 || errMsg.includes('invalid_grant') || errMsg.includes('invalid_token') || errMsg.includes('Reconecte');

      console.error(`[GoogleCalendarService] Falha ao sincronizar atualização do agendamento ${appointmentId}:`, {
        code: errCode,
        message: isAuthError ? 'Autorização Google expirada ou inválida (invalid_grant/401)' : errMsg
      });
      try {
        const userFriendly = isAuthError
          ? 'Reconexão necessária: autorização Google expirou ou foi revogada.'
          : 'Falha na comunicação com Google Agenda. Tente novamente ou use Sincronizar agora.';
        db.prepare(`
          UPDATE google_calendar_event_links
          SET sync_status = ?, last_error = ?, updated_at = datetime('now')
          WHERE appointment_id = ? AND tenant_id = ?
        `).run(isAuthError ? 'error' : 'pending', userFriendly, appointmentId, tenantId);
      } catch (_) {}
    }
  }

  /**
   * Sincroniza cancelamento de agendamento, removendo o evento do Google Calendar.
   */
  private static async syncAppointmentCancelledInternal(appointmentId: string, tenantId: string): Promise<void> {
    try {
      const link = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!link) return;

      const conn = db.prepare(`
        SELECT * FROM google_calendar_connections WHERE id = ? AND tenant_id = ?
      `).get(link.connection_id, tenantId) as GoogleCalendarConnectionRow | undefined;

      if (!conn || !conn.sync_enabled || conn.sync_direction === 'google_to_zemda') return;
      if (conn) {
        const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
        if (!client) throw new GoogleCalendarError('Reconecte a conta Google.');
        if (client) {
          const calendar = google.calendar({ version: 'v3', auth: client });
          try {
            await calendar.events.delete({
              calendarId: link.calendar_id,
              eventId: link.google_event_id
            });
          } catch (delErr: any) {
            // Ignora se o evento já havia sido removido no Google (404/410)
            if (delErr.code !== 404 && delErr.code !== 410) {
              throw delErr;
            }
          }
        }
      }

      // Remove o vínculo local do agendamento cancelado
      db.prepare(`
        DELETE FROM google_calendar_event_links WHERE id = ?
      `).run(link.id);

      this.recordAuditLog(
        tenantId,
        conn?.user_id || 'system',
        'GOOGLE_CALENDAR_EVENT_REMOVED',
        'appointments',
        appointmentId,
        { googleEventId: link.google_event_id }
      );
    } catch (err: any) {
      const errCode = Number(err?.code || err?.response?.status) || 0;
      const errMsg = err?.message || String(err);
      console.error(`[GoogleCalendarService] Falha ao sincronizar cancelamento do agendamento ${appointmentId}:`, {
        code: errCode,
        message: errMsg
      });
      db.prepare("UPDATE google_calendar_event_links SET sync_status = 'pending', last_error = 'Cancelamento pendente no Google' WHERE appointment_id = ? AND tenant_id = ?").run(appointmentId, tenantId);
    }
  }

  /**
   * Consulta os intervalos ocupados (FreeBusy) de uma agenda Google para um determinado dia.
   * Utiliza cache em memória de 3 minutos para performance sem sobrecarregar a Google API.
   * Em caso de indisponibilidade do Google, retorna array vazio sem travar a agenda do Zemda.
   */
  static async getBusyIntervals(tenantId: string, professionalId: string, dateStr: string): Promise<BusyRange[]> {
    const conn = this.getConnectionForProfessional(tenantId, professionalId);
    if (!conn || !conn.sync_enabled || !conn.block_external_events) return [];
    const cacheKey = `${tenantId}:${professionalId}:${dateStr}`;
    const cached = busyCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.fetchedAt < BUSY_CACHE_TTL_MS) return cached.ranges;

    const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
    if (!client) throw new GoogleCalendarError('Não foi possível verificar a disponibilidade Google. Reconecte a conta.');

    try {
      const calendar = google.calendar({ version: 'v3', auth: client });
      const timeZone = 'America/Sao_Paulo';
      const timeMin = `${dateStr}T00:00:00-03:00`;
      const timeMax = `${dateStr}T23:59:59-03:00`;
      const targetCalendarId = conn.calendar_id || 'primary';

      const fbRes = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          timeZone,
          items: [{ id: targetCalendarId }]
        }
      });

      const result = fbRes.data.calendars?.[targetCalendarId];
      if (!result || result.errors?.length) throw new GoogleCalendarError('Disponibilidade Google indisponível.');
      const busyItems = result.busy || [];
      const ranges: BusyRange[] = [];

      for (const item of busyItems) {
        if (!item.start || !item.end) continue;
        const startMin = this.parseIsoToMinuteOfDay(item.start, dateStr);
        const endMin = this.parseIsoToMinuteOfDay(item.end, dateStr);

        ranges.push({
          start: item.start,
          end: item.end,
          startMin,
          endMin
        });
      }

      const current = this.getConnection(tenantId, conn.user_id);
      if (!current?.sync_enabled || !current.block_external_events) return [];
      if (current.id !== conn.id || current.calendar_id !== conn.calendar_id) throw new GoogleCalendarError('Configuração da agenda mudou. Tente novamente.');
      busyCache.set(cacheKey, { fetchedAt: now, ranges });
      return ranges;
    } catch (err: any) {
      console.warn(`[GoogleCalendarService] Aviso: FreeBusy Google indisponível para profissional ${professionalId}:`, 'Falha na operação Google Agenda');
      throw new GoogleCalendarError('Não foi possível verificar a disponibilidade Google. Tente novamente.');
    }
  }

  /**
   * Força sincronização imediata ("Sincronizar agora").
   */
  private static async captureMeet(calendar: ReturnType<typeof google.calendar>, conn: GoogleCalendarConnectionRow, appointmentId: string, eventId: string, event: import('googleapis').calendar_v3.Schema$Event) {
    let url = event.hangoutLink || event.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
    
    // Se a criação do Meet estiver em processamento assíncrono no Google, aguarda brevemente e reconsulta
    if (!url && event.conferenceData?.createRequest?.status?.statusCode === 'pending') {
      try {
        await new Promise(resolve => setTimeout(resolve, 600));
        const refetched = await calendar.events.get({ calendarId: conn.calendar_id || 'primary', eventId });
        url = refetched.data.hangoutLink || refetched.data.conferenceData?.entryPoints?.find(e => e.entryPointType === 'video')?.uri;
      } catch (_) {}
    }

    if (url && /^https:\/\/meet\.google\.com\//.test(url)) {
      db.prepare("UPDATE appointments SET meeting_url = ?, updated_at = datetime('now') WHERE id = ? AND tenant_id = ? AND (meeting_url IS NULL OR meeting_url = '')").run(url, appointmentId, conn.tenant_id);
      db.prepare("UPDATE google_calendar_event_links SET sync_status = 'synced', last_error = NULL WHERE appointment_id = ? AND connection_id = ? AND sync_status = 'pending' AND last_error = 'Criação do Google Meet pendente'").run(appointmentId, conn.id);
      return true;
    }
    return false;
  }

  private static async stopWatch(conn: GoogleCalendarConnectionRow) {
    if (conn.watch_channel_id && conn.watch_resource_id) {
      try {
        const auth = this.getAuthenticatedClient(conn.encrypted_refresh_token);
        if (auth) await google.calendar({ version: 'v3', auth }).channels.stop({ requestBody: { id: conn.watch_channel_id, resourceId: conn.watch_resource_id } });
      } catch { /* Old channels expire remotely; clear local acceptance immediately. */ }
    }
    db.prepare('UPDATE google_calendar_connections SET watch_channel_id = NULL, watch_resource_id = NULL, watch_token = NULL, watch_expiration = NULL WHERE id = ?').run(conn.id);
  }

  static async ensureWatch(conn: GoogleCalendarConnectionRow): Promise<void> {
    if (!conn.sync_enabled) return;
    if (conn.watch_channel_id && conn.watch_token && Number(conn.watch_expiration) > Date.now() + 3600000) return;
    try {
      const auth = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!auth) throw new GoogleCalendarError('Reconecte a conta.');
      const address = new URL(this.getRedirectUri());
      address.pathname = '/api/v1/integrations/google-calendar/webhook';
      if (address.protocol !== 'https:') throw new GoogleCalendarError('Webhook exige HTTPS.');
      const id = uuidv4();
      const token = crypto.randomBytes(32).toString('hex');
      const response = await google.calendar({ version: 'v3', auth }).events.watch({
        calendarId: conn.calendar_id,
        requestBody: { id, type: 'web_hook', address: address.href, token, expiration: String(Date.now() + 6 * 24 * 3600000) }
      });
      if (!response.data.resourceId || !response.data.expiration) throw new GoogleCalendarError('Canal não confirmado.');
      await this.stopWatch(conn);
      db.prepare('UPDATE google_calendar_connections SET watch_channel_id = ?, watch_resource_id = ?, watch_token = ?, watch_expiration = ?, last_sync_error = NULL WHERE id = ? AND sync_enabled = 1')
        .run(id, response.data.resourceId, token, response.data.expiration, conn.id);
    } catch {
      db.prepare("UPDATE google_calendar_connections SET last_sync_error = 'Notificações Google indisponíveis. Use Sincronizar agora e tente novamente.' WHERE id = ?").run(conn.id);
    }
  }

  private static async pullChanges(conn: GoogleCalendarConnectionRow, reset = false): Promise<void> {
    const auth = this.getAuthenticatedClient(conn.encrypted_refresh_token);
    if (!auth) throw new GoogleCalendarError('Reconecte a conta Google.');
    const calendar = google.calendar({ version: 'v3', auth });
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    try {
      do {
        const result = await calendar.events.list({ calendarId: conn.calendar_id, maxResults: 250, showDeleted: true,
          syncToken: reset ? undefined : conn.sync_token || undefined, pageToken });
        for (const item of result.data.items || []) {
          // Match the local link, never trust extendedProperties from a remote event.
          const link = db.prepare(`SELECT l.id, l.appointment_id, a.start_time, a.end_time, a.status, a.modality
            FROM google_calendar_event_links l JOIN appointments a ON a.id = l.appointment_id AND a.tenant_id = l.tenant_id
            WHERE l.connection_id = ? AND l.tenant_id = ? AND l.calendar_id = ? AND l.google_event_id = ?`)
            .get(conn.id, conn.tenant_id, conn.calendar_id, item.id || '') as any;
          if (!link) continue;
          if (item.status === 'cancelled' && link.status === 'cancelled') {
            db.prepare('DELETE FROM google_calendar_event_links WHERE id = ?').run(link.id);
            continue;
          }
          if (link.modality === 'online' && conn.create_google_meet) await this.captureMeet(calendar, conn, link.appointment_id, item.id!, item);
          if (conn.sync_direction !== 'zemda_to_google') {
            const changed = item.status === 'cancelled' || !item.start?.dateTime || !item.end?.dateTime ||
              Date.parse(item.start.dateTime) !== Date.parse(this.formatRFC3339(link.start_time)) ||
              Date.parse(item.end.dateTime) !== Date.parse(this.formatRFC3339(link.end_time));
            if (changed) db.prepare("UPDATE google_calendar_event_links SET sync_status = 'divergent', last_google_updated_at = ? WHERE id = ?")
              .run(item.updated || new Date().toISOString(), link.id);
          }
        }
        pageToken = result.data.nextPageToken || undefined;
        nextSyncToken = result.data.nextSyncToken || undefined;
      } while (pageToken);
      if (nextSyncToken) db.prepare('UPDATE google_calendar_connections SET sync_token = ? WHERE id = ?').run(nextSyncToken, conn.id);
      this.clearBusyCache(conn.tenant_id, conn.professional_id || undefined);
    } catch (error: any) {
      if (Number(error.code || error.response?.status) === 410 && !reset) {
        db.prepare('UPDATE google_calendar_connections SET sync_token = NULL WHERE id = ?').run(conn.id);
        return this.pullChanges(conn, true);
      }
      throw new GoogleCalendarError('Não foi possível receber as alterações da agenda Google. Tente novamente.');
    }
  }

  private static async syncNowInternal(tenantId: string, userId: string, professionalId?: string | null): Promise<{ syncedCount: number; pendingCount: number; message: string }> {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) throw new GoogleCalendarError('Nenhuma conta Google conectada.');
    if (!conn.sync_enabled) throw new GoogleCalendarError('Ative a sincronização antes de continuar.');
    await this.ensureWatch(conn);
    await this.pullChanges(conn);
    let syncedCount = 0, pendingCount = 0;
    const profId = conn.professional_id || professionalId;
    if (profId && conn.sync_direction !== 'google_to_zemda') {
      let offset = 0;
      while (true) {
        const appts = db.prepare(`SELECT a.id, a.status FROM appointments a
          WHERE a.tenant_id = ? AND a.professional_id = ? AND
          ((a.status != 'cancelled' AND datetime(a.start_time) >= datetime('now', '-3 hours')
            AND (? = 'future' OR date(a.start_time) <= date('now', '-3 hours', ?)))
           OR (a.status = 'cancelled' AND EXISTS (SELECT 1 FROM google_calendar_event_links l WHERE l.appointment_id = a.id AND l.connection_id = ?)))
          ORDER BY a.id LIMIT 100 OFFSET ?`).all(tenantId, profId, conn.sync_interval_option,
          conn.sync_interval_option === 'next_7_days' ? '+7 days' : '+30 days', conn.id, offset) as {id: string; status: string}[];
        if (!appts.length) break;
        // Stable ID pagination because successful cancellations remove rows from this selection.
        for (const appt of appts) {
          if (appt.status === 'cancelled') await this.syncAppointmentCancelledInternal(appt.id, tenantId);
          else await this.syncAppointmentCreatedInternal(appt.id, tenantId);
          const link = db.prepare('SELECT sync_status FROM google_calendar_event_links WHERE appointment_id = ? AND connection_id = ?').get(appt.id, conn.id) as any;
          if (link?.sync_status === 'synced' || (!link && appt.status === 'cancelled')) syncedCount++;
          else pendingCount++;
        }
        // Non-cancelled rows remain; failed cancellations also remain.
        offset += appts.filter(a => a.status !== 'cancelled' || db.prepare('SELECT 1 FROM google_calendar_event_links WHERE appointment_id = ?').get(a.id)).length;
      }
    }
    db.prepare("UPDATE google_calendar_connections SET last_sync_at = datetime('now'), last_sync_error = CASE WHEN CAST(watch_expiration AS INTEGER) > ? THEN NULL ELSE last_sync_error END WHERE id = ?").run(Date.now(), conn.id);
    this.clearBusyCache(tenantId, profId || undefined);
    return { syncedCount, pendingCount, message: `${syncedCount} atendimento(s) sincronizado(s); ${pendingCount} pendência(s). Alterações do Google consultadas.` };
  }

  static async handleWebhook(headers: Record<string, string | string[] | undefined>): Promise<void> {
    const channelId = headers['x-goog-channel-id'];
    const token = headers['x-goog-channel-token'];
    if (typeof channelId !== 'string' || typeof token !== 'string') return;
    const conn = db.prepare('SELECT * FROM google_calendar_connections WHERE watch_channel_id = ? AND sync_enabled = 1').get(channelId) as GoogleCalendarConnectionRow | undefined;
    if (!conn?.watch_token || conn.watch_resource_id !== headers['x-goog-resource-id'] || Number(conn.watch_expiration) <= Date.now()) return;
    const expected = Buffer.from(conn.watch_token), received = Buffer.from(token);
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) return;
    this.clearBusyCache(conn.tenant_id, conn.professional_id || undefined);
    if (headers['x-goog-resource-state'] === 'sync') return;
    await this.serialized(conn.id, async () => {
      const fresh = this.getConnection(conn.tenant_id, conn.user_id);
      if (fresh?.sync_enabled) await this.pullChanges(fresh);
    });
  }

  private static maintenanceRunning = false;
  static async maintainConnections(): Promise<void> {
    for (const [key, entry] of busyCache) if (Date.now() - entry.fetchedAt >= BUSY_CACHE_TTL_MS) busyCache.delete(key);
    db.prepare("DELETE FROM google_calendar_oauth_states WHERE julianday(expires_at) <= julianday('now')").run();
    if (this.maintenanceRunning || !this.isConfigured()) return;
    this.maintenanceRunning = true;
    try {
      db.prepare("DELETE FROM google_calendar_oauth_states WHERE julianday(expires_at) <= julianday('now')").run();
      const connections = db.prepare('SELECT * FROM google_calendar_connections WHERE sync_enabled = 1').all() as GoogleCalendarConnectionRow[];
      for (const conn of connections) {
        try { await this.syncNow(conn.tenant_id, conn.user_id, conn.professional_id); }
        catch { db.prepare("UPDATE google_calendar_connections SET last_sync_error = 'Sincronização pendente. Tente novamente ou reconecte sua conta.' WHERE id = ?").run(conn.id); }
      }
    } finally { this.maintenanceRunning = false; }
  }

  /**
   * Resolve divergência entre o agendamento do Zemda e o evento alterado no Google Calendar.
   */
  private static async resolveDivergenceInternal(
    appointmentId: string,
    tenantId: string,
    action: 'apply_google' | 'keep_zemda',
    userId: string
  ): Promise<{ message: string }> {
    const link = db.prepare(`
      SELECT * FROM google_calendar_event_links
      WHERE appointment_id = ? AND tenant_id = ?
    `).get(appointmentId, tenantId) as any;

    if (!link) {
      throw new GoogleCalendarError('Vínculo com Google Calendar não encontrado.');
    }

    const conn = db.prepare(`
      SELECT * FROM google_calendar_connections WHERE id = ?
    `).get(link.connection_id) as GoogleCalendarConnectionRow | undefined;

    if (!conn || conn.tenant_id !== tenantId || conn.user_id !== userId) throw new GoogleCalendarError('Sem permissão para alterar esta conexão Google.');
    if (!conn.sync_enabled) throw new GoogleCalendarError('Ative a sincronização antes de resolver a divergência.');
    if ((action === 'apply_google' && conn.sync_direction === 'zemda_to_google') || (action === 'keep_zemda' && conn.sync_direction === 'google_to_zemda')) throw new GoogleCalendarError('Esta ação não corresponde à direção de sincronização escolhida.');

    if (action === 'apply_google') {
      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) throw new GoogleCalendarError('Não autenticado com o Google.');

      const calendar = google.calendar({ version: 'v3', auth: client });
      const gEvent = await calendar.events.get({
        calendarId: link.calendar_id,
        eventId: link.google_event_id
      });

      const gStart = gEvent.data.start?.dateTime;
      const gEnd = gEvent.data.end?.dateTime;
      if (gStart && gEnd) {
        // Converte para formato Zemda
        const cleanStart = this.toClinicTime(gStart);
        const cleanEnd = this.toClinicTime(gEnd);
        const appt = db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(appointmentId, tenantId) as any;
        if (!appt || ['cancelled', 'completed', 'in_progress'].includes(appt.status)) throw new GoogleCalendarError('Este atendimento não pode ser remarcado.');
        if (cleanStart >= cleanEnd || cleanStart.slice(0,10) !== cleanEnd.slice(0,10)) throw new GoogleCalendarError('Intervalo Google inválido para atendimento.');
        const { validateClinicBusinessHours, validateProfessionalSchedule } = await import('../controllers/appointment.controller');
        for (const validation of [validateClinicBusinessHours(tenantId, cleanStart, cleanEnd), validateProfessionalSchedule(tenantId, appt.professional_id, cleanStart, cleanEnd)]) {
          if (!validation.valid) throw new GoogleCalendarError(validation.error || 'Horário indisponível.');
        }
        const conflict = db.prepare(`SELECT 1 FROM appointments WHERE tenant_id = ? AND id != ? AND status NOT IN ('cancelled', 'no_show')
          AND (professional_id = ? OR patient_id = ? OR (room_id IS NOT NULL AND room_id = ?))
          AND datetime(start_time) < datetime(?) AND datetime(end_time) > datetime(?)`)
          .get(tenantId, appointmentId, appt.professional_id, appt.patient_id, appt.room_id, cleanEnd, cleanStart);
        if (conflict) throw new GoogleCalendarError('O horário Google conflita com outro atendimento do profissional, paciente ou sala.');

        db.prepare(`
          UPDATE appointments
          SET start_time = ?, end_time = ?, google_time_imported = 1, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(cleanStart, cleanEnd, appointmentId, tenantId);

        db.prepare(`
          UPDATE google_calendar_event_links
          SET sync_status = 'synced', last_synced_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(link.id);

        this.clearBusyCache(tenantId, conn.professional_id || undefined);
        this.recordAuditLog(tenantId, userId, 'GOOGLE_CALENDAR_DIVERGENCE_RESOLVED', 'appointments', appointmentId, { action });
        return { message: 'Horário do Google aplicado com sucesso ao Zemda.' };
      }
    } else {
      // keep_zemda: força o horário do Zemda de volta no Google Calendar
      await this.syncAppointmentUpdatedInternal(appointmentId, tenantId, true);
      const updated = db.prepare('SELECT sync_status FROM google_calendar_event_links WHERE id = ?').get(link.id) as any;
      if (updated?.sync_status !== 'synced') throw new GoogleCalendarError('A atualização no Google está pendente. Tente novamente.');
      db.prepare(`
        UPDATE google_calendar_event_links
        SET sync_status = 'synced', last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);

      return { message: 'Horário do Zemda preservado e atualizado no Google Agenda.' };
    }

    throw new GoogleCalendarError('Evento removido ou sem horário no Google. Ajuste o atendimento pela agenda Zemda.');
  }

  /**
   * Invalida o cache de ocupação FreeBusy.
   */
  static clearBusyCache(tenantId: string, professionalId?: string): void {
    if (professionalId) {
      for (const key of busyCache.keys()) {
        if (key.startsWith(`${tenantId}:${professionalId}:`)) {
          busyCache.delete(key);
        }
      }
    } else {
      for (const key of busyCache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
          busyCache.delete(key);
        }
      }
    }
  }

  static toClinicTime(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new GoogleCalendarError('Data Google inválida.');
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(part => [part.type, part.value]));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
  }

  private static parseIsoToMinuteOfDay(isoStr: string, targetDateStr: string): number {
    const local = this.toClinicTime(isoStr);
    if (local.slice(0, 10) < targetDateStr) return 0;
    if (local.slice(0, 10) > targetDateStr) return 1440;
    return Number(local.slice(11, 13)) * 60 + Number(local.slice(14, 16));
  }

  private static recordEventLink(
    tenantId: string,
    appointmentId: string,
    connectionId: string,
    calendarId: string,
    syncStatus: 'synced' | 'pending' | 'error',
    lastError: string | null = null,
    googleEventId?: string
  ): void {
    const existing = db.prepare(`
      SELECT id FROM google_calendar_event_links WHERE appointment_id = ?
    `).get(appointmentId) as { id: string } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE google_calendar_event_links
        SET connection_id = ?,
            calendar_id = ?,
            google_event_id = COALESCE(?, google_event_id),
            sync_status = ?,
            last_error = ?,
            last_synced_at = CASE WHEN ? = 'synced' THEN datetime('now') ELSE last_synced_at END,
            updated_at = datetime('now')
        WHERE id = ?
      `).run(connectionId, calendarId, googleEventId || null, syncStatus, lastError, syncStatus, existing.id);
    } else {
      db.prepare(`
        INSERT INTO google_calendar_event_links (
          id, tenant_id, appointment_id, connection_id, calendar_id, google_event_id,
          sync_status, last_error, last_synced_at, created_at, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?, CASE WHEN ? = 'synced' THEN datetime('now') ELSE NULL END, datetime('now'), datetime('now')
        )
      `).run(
        uuidv4(),
        tenantId,
        appointmentId,
        connectionId,
        calendarId,
        googleEventId || '',
        syncStatus,
        lastError,
        syncStatus
      );
    }
  }

  private static recordAuditLog(
    tenantId: string,
    userId: string,
    action: string,
    entity: string,
    entityId: string,
    details?: Record<string, any>
  ): void {
    try {
      const id = uuidv4();
      const detailsJson = details ? JSON.stringify(details) : null;
      db.prepare(`
        INSERT INTO audit_logs (id, tenant_id, user_id, action, entity, entity_id, ip_address, user_agent, details_json)
        VALUES (?, ?, ?, ?, ?, ?, '127.0.0.1', 'GoogleCalendarService', ?)
      `).run(id, tenantId, userId, action, entity, entityId, detailsJson);
    } catch (_) {}
  }
}
