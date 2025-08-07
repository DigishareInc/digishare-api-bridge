import type { DigishareTicketCreatedEvent, DigishareTicketUpdatedEvent, CreateLeadParams, UpdateLeadParams, UpdateConversationParams } from './types.js';

/**
 * Transform Digishare ticket created event to CreateNewLead parameters
 */
export function transformToCreateLead(event: DigishareTicketCreatedEvent, apiKey: string): CreateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  const third = info.third || {};

  return {
    key: apiKey,
    Name: third.name || `${third.first_name || ''} ${third.last_name || ''}`.trim() || 'Unknown',
    Phone: third.mobile || third.phone || third.wa_id || '',
    IdProjet: info.id_projet || '',
    IdLead: info.id_lead || ticketData.id,
    Email: third.email || '',
    Source: getSource(ticketData.channel_id),
    Comment: ticketData.comment || '',
    Utm_Compagne: info.utm_campaign || '',
    Utm_content: info.utm_content || '',
    Utm_medium: info.utm_medium || '',
    Utm_term: info.utm_term || '',
    Compagne_id: info.campaign_id || '',
    Ville: info.ville || '',
    Nature: info.nature || '',
    Utm_source: info.utm_source || getSource(ticketData.channel_id),
    DateLead: ticketData.demand_date || ticketData.created_at,
    typologie: info.typologie || '',
    budget: info.budget || '',
    langue: info.langue || ticketData.lang,
    localisation: info.localisation || '',
    deuxieme_tel: third.phone !== third.mobile ? third.phone : '',
    surface: info.surface || ''
  };
}

/**
 * Transform Digishare ticket updated event to UpdateLeadAndBesoins parameters
 */
export function transformToUpdateLead(event: DigishareTicketUpdatedEvent, apiKey: string): UpdateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  const third = info.third || {};

  return {
    key: apiKey,
    Name: third.name || `${third.first_name || ''} ${third.last_name || ''}`.trim() || 'Unknown',
    Phone: third.mobile || third.phone || third.wa_id || '',
    IdProjet: info.id_projet || '',
    IdLead: info.id_lead || ticketData.id,
    Email: third.email || '',
    Source: getSource(ticketData.channel_id),
    Comment: ticketData.comment || '',
    Utm_Compagne: info.utm_campaign || '',
    Utm_content: info.utm_content || '',
    Utm_medium: info.utm_medium || '',
    Utm_term: info.utm_term || '',
    Compagne_id: info.campaign_id || '',
    Ville: info.ville || '',
    Nature: info.nature || '',
    Utm_source: info.utm_source || getSource(ticketData.channel_id),
    DateLead: ticketData.demand_date || ticketData.updated_at,
    typologie: info.typologie || '',
    budget: info.budget || '',
    langue: info.langue || ticketData.lang,
    localisation: info.localisation || '',
    deuxieme_tel: third.phone !== third.mobile ? third.phone : '',
    surface: info.surface || ''
  };
}

/**
 * Transform Digishare ticket updated event to UpdateConversationBesoin parameters
 */
export function transformToUpdateConversation(event: DigishareTicketUpdatedEvent, apiKey: string): UpdateConversationParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};

  return {
    key: apiKey,
    IdLead: info.id_lead || ticketData.id,
    observation: ticketData.comment || ticketData.note || 'Updated'
  };
}

/**
 * Map channel ID to source name
 */
function getSource(channelId: string): string {
  const sourceMap: Record<string, string> = {
    'web': 'Formulaire Web',
    'whatsapp': 'WhatsApp',
    'facebook': 'Formulaire Facebook-ig',
    'instagram': 'Formulaire Facebook-ig',
    'email': 'Email',
    'phone': 'Téléphone'
  };
  
  return sourceMap[channelId] || channelId || 'Unknown';
}

/**
 * Build query string from parameters
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.append(key, String(value));
    }
  });
  
  return searchParams.toString();
}