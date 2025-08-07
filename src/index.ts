import { Elysia, t } from 'elysia';
import { transformToCreateLead, transformToUpdateLead, transformToUpdateConversation, buildQueryString } from './transformer';
import { DigishareTicketCreatedEvent, DigishareTicketUpdatedEvent } from './types';
import { requestLogger, errorHandler, apiKeyAuth, logger } from './middleware';
import { makeHttpRequest } from './utils';
import { env } from './config';

const endpoints ={
    createTicket: `${env.TARGET_BASE_URL}/Api/Leads/CreateNewLead`,
    updateTicket: `${env.TARGET_BASE_URL}/Api/Leads/UpdateLead`,
    updateConversation: `${env.TARGET_BASE_URL}/Api/Conversations/UpdateConversation`,
    // createConversation: `${env.TARGET_BASE_URL}/Api/Conversations/CreateConversation`,
}

// const endpoints = {
//     createTicket: `${env.TARGET_BASE_URL}/setdata.php`,
//     updateTicket: `${env.TARGET_BASE_URL}/setdata.php`,
//     updateConversation: null,
// }


const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  // Health check endpoint
  .get('/', () => {
    return {
      service: 'Digishare API Bridge',
      status: 'running',
      timestamp: new Date().toISOString()
    };
  })
  .group('/webhook', (app) => 
    app
      .use(apiKeyAuth(env.API_KEY))
      
      // Ticket created endpoint
      .post('/ticket-created', async ({ body }) => {
        try {
          const event = body as DigishareTicketCreatedEvent;
          logger.info('Received ticket.created event', { ticketId: event.data.id });

          // Validate event type
          if (event.event !== 'ticket.created') {
            logger.warn('Invalid event type', { event: event.event });
            return {
              success: false,
              error: 'Invalid event type'
            };
          }

          // Transform data
          const leadParams = transformToCreateLead(event, env.TARGET_API_KEY);
          const queryString = buildQueryString(leadParams);

          // Forward to external API
          const result = await makeHttpRequest(`${endpoints.createTicket}?${queryString}`, {
            method: 'POST',
          });
          
          if (result.success) {
            logger.info('Successfully forwarded ticket.created event');
            return {
              success: true,
              message: 'Event processed successfully',
              ticketId: event.data.id
            };
          } else {
            logger.error('Failed to forward ticket.created event', result.error);
            return {
              success: false,
              error: result.error
            };
          }
        } catch (error) {
          logger.error('Error processing ticket.created event', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }, {
        body: t.Object({
          event: t.String(),
          data: t.Object({
            id: t.String(),
            data: t.Any(),
            wasRecentlyCreated: t.Boolean()
          })
        })
      })
      
      // Ticket updated endpoint
      .post('/ticket-updated', async ({ body }) => {
        try {
          const event = body as DigishareTicketUpdatedEvent;
          logger.info('Received ticket.updated event', { ticketId: event.data.id });

          // Validate event type
          if (event.event !== 'ticket.updated') {
            logger.warn('Invalid event type', { event: event.event });
            return {
              success: false,
              error: 'Invalid event type'
            };
          }

          // Transform data for lead update
          const leadParams = transformToUpdateLead(event, env.TARGET_API_KEY);
          const leadQueryString = buildQueryString(leadParams);
          const leadUpdateUrl = `${endpoints.updateTicket}?${leadQueryString}`;

          // Forward to both external APIs
           const leadResult = await makeHttpRequest(leadUpdateUrl,{
            method: 'POST',
          })
          logger.info('leadResult', leadResult);
          const results = {
            leadUpdate: leadResult,
          };

          logger.info('Ticket update results', results);

          return {
            success: true,
            message: 'Event processed',
            ticketId: event.data.id,
            results
          };
        } catch (error) {
          logger.error('Error processing ticket.updated event', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      }, {
        body: t.Object({
          event: t.String(),
          data: t.Object({
            id: t.String(),
            data: t.Any(),
            wasRecentlyCreated: t.Boolean(),
            changes: t.Optional(t.Any())
          })
        })
      })
  )
  .listen(parseInt(env.PORT));

logger.info(`🦊 Digishare API Bridge is running at http://localhost:${env.PORT}`);