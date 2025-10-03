import { Queue, Worker, type JobHandler } from "elysia-hybrid-queue";
import {
    transformToCreateLead,
    transformToUpdateLead,
    buildQueryString,
    transformToActionRappel,
} from "../transformer";
import {
  DigishareTicketCreatedEvent,
  DigishareTicketUpdatedEvent,
} from "../core/types";
import { makeHttpRequest } from "../core/utils";
import { env } from "../core/config";
import { logger } from "../core/middleware";
import {UpdateLeadParams} from "../types";

const endpoints = {
  createTicket: `${env.TARGET_BASE_URL}/Api/Leads/CreateNewLead`,
  updateTicket: `${env.TARGET_BASE_URL}/Api/Leads/UpdateLead`,
  updateConversation: `${env.TARGET_BASE_URL}/Api/Conversations/UpdateConversation`,
  createActionRappel: `${env.TARGET_BASE_URL}/Api/CreateActionRappel/ActionRappel`,
};

// Queue instances
export const ticketCreatedQueue = new Queue("ticket-created");
export const ticketUpdatedQueue = new Queue("ticket-updated");

// Job handlers
const handleTicketCreated: JobHandler<DigishareTicketCreatedEvent> = async (job) => {
  const operationStartTime = performance.now();
  
  try {
    const event = job.data;
    logger.info("Processing ticket.created job", {
      jobId: job.id,
      ticketId: event.data.id,
    });

    // Validate event type
    if (event.event !== "ticket.created") {
      throw new Error(`Invalid event type: ${event.event}`);
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
      logger.info("Successfully processed ticket.created job", {
        jobId: job.id,
        ticketId: event.data.id,
        timing: {
          transformTime: parseFloat(transformTime.toFixed(2)),
          httpRequestTime: result.executionTime,
          totalTime: parseFloat(totalTime.toFixed(2)),
        },
      });
    } else {
      logger.error("Failed to process ticket.created job", {
        jobId: job.id,
        ticketId: event.data.id,
        error: result.error,
        timing: {
          transformTime: parseFloat(transformTime.toFixed(2)),
          httpRequestTime: result.executionTime,
          totalTime: parseFloat(totalTime.toFixed(2)),
        },
      });
      throw new Error(result.error);
    }
  } catch (error) {
    const totalTime = performance.now() - operationStartTime;
    logger.error("Error processing ticket.created job", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "Unknown error",
      timing: {
        totalTime: parseFloat(totalTime.toFixed(2)),
      },
    });
    throw error;
  }
};

const handleTicketUpdated: JobHandler<DigishareTicketUpdatedEvent> = async (job) => {
  const operationStartTime = performance.now();
  
  try {
    const event:DigishareTicketUpdatedEvent = job.data;
    logger.info("Processing ticket.updated job", {
      jobId: job.id,
      ticketId: event.data.id,
    });

    // Validate event type
    if (event.event !== "ticket.updated") {
      throw new Error(`Invalid event type: ${event.event}`);
    }

    // Transform data for lead update
    const transformStartTime = performance.now();
      // check if the ticket is a lead_qualification ticket
      let leadParams:Partial<UpdateLeadParams>
      let url :string
      if(event?.data?.data?.information?.selected_time_slot){
          leadParams = transformToActionRappel(event, env.TARGET_API_KEY);
          url = endpoints.createActionRappel;
      }else{
          leadParams = transformToUpdateLead(event, env.TARGET_API_KEY);
          url = endpoints.updateTicket;
      }

    const leadQueryString = buildQueryString(leadParams);
    const leadUpdateUrl = `${url}?${leadQueryString}`;
    const transformTime = performance.now() - transformStartTime;

    // Forward to external API
    const leadResult = await makeHttpRequest(leadUpdateUrl, {
      method: "POST",
    });

    const totalTime = performance.now() - operationStartTime;

    if (leadResult.success && !leadResult.error) {
      logger.info("Successfully processed ticket.updated job", {
        jobId: job.id,
        ticketId: event.data.id,
        timing: {
          transformTime: parseFloat(transformTime.toFixed(2)),
          httpRequestTime: leadResult.executionTime,
          totalTime: parseFloat(totalTime.toFixed(2)),
        },
      });
    } else {
      logger.error("Failed to process ticket.updated job", {
        jobId: job.id,
        ticketId: event.data.id,
        error: leadResult.error,
        timing: {
          transformTime: parseFloat(transformTime.toFixed(2)),
          httpRequestTime: leadResult.executionTime,
          totalTime: parseFloat(totalTime.toFixed(2)),
        },
      });
      throw new Error(leadResult.error);
    }
  } catch (error) {
    const totalTime = performance.now() - operationStartTime;
    logger.error("Error processing ticket.updated job", {
      jobId: job.id,
      error: error instanceof Error ? error.message : "Unknown error",
      timing: {
        totalTime: parseFloat(totalTime.toFixed(2)),
      },
    });
    throw error;
  }
};

// Workers
export const ticketCreatedWorker = new Worker("ticket-created", handleTicketCreated);
export const ticketUpdatedWorker = new Worker("ticket-updated", handleTicketUpdated);

// Graceful shutdown function
export const shutdownWebhookQueues = async () => {
  logger.info("Shutting down webhook queue workers...");
  
  try {
    await Promise.all([
      ticketCreatedWorker.close(),
      ticketUpdatedWorker.close(),
    ]);
    logger.info("Webhook queue workers shut down successfully");
  } catch (error) {
    logger.error("Error shutting down webhook queue workers", error);
    throw error;
  }
};

// Workers are automatically started in constructor
logger.info("Webhook queue workers initialized successfully");