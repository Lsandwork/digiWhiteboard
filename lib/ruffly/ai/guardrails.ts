export const AI_DISCLOSURE =
  "Hi — I’m Ruffly with Fitdog Customer Care. Ask me about hours, daycare, boarding, grooming, or training — I can also get a teammate for you.";

export const AI_FORBIDDEN_BEHAVIORS = [
  "invent_availability",
  "invent_prices",
  "promise_reservation",
  "veterinary_diagnosis",
  "medical_advice",
  "assign_incident_fault",
  "promise_refund",
  "mutate_gingr_without_authorization",
  "reveal_internal_notes",
  "discuss_other_customers",
  "claim_to_be_human",
  "fabricate_policies"
] as const;

export function shouldHandoffToStaff(input: {
  customerRequestedHuman?: boolean;
  mentionsInjuryOrIllness?: boolean;
  mentionsIncidentOrBite?: boolean;
  highlyUpset?: boolean;
  mentionsLegal?: boolean;
  disputesCharge?: boolean;
  requestsRefund?: boolean;
  lacksVerifiedInfo?: boolean;
  highValueOrUrgent?: boolean;
}): { handoff: boolean; reason?: string } {
  if (input.customerRequestedHuman) return { handoff: true, reason: "customer_requested_human" };
  if (input.mentionsInjuryOrIllness) return { handoff: true, reason: "possible_injury_or_illness" };
  if (input.mentionsIncidentOrBite) return { handoff: true, reason: "incident_or_bite" };
  if (input.highlyUpset) return { handoff: true, reason: "customer_upset" };
  if (input.mentionsLegal) return { handoff: true, reason: "legal_language" };
  if (input.disputesCharge) return { handoff: true, reason: "billing_dispute" };
  if (input.requestsRefund) return { handoff: true, reason: "refund_request" };
  if (input.lacksVerifiedInfo) return { handoff: true, reason: "missing_verified_knowledge" };
  if (input.highValueOrUrgent) return { handoff: true, reason: "high_value_or_urgent" };
  return { handoff: false };
}

export function detectHandoffSignals(text: string) {
  const lower = text.toLowerCase();
  return {
    customerRequestedHuman: /\b(human|real person|speak to (someone|a person|staff)|talk to (someone|a manager))\b/i.test(text),
    mentionsInjuryOrIllness: /\b(injur|bleeding|vomit|seizure|poison|sick|limping)\b/i.test(lower),
    mentionsIncidentOrBite: /\b(bit|bite|attack|fight|incident)\b/i.test(lower),
    mentionsLegal: /\b(lawyer|attorney|lawsuit|legal action|sue)\b/i.test(lower),
    disputesCharge: /\b(wrong charge|overcharg|dispute|unauthorized charge)\b/i.test(lower),
    requestsRefund: /\brefund\b/i.test(lower)
  };
}
