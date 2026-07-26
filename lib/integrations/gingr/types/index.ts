export type GingrOwner = {
  id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  cell_phone?: string;
  [key: string]: unknown;
};

export type GingrAnimal = {
  id: string;
  owner_id?: string;
  name?: string;
  breed?: string;
  birthdate?: string;
  photo_url?: string;
  [key: string]: unknown;
};

export type GingrReservation = {
  id: string;
  owner_id?: string;
  animal_id?: string;
  type?: string;
  type_id?: string | number;
  start_date?: string;
  end_date?: string;
  status?: string;
  [key: string]: unknown;
};

export type GingrWebhookType =
  | "check_in"
  | "check_out"
  | "checking_in"
  | "checking_out"
  | "owner_created"
  | "owner_edited"
  | "animal_created"
  | "animal_edited"
  | "lead_created"
  | "email_sent"
  | "incident_created"
  | "incident_edited"
  | string;

export type GingrWebhookPayload = {
  webhook_type?: GingrWebhookType;
  entity_id?: string | number;
  entity_type?: string;
  signature?: string;
  entity_data?: Record<string, unknown>;
  [key: string]: unknown;
};
