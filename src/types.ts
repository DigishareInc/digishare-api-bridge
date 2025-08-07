// External API Types
export interface CreateLeadParams {
  key: string;
  Name: string;
  Phone: string;
  IdProjet: string;
  IdLead: string;
  Email?: string;
  Source: string;
  Comment?: string;
  Utm_Compagne?: string;
  Utm_content?: string;
  Utm_medium?: string;
  Utm_term?: string;
  Compagne_id?: string;
  Ville?: string;
  Nature?: string;
  Utm_source?: string;
  DateLead?: string;
  typologie?: string;
  budget?: string;
  langue?: string;
  localisation?: string;
  deuxieme_tel?: string;
  surface?: string;
}

export interface UpdateLeadParams extends CreateLeadParams {
  // Same as CreateLeadParams for UpdateLeadAndBesoins
}

export interface UpdateConversationParams {
  key: string;
  IdLead: string;
  observation: string;
}
