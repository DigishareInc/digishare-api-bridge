import type {
  DigishareTicketCreatedEvent,
  DigishareTicketUpdatedEvent,
} from "./core/types";
import type {
  CreateLeadParams,
  UpdateLeadParams,
} from "./types";


export function transformToCreateLead(
  event: DigishareTicketCreatedEvent,
  apiKey: string
): CreateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  const third = info.third || {};

  const unusedInfo = collectUnusedInfoAsText(info);
  const fullComment = unusedInfo ? `${ticketData.comment} | ${unusedInfo}` : ticketData.comment;

  return {
    key: apiKey,
    Name: third.name ||
          (third.first_name && third.last_name ? `${third.first_name} ${third.last_name}` :
           third.first_name || third.last_name || "Unknown"),
    Phone: third.wa_id || third.mobile || third.phone ,
    IdProjet: info.id_projet ,
    IdLead: ticketData.id,
    Email: third.email ,
    Source: ticketData.channel_id,
    Comment: fullComment,
    Utm_Compagne: info.utm_campaign ,
    Utm_content: info.utm_content ,
    Utm_medium: info.utm_medium ,
    Utm_term: info.utm_term ,
    Compagne_id: info.campaign_id ,
    Ville: info.ville ,
    Nature: info.nature ,
    Utm_source: info.utm_source,
    DateLead: ticketData.demand_date || ticketData.created_at,
    typologie: info.typologie ,
    budget: info.budget ,
    langue: info.langue ?? ticketData.lang ?? third.lang,
    localisation: info.localisation ,
    deuxieme_tel: (third.phone && third.phone !== third.wa_id && third.phone !== third.mobile) ? third.phone : "",
    surface: info.surface ,
  };
}

export function transformToUpdateLead(
  event: DigishareTicketUpdatedEvent,
  apiKey: string
): UpdateLeadParams {
  const { data: ticketData } = event.data;
  const info = ticketData.information || {};
  //information example : {"third": {"lang": "en", "name": "Salaheddine Saayoun", "email": "salaheddinesaayoun@gmail.com", "phone": "212677652616", "wa_id": "212677652616", "leadId": "1480161436664974"}, "source": {"ad_id": "120223503091690256", "form_id": "1256806779447401", "page_id": "442329052306163", "platform": "facebook", "adgroup_id": "120223503091690256", "collected_at": "2025-08-15T09:07:39+0000"}, "__schema": [], "id_projet": "39D13363-3DDD-4418-8CDE-90CD45DD18C2"}
  const third = info.third || {};

  const unusedInfo = collectUnusedInfoAsText(info);
  const fullComment = unusedInfo ? `${ticketData.comment} | ${unusedInfo}` : ticketData.comment;

  return {
    key: apiKey,
    Name: third.name ||
          (third.first_name && third.last_name ? `${third.first_name} ${third.last_name}` :
           third.first_name || third.last_name || "Unknown"),
    Phone: third.wa_id || third.mobile || third.phone ,
    IdProjet: info.id_projet ,
    IdLead: ticketData.id,
    Email: third.email ,
    Source: ticketData.channel_id,
    Comment: fullComment,
    Utm_Compagne: info.utm_campaign ,
    Utm_content: info.utm_content ,
    Utm_medium: info.utm_medium ,
    Utm_term: info.utm_term ,
    Compagne_id: info.campaign_id ,
    Ville: info.ville ,
    Nature: info.nature ,
    Utm_source: info.utm_source,
    DateLead: ticketData.demand_date ?? ticketData.updated_at,
    typologie: info.typologie ,
    budget: info.budget ,
    langue: info.langue ?? ticketData.lang ?? third.lang ?? "",
    localisation: info.localisation ,
    deuxieme_tel: (third.phone && third.phone !== third.wa_id && third.phone !== third.mobile) ? third.phone : "",
    surface: info.surface ,
  };
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

/**
 * Collect unused information keys as text for Comment field
 */
function collectUnusedInfoAsText(info: any): string {
    const source = info.source || {};
    const unusedData: string[] = [];

    // Collect unused source data
    if (source.ad_id) unusedData.push(`ad_id:${source.ad_id}`);
    if (source.form_id) unusedData.push(`form_id:${source.form_id}`);
    if (source.page_id) unusedData.push(`page_id:${source.page_id}`);
    if (source.platform) unusedData.push(`platform:${source.platform}`);
    if (source.adgroup_id) unusedData.push(`adgroup_id:${source.adgroup_id}`);
    if (source.collected_at) unusedData.push(`collected_at:${source.collected_at}`);
    if (info.__schema && Array.isArray(info.__schema) && info.__schema.length > 0) {
        unusedData.push(`schema:${JSON.stringify(info.__schema)}`);
    }

    return unusedData.length > 0 ? unusedData.join(' | ') : '';
}
