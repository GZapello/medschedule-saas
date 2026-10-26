import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { db } from '../config/database';
import { encryptRefreshToken, decryptRefreshToken } from '../utils/google-calendar-crypto';

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
  /**
   * Verifica se o administrador configurou as credenciais OAuth de Calendar no ambiente.
   */
  static isConfigured(): boolean {
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
    return Boolean(clientId && clientSecret);
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
    const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim();
    const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim();
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
      throw new Error('Google Agenda ainda não configurado pelo administrador.');
    }

    const state = crypto.randomBytes(32).toString('hex');
    const stateId = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutos

    // Remove estados antigos expirados
    try {
      db.prepare(`DELETE FROM google_calendar_oauth_states WHERE expires_at < datetime('now')`).run();
    } catch (_) {}

    // Insere novo state
    db.prepare(`
      INSERT INTO google_calendar_oauth_states (id, state, tenant_id, user_id, professional_id, return_url, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(stateId, state, tenantId, userId, professionalId, returnUrl || null, expiresAt);

    const oauth2Client = this.createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // Garante emissão do refresh_token
      scope: SCOPES,
      state,
      include_granted_scopes: true
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
      WHERE state = ? AND expires_at > datetime('now')
    `).get(state) as {
      id: string;
      tenant_id: string;
      user_id: string;
      professional_id: string | null;
      return_url: string | null;
    } | undefined;

    if (!stateRow) {
      return { success: false, error: 'Sessão de autorização inválida ou expirada. Tente novamente.' };
    }

    // Exclui state usado imediatamente para prevenir replay
    db.prepare(`DELETE FROM google_calendar_oauth_states WHERE id = ?`).run(stateRow.id);

    const oauth2Client = this.createOAuth2Client();

    let tokens;
    try {
      const response = await oauth2Client.getToken(code);
      tokens = response.tokens;
    } catch (err: any) {
      console.error('[GoogleCalendarService] Erro ao trocar code por tokens:', err?.message || err);
      return { success: false, error: 'Falha ao autenticar com o Google.', returnUrl: stateRow.return_url || undefined };
    }

    oauth2Client.setCredentials(tokens);

    // Obtém e-mail da conta autorizada
    let accountEmail = '';
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      accountEmail = userInfo.data.email || '';
    } catch (_) {
      // Fallback: decodifica payload do id_token se disponível
      if (tokens.id_token) {
        try {
          const parts = tokens.id_token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
            accountEmail = payload.email || '';
          }
        } catch (_) {}
      }
    }

    if (!accountEmail) {
      accountEmail = 'google-calendar-user@gmail.com';
    }

    // Busca nome da agenda principal
    let primaryCalendarName = 'Agenda principal';
    try {
      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      const primaryRes = await calendar.calendarList.get({ calendarId: 'primary' });
      if (primaryRes.data.summary) {
        primaryCalendarName = primaryRes.data.summary;
      }
    } catch (err) {
      console.warn('[GoogleCalendarService] Não foi possível obter resumo da agenda principal:', err);
    }

    // Resolve refresh token: se o Google não emitiu novo refresh token (ex: consent já existente),
    // preserva o armazenado anteriormente
    let refreshTokenToSave = tokens.refresh_token;
    if (!refreshTokenToSave) {
      const existing = db.prepare(`
        SELECT encrypted_refresh_token FROM google_calendar_connections
        WHERE tenant_id = ? AND user_id = ?
      `).get(stateRow.tenant_id, stateRow.user_id) as { encrypted_refresh_token: string } | undefined;

      if (existing) {
        refreshTokenToSave = decryptRefreshToken(existing.encrypted_refresh_token) || undefined;
      }
    }

    if (!refreshTokenToSave) {
      return {
        success: false,
        error: 'O Google não retornou o token de atualização offline. Por favor, desconecte o app na conta Google e tente novamente.',
        returnUrl: stateRow.return_url || undefined
      };
    }

    const encryptedToken = encryptRefreshToken(refreshTokenToSave);
    const grantedScopes = tokens.scope || SCOPES.join(' ');
    const connectionId = uuidv4();

    // Se o professionalId não veio no state, tenta resolver
    let professionalId = stateRow.professional_id;
    if (!professionalId) {
      const profRow = db.prepare(`
        SELECT id FROM professionals WHERE tenant_id = ? AND user_id = ?
      `).get(stateRow.tenant_id, stateRow.user_id) as { id: string } | undefined;
      if (profRow) professionalId = profRow.id;
    }

    // Upsert na tabela de conexões
    db.prepare(`
      INSERT INTO google_calendar_connections (
        id, tenant_id, user_id, professional_id, google_account_email,
        calendar_id, calendar_name, encrypted_refresh_token, granted_scopes,
        sync_enabled, sync_direction, block_external_events, create_google_meet,
        privacy_mode, sync_interval_option, last_sync_at, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        'primary', ?, ?, ?,
        1, 'both', 1, 1,
        'private', 'future', datetime('now'), datetime('now'), datetime('now')
      )
      ON CONFLICT(tenant_id, user_id) DO UPDATE SET
        professional_id = COALESCE(excluded.professional_id, google_calendar_connections.professional_id),
        google_account_email = excluded.google_account_email,
        calendar_id = 'primary',
        calendar_name = excluded.calendar_name,
        encrypted_refresh_token = excluded.encrypted_refresh_token,
        granted_scopes = excluded.granted_scopes,
        sync_enabled = 1,
        updated_at = datetime('now')
    `).run(
      connectionId,
      stateRow.tenant_id,
      stateRow.user_id,
      professionalId,
      accountEmail,
      primaryCalendarName,
      encryptedToken,
      grantedScopes
    );

    // Registra log de auditoria
    this.recordAuditLog(
      stateRow.tenant_id,
      stateRow.user_id,
      'GOOGLE_CALENDAR_CONNECTED',
      'google_calendar_connections',
      connectionId,
      { email: accountEmail, primaryCalendar: primaryCalendarName }
    );

    // Dispara sincronização inicial em background dos agendamentos futuros
    setTimeout(() => {
      this.syncNow(stateRow.tenant_id, stateRow.user_id, professionalId).catch(err => {
        console.warn('[GoogleCalendarService] Sincronização pós-conexão finalizada com avisos:', err?.message || err);
      });
    }, 100);

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

    return row || null;
  }

  /**
   * Retorna o status da integração para o usuário/profissional atual.
   */
  static getStatus(tenantId: string, userId: string, professionalId?: string | null) {
    const configured = this.isConfigured();
    if (!configured) {
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
      configured: true,
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
      lastSyncAt: conn.last_sync_at
    };
  }

  /**
   * Lista as agendas disponíveis da conta Google conectada.
   */
  static async listCalendars(tenantId: string, userId: string) {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) {
      throw new Error('Nenhuma conta Google conectada para este usuário.');
    }

    const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
    if (!client) {
      throw new Error('Falha ao autenticar cliente Google. Conecte novamente.');
    }

    const calendar = google.calendar({ version: 'v3', auth: client });
    const response = await calendar.calendarList.list();
    const items = response.data.items || [];

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
  static updateSettings(
    tenantId: string,
    userId: string,
    settings: Partial<GoogleCalendarSettings>
  ): void {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) {
      throw new Error('Nenhuma conta Google conectada.');
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
  }

  /**
   * Desconecta a conta Google do usuário.
   */
  static async disconnect(tenantId: string, userId: string): Promise<void> {
    const conn = this.getConnection(tenantId, userId);
    if (!conn) return;

    // Revoga token no Google de forma resiliente
    try {
      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (client) {
        const token = decryptRefreshToken(conn.encrypted_refresh_token);
        if (token) {
          await client.revokeToken(token).catch(() => {});
        }
      }
    } catch (_) {}

    // Limpa registros de vínculos e conexão
    try {
      db.prepare(`DELETE FROM google_calendar_event_links WHERE connection_id = ?`).run(conn.id);
      db.prepare(`DELETE FROM google_calendar_connections WHERE id = ?`).run(conn.id);
    } catch (err) {
      console.error('[GoogleCalendarService] Erro ao remover dados de conexão:', err);
    }

    this.clearBusyCache(tenantId, conn.professional_id || undefined);

    this.recordAuditLog(
      tenantId,
      userId,
      'GOOGLE_CALENDAR_DISCONNECTED',
      'google_calendar_connections',
      conn.id,
      { email: conn.google_account_email }
    );
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
  static async syncAppointmentCreated(appointmentId: string, tenantId: string): Promise<void> {
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
      if (!conn || !conn.sync_enabled) return;

      // 3. Verifica se já existe vínculo criado (idempotência local)
      const existingLink = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (existingLink && existingLink.google_event_id) {
        return this.syncAppointmentUpdated(appointmentId, tenantId);
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
          if (found.id) {
            this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, 'synced', null, found.id);
            return;
          }
        }
      } catch (_) {}

      // 5. Monta título e descrição conforme privacy_mode
      let summary = 'Atendimento Zemda';
      if (conn.privacy_mode === 'show_patient_name' && appt.patient_name) {
        summary = `Atendimento Zemda — ${appt.patient_name}`;
      }

      const description = `Gerenciado pelo Zemda.\nAbra o Zemda para visualizar os dados do atendimento.\n\nhttps://zemda.com.br/?appointment=${appointmentId}`;

      const eventPayload: any = {
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

      // 7. Insere evento na Google Calendar API
      const insertRes = await calendar.events.insert({
        calendarId: conn.calendar_id || 'primary',
        requestBody: eventPayload,
        conferenceDataVersion: shouldCreateMeet ? 1 : 0
      });

      const googleEventId = insertRes.data.id;
      if (!googleEventId) {
        throw new Error('Google Calendar não retornou o ID do evento.');
      }

      // 8. Se Google Meet foi gerado, salva no appointment.meeting_url
      if (shouldCreateMeet) {
        const meetUrl =
          insertRes.data.hangoutLink ||
          insertRes.data.conferenceData?.entryPoints?.find(ep => ep.entryPointType === 'video')?.uri;

        if (meetUrl) {
          db.prepare(`
            UPDATE appointments
            SET meeting_url = ?, updated_at = datetime('now')
            WHERE id = ? AND tenant_id = ?
          `).run(meetUrl, appointmentId, tenantId);

          this.recordAuditLog(
            tenantId,
            conn.user_id,
            'GOOGLE_CALENDAR_MEET_CREATED',
            'appointments',
            appointmentId,
            { meetingUrl: meetUrl }
          );
        }
      }

      // 9. Registra o vínculo com status 'synced'
      this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, 'synced', null, googleEventId);

      this.recordAuditLog(
        tenantId,
        conn.user_id,
        'GOOGLE_CALENDAR_EVENT_CREATED',
        'appointments',
        appointmentId,
        { googleEventId, calendarId: conn.calendar_id }
      );
    } catch (err: any) {
      console.error(`[GoogleCalendarService] Falha ao sincronizar criação do agendamento ${appointmentId}:`, err?.message || err);

      let profId = '';
      try {
        const a = db.prepare('SELECT professional_id FROM appointments WHERE id = ?').get(appointmentId) as any;
        profId = a?.professional_id || '';
      } catch (_) {}
      const conn = profId ? this.getConnectionForProfessional(tenantId, profId) : null;

      if (conn) {
        this.recordEventLink(tenantId, appointmentId, conn.id, conn.calendar_id, 'pending', err?.message || 'Falha ao sincronizar com Google');
        this.recordAuditLog(
          tenantId,
          conn.user_id,
          'GOOGLE_CALENDAR_SYNC_ERROR',
          'appointments',
          appointmentId,
          { error: err?.message || 'Erro desconhecido' }
        );
      }
    }
  }

  /**
   * Sincroniza atualização de horário ou dados de um agendamento para o Google Calendar.
   */
  static async syncAppointmentUpdated(appointmentId: string, tenantId: string): Promise<void> {
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
        return this.syncAppointmentCancelled(appointmentId, tenantId);
      }

      const link = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!link) {
        // Se ainda não existia vínculo, tenta criar
        return this.syncAppointmentCreated(appointmentId, tenantId);
      }

      const conn = db.prepare(`
        SELECT * FROM google_calendar_connections WHERE id = ?
      `).get(link.connection_id) as GoogleCalendarConnectionRow | undefined;

      if (!conn || !conn.sync_enabled) return;

      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) return;

      const calendar = google.calendar({ version: 'v3', auth: client });
      const timeZone = 'America/Sao_Paulo';

      let summary = 'Atendimento Zemda';
      if (conn.privacy_mode === 'show_patient_name' && appt.patient_name) {
        summary = `Atendimento Zemda — ${appt.patient_name}`;
      }

      await calendar.events.patch({
        calendarId: link.calendar_id,
        eventId: link.google_event_id,
        requestBody: {
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

      db.prepare(`
        UPDATE google_calendar_event_links
        SET sync_status = 'synced', last_error = NULL, last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);

      this.recordAuditLog(
        tenantId,
        conn.user_id,
        'GOOGLE_CALENDAR_EVENT_UPDATED',
        'appointments',
        appointmentId,
        { googleEventId: link.google_event_id }
      );
    } catch (err: any) {
      console.error(`[GoogleCalendarService] Falha ao sincronizar atualização do agendamento ${appointmentId}:`, err?.message || err);
      try {
        db.prepare(`
          UPDATE google_calendar_event_links
          SET sync_status = 'pending', last_error = ?, updated_at = datetime('now')
          WHERE appointment_id = ? AND tenant_id = ?
        `).run(err?.message || 'Falha na atualização', appointmentId, tenantId);
      } catch (_) {}
    }
  }

  /**
   * Sincroniza cancelamento de agendamento, removendo o evento do Google Calendar.
   */
  static async syncAppointmentCancelled(appointmentId: string, tenantId: string): Promise<void> {
    try {
      const link = db.prepare(`
        SELECT * FROM google_calendar_event_links
        WHERE appointment_id = ? AND tenant_id = ?
      `).get(appointmentId, tenantId) as any;

      if (!link) return;

      const conn = db.prepare(`
        SELECT * FROM google_calendar_connections WHERE id = ?
      `).get(link.connection_id) as GoogleCalendarConnectionRow | undefined;

      if (conn && conn.sync_enabled) {
        const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
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
              console.warn('[GoogleCalendarService] Aviso ao deletar evento no Google:', delErr?.message);
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
      console.error(`[GoogleCalendarService] Falha ao sincronizar cancelamento do agendamento ${appointmentId}:`, err?.message || err);
    }
  }

  /**
   * Consulta os intervalos ocupados (FreeBusy) de uma agenda Google para um determinado dia.
   * Utiliza cache em memória de 3 minutos para performance sem sobrecarregar a Google API.
   * Em caso de indisponibilidade do Google, retorna array vazio sem travar a agenda do Zemda.
   */
  static async getBusyIntervals(tenantId: string, professionalId: string, dateStr: string): Promise<BusyRange[]> {
    const cacheKey = `${tenantId}:${professionalId}:${dateStr}`;
    const cached = busyCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.fetchedAt < BUSY_CACHE_TTL_MS) {
      return cached.ranges;
    }

    const conn = this.getConnectionForProfessional(tenantId, professionalId);
    if (!conn || !conn.sync_enabled || !conn.block_external_events) {
      return [];
    }

    const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
    if (!client) {
      return [];
    }

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

      const busyItems = fbRes.data.calendars?.[targetCalendarId]?.busy || [];
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

      busyCache.set(cacheKey, { fetchedAt: now, ranges });
      return ranges;
    } catch (err: any) {
      console.warn(`[GoogleCalendarService] Aviso: FreeBusy Google indisponível para profissional ${professionalId}:`, err?.message || err);
      // Fallback seguro: retorna vazio e não derruba a agenda do Zemda
      return [];
    }
  }

  /**
   * Força sincronização imediata ("Sincronizar agora").
   */
  static async syncNow(tenantId: string, userId: string, professionalId?: string | null): Promise<{ syncedCount: number; message: string }> {
    let conn = this.getConnection(tenantId, userId);
    if (!conn && professionalId) {
      conn = this.getConnectionForProfessional(tenantId, professionalId);
    }
    if (!conn) {
      throw new Error('Nenhuma conta Google conectada.');
    }

    const profId = conn.professional_id || professionalId;
    if (!profId) {
      return { syncedCount: 0, message: 'Nenhum perfil profissional vinculado para sincronização de atendimentos.' };
    }

    // Define intervalo com base em sync_interval_option
    let dateFilter = `date('now', '-1 day')`;
    if (conn.sync_interval_option === 'next_7_days') {
      dateFilter = `date('now', '+7 days')`;
    } else if (conn.sync_interval_option === 'next_30_days') {
      dateFilter = `date('now', '+30 days')`;
    }

    const appts = db.prepare(`
      SELECT id FROM appointments
      WHERE tenant_id = ? AND professional_id = ?
        AND status NOT IN ('cancelled')
        AND start_time >= date('now')
        ${conn.sync_interval_option !== 'future' ? `AND start_time <= ${dateFilter}` : ''}
      ORDER BY start_time ASC
      LIMIT 100
    `).all(tenantId, profId) as { id: string }[];

    let count = 0;
    for (const a of appts) {
      try {
        await this.syncAppointmentCreated(a.id, tenantId);
        count++;
      } catch (err) {
        console.warn(`[GoogleCalendarService] Erro ao sincronizar atendimento ${a.id}:`, err);
      }
    }

    // Invalida cache de FreeBusy
    this.clearBusyCache(tenantId, profId);

    db.prepare(`
      UPDATE google_calendar_connections
      SET last_sync_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(conn.id);

    this.recordAuditLog(
      tenantId,
      userId,
      'GOOGLE_CALENDAR_SYNC',
      'google_calendar_connections',
      conn.id,
      { syncedCount: count }
    );

    return {
      syncedCount: count,
      message: `${count} atendimento(s) sincronizado(s) com a Google Agenda.`
    };
  }

  /**
   * Processa Webhook de notificação do Google Calendar (Push Notifications).
   */
  static async handleWebhook(headers: Record<string, string | string[] | undefined>): Promise<void> {
    const channelId = (headers['x-goog-channel-id'] as string) || '';
    const resourceState = (headers['x-goog-resource-state'] as string) || '';

    if (!channelId) return;

    const conn = db.prepare(`
      SELECT * FROM google_calendar_connections WHERE watch_channel_id = ?
    `).get(channelId) as GoogleCalendarConnectionRow | undefined;

    if (!conn) return;

    // Invalida cache de ocupação deste profissional
    this.clearBusyCache(conn.tenant_id, conn.professional_id || undefined);

    if (resourceState === 'sync') {
      // Ping inicial do Google ao registrar o canal
      return;
    }

    // Se houver alterações no Google Calendar, busca os eventos para verificar divergências com agendamentos Zemda
    try {
      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) return;

      const calendar = google.calendar({ version: 'v3', auth: client });
      const eventsRes = await calendar.events.list({
        calendarId: conn.calendar_id || 'primary',
        updatedMin: conn.last_sync_at ? new Date(conn.last_sync_at).toISOString() : undefined,
        singleEvents: true,
        maxResults: 50
      });

      const items = eventsRes.data.items || [];
      for (const item of items) {
        const zemdaApptId = item.extendedProperties?.private?.zemdaAppointmentId;
        if (!zemdaApptId) continue; // Evento pessoal externo -> apenas bloqueia disponibilidade

        // Evento gerado pelo Zemda: checa se horário foi alterado externamente no Google
        const appt = db.prepare(`
          SELECT id, start_time, end_time FROM appointments WHERE id = ? AND tenant_id = ?
        `).get(zemdaApptId, conn.tenant_id) as any;

        if (!appt) continue;

        const gStart = item.start?.dateTime;
        const gEnd = item.end?.dateTime;
        if (gStart && gEnd) {
          const zStart = this.formatRFC3339(appt.start_time);
          const zEnd = this.formatRFC3339(appt.end_time);

          // Se houve alteração de horário no Google, marca divergência no link (NÃO altera silenciosamente o Zemda)
          if (gStart.slice(0, 16) !== zStart.slice(0, 16) || gEnd.slice(0, 16) !== zEnd.slice(0, 16)) {
            db.prepare(`
              UPDATE google_calendar_event_links
              SET sync_status = 'divergent',
                  last_google_updated_at = ?,
                  updated_at = datetime('now')
              WHERE appointment_id = ?
            `).run(item.updated || new Date().toISOString(), appt.id);
          }
        }
      }

      db.prepare(`
        UPDATE google_calendar_connections
        SET last_sync_at = datetime('now')
        WHERE id = ?
      `).run(conn.id);
    } catch (err) {
      console.warn('[GoogleCalendarService] Aviso no webhook do Google:', err);
    }
  }

  /**
   * Resolve divergência entre o agendamento do Zemda e o evento alterado no Google Calendar.
   */
  static async resolveDivergence(
    appointmentId: string,
    tenantId: string,
    action: 'apply_google' | 'keep_zemda'
  ): Promise<{ message: string }> {
    const link = db.prepare(`
      SELECT * FROM google_calendar_event_links
      WHERE appointment_id = ? AND tenant_id = ?
    `).get(appointmentId, tenantId) as any;

    if (!link) {
      throw new Error('Vínculo com Google Calendar não encontrado.');
    }

    const conn = db.prepare(`
      SELECT * FROM google_calendar_connections WHERE id = ?
    `).get(link.connection_id) as GoogleCalendarConnectionRow | undefined;

    if (!conn) throw new Error('Conexão Google não encontrada.');

    if (action === 'apply_google') {
      const client = this.getAuthenticatedClient(conn.encrypted_refresh_token);
      if (!client) throw new Error('Não autenticado com o Google.');

      const calendar = google.calendar({ version: 'v3', auth: client });
      const gEvent = await calendar.events.get({
        calendarId: link.calendar_id,
        eventId: link.google_event_id
      });

      const gStart = gEvent.data.start?.dateTime;
      const gEnd = gEvent.data.end?.dateTime;
      if (gStart && gEnd) {
        // Converte para formato Zemda
        const cleanStart = gStart.replace('T', ' ').slice(0, 19);
        const cleanEnd = gEnd.replace('T', ' ').slice(0, 19);

        db.prepare(`
          UPDATE appointments
          SET start_time = ?, end_time = ?, updated_at = datetime('now')
          WHERE id = ? AND tenant_id = ?
        `).run(cleanStart, cleanEnd, appointmentId, tenantId);

        db.prepare(`
          UPDATE google_calendar_event_links
          SET sync_status = 'synced', last_synced_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(link.id);

        return { message: 'Horário do Google aplicado com sucesso ao Zemda.' };
      }
    } else {
      // keep_zemda: força o horário do Zemda de volta no Google Calendar
      await this.syncAppointmentUpdated(appointmentId, tenantId);
      db.prepare(`
        UPDATE google_calendar_event_links
        SET sync_status = 'synced', last_synced_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?
      `).run(link.id);

      return { message: 'Horário do Zemda preservado e atualizado no Google Agenda.' };
    }

    return { message: 'Operação concluída.' };
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

  private static parseIsoToMinuteOfDay(isoStr: string, targetDateStr: string): number {
    try {
      const s = isoStr.trim().replace(' ', 'T');
      const datePart = s.substring(0, 10);
      if (datePart < targetDateStr) return 0;
      if (datePart > targetDateStr) return 24 * 60;

      const timePart = s.length >= 16 ? s.substring(11, 16) : s.substring(11);
      const [h, m] = timePart.split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    } catch (_) {
      return 0;
    }
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
