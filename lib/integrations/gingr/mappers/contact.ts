import { normalizeEmail, normalizePhone } from "@/lib/ruffly/consent/normalize";
import type { GingrOwner } from "@/lib/integrations/gingr/types";

export type MappedRufflyContact = {
  gingr_owner_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  phone_normalized: string | null;
  email: string | null;
  email_normalized: string | null;
};

export function mapGingrOwnerToContact(owner: GingrOwner): MappedRufflyContact {
  const phone = (owner.cell_phone || owner.phone || null) as string | null;
  const email = (owner.email || null) as string | null;
  return {
    gingr_owner_id: String(owner.id),
    first_name: String(owner.first_name ?? ""),
    last_name: String(owner.last_name ?? ""),
    phone,
    phone_normalized: normalizePhone(phone),
    email,
    email_normalized: normalizeEmail(email)
  };
}
