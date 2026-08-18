function gingrSubdomain() {
  return (process.env.GINGR_SUBDOMAIN ?? "fitdog").trim() || "fitdog";
}

export function gingrAnimalUrl(animalId: string | null | undefined) {
  const id = String(animalId ?? "").trim();
  if (!id) return null;
  return `https://${gingrSubdomain()}.gingrapp.com/index.php/animals/view/${encodeURIComponent(id)}`;
}

export function gingrReservationUrl(reservationId: string | null | undefined) {
  const id = String(reservationId ?? "").trim();
  if (!id) return null;
  return `https://${gingrSubdomain()}.gingrapp.com/index.php/reservations/view/${encodeURIComponent(id)}`;
}
