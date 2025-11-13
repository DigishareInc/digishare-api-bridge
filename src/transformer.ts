import {DigishareTicketCreatedEvent, DigishareTicketData, DigishareTicketUpdatedEvent,} from "./core/types";
import type {CreateLeadParams, UpdateLeadParams,} from "./types";
import {objectToSimpleYaml} from "./core/utils";

function getName(third: any,info:any): string {
    if (third.name) return third.name;
    if (third.first_name && third.last_name) return `${third.first_name} ${third.last_name}`;
    if (third.first_name || third.last_name) return third.first_name || third.last_name;
    if (info.responses?.nom_complet) return info.responses.nom_complet;
    if (third.email) return third.email.split('@')[0];
    return 'Unknown Lead';
}

function getPhone(third: any,info:any): string {
    return third.wa_id || third.mobile || third.phone || info.responses?.t_l_phone || 'NA';
}


function getDate(digishareTicket: DigishareTicketData, useUpdated = false): string {
    return digishareTicket.demand_date || (useUpdated ? digishareTicket.updated_at : digishareTicket.created_at) || new Date().toISOString();
}


function getEmail(third: any, info: any): string {
    return third.email || info.responses?.e_mail || '';
}

function getBudget(info: any): string {
    return info.responses?.budget || info.budget || '';
}

function getTypologie(info: any): string {
    const typologie = info.typologie || info.responses?.type_de_bien || info.responses?.nombre_de_chambres || '';

    const typologieMap: Record<string, string> = {
        'studio': 'studio',
        'appartement_2_chambres': '2_chambres',
        'appartement_3_chambres': '3_chambres',
        '2_chambres': '2_chambres',
        '3_chambres': '3_chambres',
        'f3': '3_chambres'
    };

    return typologieMap[typologie] || typologie;
}

function getSource(info: any): string {
    const utmSource = info.utm_source;
    const platform = info.source?.platform;

    if (platform === 'facebook') return 'Formulaire Facebook';
    if (utmSource === 'ig') return 'Formulaire Instagram';
    if (utmSource === 'hespress') return 'Formulaire Hespress';
    if (utmSource === 'direct') return 'Direct';

    return utmSource || platform ||  info.utm_source || null;
}

function buildParams(digishareTicket: DigishareTicketData, apiKey: string, isUpdate = false): any {
    const info = digishareTicket.information || {};
    const third = info.third || {};
    const unusedInfo = collectUnusedInfoAsYaml(info);
    let comment = digishareTicket.comment || `Lead ${isUpdate ? 'updated' : 'created'} via Digishare`;
    // add conversation link to comment if available
    if (digishareTicket.conversation_id) {
        comment += ` | Conversation: https://app.digishare.ma/chats/${digishareTicket.conversation_id}`;
    }
    if (unusedInfo) comment += ` | ${unusedInfo}`;
    return {
        key: apiKey,
        Source: getSource(info),
        Utm_source: getSource(info),
        Name: getName(third, info),
        Phone: getPhone(third, info),
        IdProjet: info.id_projet || '',
        IdLead: info.third?.leadId || info.id_lead || digishareTicket.id || '',
        DateLead: getDate(digishareTicket, isUpdate),
        Priorite: cast( digishareTicket.priority_id,'priority'),

        Email: getEmail(third, info),
        Comment: comment,
        langue: info.langue || digishareTicket.lang || third.lang || 'fr',
        Utm_Compagne: info.utm_campaign || '',
        Utm_content: info.utm_content || '',
        Utm_medium: info.utm_medium || '',
        Utm_term: info.utm_term || '',
        Compagne_id: info.campaign_id || '',
        Ville: info.ville || '',
        Nature: info.nature || '',
        typologie: getTypologie(info),
        // budget: getBudget(info),
        localisation: info.localisation || '',
        // deuxieme_tel: '',
        surface: info.surface || '',
    };
}

export function transformToCreateLead(event: DigishareTicketCreatedEvent, apiKey: string): CreateLeadParams {
    if (!apiKey || !event.data?.data) throw new Error('Missing required data');
    return buildParams(event.data.data, apiKey, false);
}

export function transformToUpdateLead(event: DigishareTicketUpdatedEvent, apiKey: string): UpdateLeadParams {
    if (!apiKey || !event.data?.data) throw new Error('Missing required data');
    return buildParams(event.data.data, apiKey, true);
}
export function transformToActionRappel(event:DigishareTicketUpdatedEvent, apiKey:string) {
    if (!apiKey || !event.data?.data) throw new Error('Missing required data');
    const digishareTicket = event.data.data;
    const info = digishareTicket.information || {};
    return {
        key: Bun.env.TARGET_API_KEY2,
        IdBesoin: info.IdBesoin ?? info.id_lead  ?? info.lead_id ,
        DatePlanification: cast(info.selected_time_slot,'slot_to_date'),
        observation: cast(info.selected_time_slot,'slot_to_fr_string'),
        Priorite: cast( digishareTicket.priority_id,'priority'),
    }
}

export function cast(value: any, type: string): any {
    switch (type) {
        case 'slot_to_date': {
            const [fromHour, toHour] = value.split('_').map(Number);
            const now = new Date();
            const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
            const slotEndMinusBuffer = toHour * 60 - 25;

            const resultDate = new Date();
            resultDate.setHours(fromHour === 9 ? 9 : fromHour, fromHour === 9 ? 30 : 0, 0, 0);

            if (currentTimeInMinutes >= slotEndMinusBuffer) {
                resultDate.setDate(resultDate.getDate() + 1);
            }

            let iso = resultDate.toISOString();
            iso = iso.replace('.000Z', '.000000Z');
            return iso;
        }

        case 'slot_to_fr_string': {
            const [fromHour, toHour] = value.split('_').map(Number);
            const fromStr = fromHour === 9 ? '09h30' : `${fromHour}h`;
            const toStr = `${toHour}h`;
            return `${fromStr} à ${toStr}`;
        }

        case 'priority': {
            const PRIORITY_MAP: Record<number, number> = {
                1: 1, // Low -> Faible
                2: 2, // Normal -> Normal
                3: 2, // Moderate -> Normal
                4: 3, // High -> High
                5: 3, // Urgent -> High
            };

            const NAME_TO_PRIORITY: Record<string, number> = {
                Low: 1,
                Normal: 2,
                Moderate: 2,
                High: 3,
                Urgent: 3,
            };

            if (typeof value === 'object' && value?.id) {
                return PRIORITY_MAP[value.id] ?? -1;
            }

            if (typeof value === 'number') {
                return PRIORITY_MAP[value] ?? -1;
            }

            if (typeof value === 'string') {
                return NAME_TO_PRIORITY[value] ?? -1;
            }

            return -1; // NonSpecifie as default
        }

        default:
            return value;
    }
}

export function buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
    });
    return searchParams.toString();
}

function collectUnusedInfoAsYaml(info:any) {
    // Helper to filter out empty/null values, replacing _.pickBy
    const filterEmptyValues = (obj:any) => {
        const newObj:Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== null && value !== undefined && value !== '') {
                newObj[key] = value;
            }
        }
        return newObj;
    };

    // Safely get source data, replacing _.get
    const sourceData = filterEmptyValues(info?.source ?? {});

    // Gather additional data
    const additionalData = filterEmptyValues({
        responses: info?.responses,
        lead: info?.third,
        // Assuming getTypologie and getBudget are available
        typologie: getTypologie(info),
        budget: getBudget(info),
    });

    // Combine data using spread syntax, replacing _.merge
    const dataToInclude = { ...sourceData, ...additionalData };

    if (Object.keys(dataToInclude).length === 0) {
        return '';
    }

    // Convert the final object to a YAML string using our manual function
    const yamlString = objectToSimpleYaml(dataToInclude);

    // Wrap in HTML tags for display
    return `<pre><code>${yamlString}</code></pre>`;
}