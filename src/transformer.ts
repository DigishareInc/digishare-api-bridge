import type {DigishareTicketCreatedEvent, DigishareTicketUpdatedEvent,} from "./core/types";
import type {CreateLeadParams, UpdateLeadParams,} from "./types";
import _ from 'lodash';

function getName(third: any): string {
    if (third.name) return third.name;
    if (third.first_name && third.last_name) return `${third.first_name} ${third.last_name}`;
    if (third.first_name || third.last_name) return third.first_name || third.last_name;
    if (third.email) return third.email.split('@')[0];
    return 'Unknown Lead';
}

function getPhone(third: any): string {
    return third.wa_id ?? third.mobile ?? third.phone ?? 'NA';
}


function getDate(ticketData: any, useUpdated = false): string {
    return ticketData.demand_date || (useUpdated ? ticketData.updated_at : ticketData.created_at) || new Date().toISOString();
}


function buildParams(ticketData: any, apiKey: string, isUpdate = false): any {
    const info = ticketData.information || {};
    const third = info.third || {};
    const unusedInfo = collectUnusedInfoAsYaml(info);
    let comment = ticketData.comment || `Lead ${isUpdate ? 'updated' : 'created'} via Digishare`;
    if (unusedInfo) comment += ` | ${unusedInfo}`;
    return {
        key: apiKey,
        Source: `Formulaire Facebook-ig`,
        Utm_source: 'Formulaire Facebook-ig',
        Name: getName(third),
        Phone: getPhone(third),
        IdProjet: info.id_projet,
        IdLead: ticketData.id,
        DateLead: getDate(ticketData, isUpdate),

        Email: third.email || '',
        Comment: comment,
        langue: info.langue || ticketData.lang || third.lang || 'fr',
        Utm_Compagne: info.utm_campaign || '',
        Utm_content: info.utm_content || '',
        Utm_medium: info.utm_medium || '',
        Utm_term: info.utm_term || '',
        Compagne_id: info.campaign_id || '',
        Ville: info.ville || '',
        Nature: info.nature || '',
        typologie: info.typologie || '',
        budget: info.budget || '',
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

export function buildQueryString(params: Record<string, any>): string {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
            searchParams.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        }
    });
    return searchParams.toString();
}


function collectUnusedInfoAsYaml(info: any): string {
    const source = _.get(info, 'source', {});
    const sourceData = _.pickBy(source, _.identity);
    const additionalData = _.pickBy({
        responses: info.responses,
        lead: info.third
    }, _.identity);
    const data = _.merge(sourceData, additionalData);

    const yamlLines = _.map(data, (value, key) => {
        if (_.isObject(value)) {
            return `${key}:\n  ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
    });

    return yamlLines.join('\n');
}