import type {
  DigishareTicketCreatedEvent,
  DigishareTicketUpdatedEvent,
} from "./core/types";
import type {
  CreateLeadParams,
  UpdateLeadParams,
  UpdateConversationParams,
} from "./types";
/**
 * Transform Digishare ticket created event to CreateNewLead parameters
 */
export function transformToCreateLead(
  event: DigishareTicketCreatedEvent,
  apiKey: string
): CreateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  const third = info.third || {};

  return {
    key: apiKey,
    Name: third.name || 
          (third.first_name && third.last_name ? `${third.first_name} ${third.last_name}` : 
           third.first_name || third.last_name || "Unknown"),
    Phone: third.wa_id || third.mobile || third.phone || "",
    IdProjet: info.id_projet || "",
    IdLead: ticketData.id,
    Email: third.email || "",
    Source: getSource(ticketData.channel_id),
    Comment: ticketData.comment || "null",
    Utm_Compagne: info.utm_campaign || "",
    Utm_content: info.utm_content || "",
    Utm_medium: info.utm_medium || "",
    Utm_term: info.utm_term || "",
    Compagne_id: info.campaign_id || "",
    Ville: info.ville || "",
    Nature: info.nature || "",
    Utm_source: info.utm_source || getSource(ticketData.channel_id),
    DateLead: ticketData.demand_date || ticketData.created_at,
    typologie: info.typologie || "",
    budget: info.budget || "",
    langue: info.langue || ticketData.lang,
    localisation: info.localisation || "",
    deuxieme_tel: (third.phone && third.phone !== third.wa_id && third.phone !== third.mobile) ? third.phone : "",
    surface: info.surface || "",
  };
}

/**
 * Transform Digishare ticket updated event to UpdateLeadAndBesoins parameters
 */
export function transformToUpdateLead(
  event: DigishareTicketUpdatedEvent,
  apiKey: string
): UpdateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  const third = info.third || {};

  return {
    key: apiKey,
    Name: third.name || 
          (third.first_name && third.last_name ? `${third.first_name} ${third.last_name}` : 
           third.first_name || third.last_name || "Unknown"),
    Phone: third.wa_id || third.mobile || third.phone || "",
    IdProjet: info.id_projet || "",
    IdLead: info.id_lead || ticketData.id,
    Email: third.email || "",
    Source: getSource(ticketData.channel_id),
    Comment: ticketData.comment || "null",
    Utm_Compagne: info.utm_campaign || "",
    Utm_content: info.utm_content || "",
    Utm_medium: info.utm_medium || "",
    Utm_term: info.utm_term || "",
    Compagne_id: info.campaign_id || "",
    Ville: info.ville || "",
    Nature: info.nature || "",
    Utm_source: info.utm_source || getSource(ticketData.channel_id),
    DateLead: ticketData.demand_date || ticketData.updated_at,
    typologie: info.typologie || "",
    budget: info.budget || "",
    langue: info.langue || ticketData.lang,
    localisation: info.localisation || "",
    deuxieme_tel: (third.phone && third.phone !== third.wa_id && third.phone !== third.mobile) ? third.phone : "",
    surface: info.surface || "",
  };
}

/**
 * Transform Digishare ticket updated event to UpdateConversationBesoin parameters
 */
export function transformToUpdateConversation(
  event: DigishareTicketUpdatedEvent,
  apiKey: string
): UpdateConversationParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};

  return {
    key: apiKey,
    IdLead: info.id_lead || ticketData.id,
    observation: ticketData.comment || ticketData.note || "Updated",
  };
}

/**
 * Map channel ID to source name
 */
function getSource(channelId: string): string {
  const sourceMap: Record<string, string> = {
    web: "Formulaire Web",
    whatsapp: "WhatsApp",
    facebook: "Formulaire Facebook-ig",
    instagram: "Formulaire Facebook-ig",
    email: "Email",
    phone: "Téléphone",
  };

  return sourceMap[channelId] || channelId || "Unknown";
}

/**
 * Build query string from parameters
 */
export function buildQueryString(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.append(key, String(value));
    }
  });

  return searchParams.toString();
}




//curl --location --request POST 'http://192.168.50.70/CRM_PREPROD/Api/Leads/CreateNewLead?key=wBebkkSNFMrPup49sPhUGfcbF4Js5mYdR5JB2ApEapYeqwtTbeuh3F73hYwgXTArkfZg2P5xqmDhS8hdBqR9VYY9ZEdjG6qDjDBea7FFPdx8UnSTEbnP39rAk&Name=Test%20easy&Phone=%E2%80%AA+212677889909%E2%80%AC&IdProjet=721eccad-b6df-4211-a53d-b07467de5d3e&IdLead=Aiman_sqdsqd&Email=&Source=Formulaire%20Facebook-ig&Comment=null&Utm_Compagne=Maya%20MRE%20V1%20%7C%20Lead%20Gen%20%7C%20BDC%20N%C2%B0MKT20240326_03&Utm_content=null&Utm_medium=null&Utm_term=null&Compagne_id=120205962732830146&Ville=Gallipoli&Nature=COM&Utm_source=Formulaire%20Facebook-ig&DateLead=2024-05-03T11%3A46%3A35+0000&Nature=A&typologie=F1&budget=8000&langue=Darijaaa&localisation=Casa%20Centers&deuxieme_tel=0677777787&surface=60'