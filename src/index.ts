import {Elysia, t} from "elysia";
import {swagger} from "@elysiajs/swagger";
import {hybridQueue} from "elysia-hybrid-queue";
import {
    DigishareTicketCreatedEvent,
    DigishareTicketUpdatedEvent,
    HealthCheckResponse,
    WebhookResponse,
} from "./core/types";
import {
    requestLogger,
    errorHandler,
    apiKeyAuth,
    logger,
} from "./core/middleware";
import {env} from "./core/config";
import {
    ticketCreatedQueue,
    ticketUpdatedQueue,
    shutdownWebhookQueues,
} from "./services/webhookQueue.js";


new Elysia()
    .use(
        swagger({
            documentation: {
                info: {
                    title: "Digishare API Bridge",
                    version: "1.0.0",
                    description:
                        "API Bridge for processing Digishare webhook events with queue management",
                },
                servers: [
                    {
                        url: `http://localhost:${env.PORT}`,
                        description: "Development server",
                    },
                ],
                tags: [
                    {
                        name: "Health",
                        description: "Health check endpoints",
                    },
                    {
                        name: "Webhooks",
                        description: "Webhook endpoints for processing Digishare events",
                    },
                    {
                        name: "Queue Management",
                        description: "Queue management and monitoring endpoints",
                    },
                ],
                components: {
                    securitySchemes: {
                        "API Key": {
                            type: "apiKey",
                            in: "header",
                            name: "x-api-key",
                            description: "API key for webhook authentication",
                        },
                    },
                },
            },
        })
    )
    .use(requestLogger)
    .use(errorHandler)
    .use(
        hybridQueue({
            routePrefix: "/queue",
            databasePath: "./data/queues.db",
            auth: {
                enabled: true,
                adminKey: env.ADMIN_KEY,
            },
            cleanup: {
                enabled: true,
                intervalMinutes: 60,
                retentionCompletedHours: 168,
                retentionFailedHours: 720,
                batchSize: 100,
                dryRun: false,
            },
        })
    )
    // Health check endpoint
    .all("/health", (): HealthCheckResponse => {
            return {
                service: "Digishare API Bridge",
                status: "ok",
                uptime: process.uptime(),
                version: Bun.env.version,
                timestamp: new Date().toISOString(),
            };
        },
        {
            detail: {
                tags: ["Health"],
                summary: "Health Check",
                description:
                    "Returns the current status and health of the API Bridge service",
                responses: {
                    200: {
                        description: "Service is running",
                        content: {
                            "application/json": {
                                schema: {
                                    type: "object",
                                    properties: {
                                        service: {type: "string"},
                                        status: {type: "string"},
                                        timestamp: {type: "string"},
                                        timing: {
                                            type: "object",
                                            properties: {
                                                responseTime: {type: "number"},
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        }
    )
    .group("/webhook", (app) =>
        app
            .use(apiKeyAuth(env.API_KEY))

            // Ticket created endpoint
            .post("/ticket-created",
                async ({body}: { body: any }): Promise<WebhookResponse> => {
                    const operationStartTime = performance.now();

                    try {
                        const event = body as DigishareTicketCreatedEvent;
                        logger.info("Received ticket.created event", {
                            ticketId: event.data.id,
                        });

                        // Validate event type
                        if (event.event !== "ticket.created") {
                            logger.warn("Invalid event type", {event: event.event});
                            const totalTime = performance.now() - operationStartTime;
                            return {
                                success: false,
                                targetServer: env.TARGET_BASE_URL,
                                message: "Invalid event type",
                                timing: {
                                    totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                                },
                            };
                        }

                        // Add job to queue
                        const job = await ticketCreatedQueue.add(
                            "process-ticket-created",
                            event
                        );
                        const totalTime = performance.now() - operationStartTime;

                        logger.info("Successfully queued ticket.created event", {
                            jobId: job.id,
                            ticketId: event.data.id,
                            timing: {
                                totalTime: parseFloat(totalTime.toFixed(2)),
                            },
                        });

                        return {
                            success: true,
                            message: "Event queued for processing",
                            jobId: job.id,
                            targetServer: env.TARGET_BASE_URL,
                            timing: {
                                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                            },
                            details: {
                                ticketId: event.data.id,
                            },
                        };
                    } catch (error) {
                        const totalTime = performance.now() - operationStartTime;
                        logger.error("Error queuing ticket.created event", error);
                        return {
                            success: false,
                            targetServer: env.TARGET_BASE_URL,
                            message: error instanceof Error ? error.message : "Unknown error",
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
                    detail: {
                        tags: ["Webhooks"],
                        summary: "Process Ticket Created Event",
                        description:
                            "Receives and queues ticket.created webhook events from Digishare for asynchronous processing",
                        security: [{"API Key": []}],
                        responses: {
                            200: {
                                description: "Event successfully queued",
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                success: {type: "boolean"},
                                                message: {type: "string"},
                                                jobId: {type: "string"},
                                                ticketId: {type: "string"},
                                                targetServer: {type: "string"},
                                                timing: {
                                                    type: "object",
                                                    properties: {
                                                        totalExecutionTime: {type: "number"},
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            400: {
                                description: "Invalid event type or request",
                            },
                            401: {
                                description: "Unauthorized - Invalid API key",
                            },
                        },
                    },
                }
            )

            // Ticket updated endpoint
            .post(
                "/ticket-updated",
                async ({body}: { body: any }): Promise<WebhookResponse> => {
                    const operationStartTime = performance.now();

                    try {
                        const event = body as DigishareTicketUpdatedEvent;
                        logger.info("Received ticket.updated event", {
                            ticketId: event.data.id,
                        });

                        // Validate event type
                        if (event.event !== "ticket.updated") {
                            logger.warn("Invalid event type", {event: event.event});
                            const totalTime = performance.now() - operationStartTime;
                            return {
                                success: false,
                                targetServer: env.TARGET_BASE_URL,
                                message: "Invalid event type",
                                timing: {
                                    totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                                },
                            };
                        }

                        // Add job to queue
                        const job = await ticketUpdatedQueue.add(
                            "process-ticket-updated",
                            event
                        );
                        const totalTime = performance.now() - operationStartTime;

                        logger.info("Successfully queued ticket.updated event", {
                            jobId: job.id,
                            ticketId: event.data.id,
                            timing: {
                                totalTime: parseFloat(totalTime.toFixed(2)),
                            },
                        });

                        return {
                            success: true,
                            message: "Event queued for processing",
                            jobId: job.id,
                            targetServer: env.TARGET_BASE_URL,
                            timing: {
                                totalExecutionTime: parseFloat(totalTime.toFixed(2)),
                            },
                            details: {
                                ticketId: event.data.id,
                            },

                        };
                    } catch (error) {
                        const totalTime = performance.now() - operationStartTime;
                        logger.error("Error queuing ticket.updated event", error);
                        return {
                            success: false,
                            targetServer: env.TARGET_BASE_URL,
                            message: error instanceof Error ? error.message : "Unknown error",
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
                    detail: {
                        tags: ["Webhooks"],
                        summary: "Process Ticket Updated Event",
                        description:
                            "Receives and queues ticket.updated webhook events from Digishare for asynchronous processing",
                        security: [{"API Key": []}],
                        responses: {
                            200: {
                                description: "Event successfully queued",
                                content: {
                                    "application/json": {
                                        schema: {
                                            type: "object",
                                            properties: {
                                                success: {type: "boolean"},
                                                message: {type: "string"},
                                                jobId: {type: "string"},
                                                ticketId: {type: "string"},
                                                targetServer: {type: "string"},
                                                timing: {
                                                    type: "object",
                                                    properties: {
                                                        totalExecutionTime: {type: "number"},
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            400: {
                                description: "Invalid event type or request",
                            },
                            401: {
                                description: "Unauthorized - Invalid API key",
                            },
                        },
                    },
                }
            )
    )

    .listen(parseInt(env.PORT));

logger.info(
    `🦊 Digishare API Bridge is running at http://localhost:${env.PORT}`
);

// Graceful shutdown handling
process.on("SIGINT", async () => {
    logger.info("Received SIGINT, shutting down gracefully...");
    try {
        // Shutdown webhook queues
        await shutdownWebhookQueues();
        process.exit(0);
    } catch (error) {
        logger.error("Error during graceful shutdown", error);
        process.exit(1);
    }
});

process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM, shutting down gracefully...");
    try {
        // Shutdown webhook queues
        await shutdownWebhookQueues();
        process.exit(0);
    } catch (error) {
        logger.error("Error during graceful shutdown", error);
        process.exit(1);
    }
});
