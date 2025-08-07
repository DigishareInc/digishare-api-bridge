import { Elysia, t } from "elysia";
import {
  transformToCreateLead,
  transformToUpdateLead,
  transformToUpdateConversation,
  buildQueryString,
} from "./transformer";
import {
  DigishareTicketCreatedEvent,
  DigishareTicketUpdatedEvent,
} from "./core/types";
import { requestLogger, errorHandler, apiKeyAuth, logger } from "./core/middleware";
import { makeHttpRequest } from "./core/utils";
import { env } from "./core/config";

const endpoints = {
  createTicket: `${env.TARGET_BASE_URL}/Api/Leads/CreateNewLead`,
  updateTicket: `${env.TARGET_BASE_URL}/Api/Leads/UpdateLead`,
  updateConversation: `${env.TARGET_BASE_URL}/Api/Conversations/UpdateConversation`,
  // createConversation: `${env.TARGET_BASE_URL}/Api/Conversations/CreateConversation`,
};

// const endpoints = {
//     createTicket: `${env.TARGET_BASE_URL}/setdata.php`,
//     updateTicket: `${env.TARGET_BASE_URL}/setdata.php`,
//     updateConversation: null,
// }

const app = new Elysia()
  .use(requestLogger)
  .use(errorHandler)
  // Health check endpoint
  .get("/", () => {
    const startTime = performance.now();
    const response = {
      service: "Digishare API Bridge",
      status: "running",
      timestamp: new Date().toISOString(),
      timing: {
        responseTime: parseFloat((performance.now() - startTime).toFixed(2)),
      },
    };
    return response;
  })
  .group("/webhook", (app) =>
    app
      .use(apiKeyAuth(env.API_KEY))

      // Ticket created endpoint
      .post(
        "/ticket-created",
        async ({ body }) => {
          const operationStartTime = performance.now();

          try {
            const event = body as DigishareTicketCreatedEvent;
            logger.info("Received ticket.created event", {
              ticketId: event.data.id,
            });

            // Validate event type
            if (event.event !== "ticket.created") {
              logger.warn("Invalid event type", { event: event.event });
              const totalTime = performance.now() - operationStartTime;
              return {
                success: false,
                targetServer: env.TARGET_BASE_URL,
                error: "Invalid event type",
                timing: {
                  totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                },
              };
            }

            // Transform data
            const transformStartTime = performance.now();
            const leadParams = transformToCreateLead(event, env.TARGET_API_KEY);
            const queryString = buildQueryString(leadParams);
            const transformTime = performance.now() - transformStartTime;

            // Forward to external API
            const result = await makeHttpRequest(
              `${endpoints.createTicket}?${queryString}`,
              {
                method: "POST",
              }
            );

            const totalTime = performance.now() - operationStartTime;

            if (result.success) {
              logger.info("Successfully forwarded ticket.created event", {
                timing: {
                  transformTime: parseFloat(transformTime.toFixed(2)),
                  httpRequestTime: result.executionTime,
                  totalTime: parseFloat(totalTime.toFixed(2)),
                },
              });
              return {
                success: true,
                message: "Event processed successfully",
                ticketId: event.data.id,
                targetServer: env.TARGET_BASE_URL,
                timing: {
                  dataTransformationTime: parseFloat(transformTime.toFixed(2)),
                  externalApiCallTime: result.executionTime,
                  totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                },
              };
            } else {
              logger.error(
                "Failed to forward ticket.created event",
                result.error
              );
              return {
                success: false,
                targetServer: env.TARGET_BASE_URL,
                error: result.error,
                timing: {
                  dataTransformationTime: parseFloat(transformTime.toFixed(2)),
                  externalApiCallTime: result.executionTime,
                  totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                },
              };
            }
          } catch (error) {
            const totalTime = performance.now() - operationStartTime;
            logger.error("Error processing ticket.created event", error);
            return {
              success: false,
              targetServer: env.TARGET_BASE_URL,
              error: error instanceof Error ? error.message : "Unknown error",
              timing: {
                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
              },
            };
          }
        },
        {
          body: t.Object({
            event: t.String(),
            data: t.Object({
              id: t.String(),
              data: t.Any(),
              wasRecentlyCreated: t.Boolean(),
            }),
          }),
        }
      )

      // Ticket updated endpoint
      .post(
        "/ticket-updated",
        async ({ body }) => {
          const operationStartTime = performance.now();

          try {
            const event = body as DigishareTicketUpdatedEvent;
            logger.info("Received ticket.updated event", {
              ticketId: event.data.id,
            });

            // Validate event type
            if (event.event !== "ticket.updated") {
              logger.warn("Invalid event type", { event: event.event });
              const totalTime = performance.now() - operationStartTime;
              return {
                success: false,
                targetServer: env.TARGET_BASE_URL,
                error: "Invalid event type",
                timing: {
                  totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                },
              };
            }

            // Transform data for lead update
            const transformStartTime = performance.now();
            const leadParams = transformToUpdateLead(event, env.TARGET_API_KEY);
            const leadQueryString = buildQueryString(leadParams);
            const leadUpdateUrl = `${endpoints.updateTicket}?${leadQueryString}`;
            const transformTime = performance.now() - transformStartTime;

            // Forward to external API
            const leadResult = await makeHttpRequest(leadUpdateUrl, {
              method: "POST",
            });

            const totalTime = performance.now() - operationStartTime;

            logger.info("leadResult", {
              ...leadResult,
              timing: {
                transformTime: parseFloat(transformTime.toFixed(2)),
                httpRequestTime: leadResult.executionTime,
                totalTime: parseFloat(totalTime.toFixed(2)),
              },
            });

            const results = {
              leadUpdate: leadResult,
            };

            logger.info("Ticket update results", {
              ...results,
              timing: {
                dataTransformationTime: parseFloat(transformTime.toFixed(2)),
                externalApiCallTime: leadResult.executionTime,
                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
              },
            });

            return {
              success: true,
              targetServer: env.TARGET_BASE_URL,
              message: "Event processed",
              ticketId: event.data.id,
              results,
              timing: {
                dataTransformationTime: parseFloat(transformTime.toFixed(2)),
                externalApiCallTime: leadResult.executionTime,
                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
              },
            };
          } catch (error) {
            const totalTime = performance.now() - operationStartTime;
            logger.error("Error processing ticket.updated event", error);
            return {
              success: false,
              targetServer: env.TARGET_BASE_URL,
              error: error instanceof Error ? error.message : "Unknown error",
              timing: {
                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
              },
            };
          }
        },
        {
          body: t.Object({
            event: t.String(),
            data: t.Object({
              id: t.String(),
              data: t.Any(),
              wasRecentlyCreated: t.Boolean(),
              changes: t.Optional(t.Any()),
            }),
          }),
        }
      )
  )
  .listen(parseInt(env.PORT));

logger.info(
  `🦊 Digishare API Bridge is running at http://localhost:${env.PORT}`
);
