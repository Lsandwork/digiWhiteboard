export type BlogImageSourceKind = "bulk_photo" | "web_licensed" | "fitdog_owned";

/** Real photo selected for blog/social — never AI-generated. */
export type BlogImageCandidate = {
  id: string;
  sourceKind: BlogImageSourceKind;
  /** Public or staff-usable URL for the image */
  url: string;
  /** Thumbnail when available */
  thumbUrl?: string | null;
  alt: string;
  caption: string;
  /** Short scene description used to align copy with the photo */
  sceneDescription: string;
  photographer?: string | null;
  license?: string | null;
  licenseUrl?: string | null;
  sourcePageUrl?: string | null;
  /** Bulk photo item id when sourced from Digi Board bulk upload */
  bulkItemId?: string | null;
  dogNames?: string[];
  yard?: string | null;
  category?: string | null;
  tags?: string[];
  width?: number | null;
  height?: number | null;
};

export type SelectedPostingImages = {
  cover: BlogImageCandidate | null;
  supporting: BlogImageCandidate[];
  all: BlogImageCandidate[];
  notes: string[];
};
