// Digishare Webhook Event Types

export interface DigishareThird {
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  lang: string;
  wa_id: string;
  mobile: string;
  phone: string;
}

export interface DigishareTicketData {
  id: string;
  external_id: string | null;
  ticket_number: string;
  data: any[];
  lang: string;
  type_ticket_id: string;
  third_id: string | null;
  source_id: string;
  conversation_id: string | null;
  creator_id: string;
  ticket_status_id: string;
  company_id: string;
  channel_id: string;
  handler_id: string;
  handler_type: string;
  priority_id: number;
  category: string;
  information: Record<string, any>;
  subject: string;
  comment: string;
  note: string;
  creation_mode: string;
  closed_at: string | null;
  date_status: string;
  date: string;
  demand_date: string;
  locked: boolean;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DigishareTicketCreatedEvent {
  event: "ticket.created";
  data: {
    id: string;
    data: DigishareTicketData;
    wasRecentlyCreated: boolean;
  };
}

export interface DigishareTicketUpdatedEvent {
  event: "ticket.updated";
  data: {
    id: string;
    data: DigishareTicketData;
    wasRecentlyCreated: boolean;
    changes: Record<string, any>;
  };
}

export type DigishareWebhookEvent =
  | DigishareTicketCreatedEvent
  | DigishareTicketUpdatedEvent;


// Environment Variables
export interface EnvConfig {
  API_KEY: string;
  TARGET_BASE_URL: string;
  TARGET_API_KEY: string;
  PORT: string;
  ADMIN_KEY: string;

}


 
 
// Standard API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface WebhookResponse {
  success: boolean;
  message: string;
  targetServer?: string;
  jobId?: string|number;
  error?: string;
  timing?:Record<string, number>;
  details?: Record<string, any>;
}

// Health Check Types
export interface HealthCheckResponse {
  service: string;
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version?: string;
}

// Error Response Types
export interface ErrorResponse {
  success: false;
  error: string;
  code?: string;
  details?: any;
}


 

 
 
 
 