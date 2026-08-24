export type CastTvFormFile = {
  name: string;
  type: string;
  size: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

/** Duck-type FormData files. `instanceof File` is unreliable across Node/undici realms. */
export function asCastTvFormFile(value: FormDataEntryValue | null): CastTvFormFile | null {
  if (!value || typeof value === "string") return null;
  const candidate = value as {
    name?: unknown;
    type?: unknown;
    size?: unknown;
    arrayBuffer?: unknown;
  };
  const arrayBuffer = candidate.arrayBuffer;
  if (typeof arrayBuffer !== "function" || typeof candidate.size !== "number" || candidate.size <= 0) {
    return null;
  }
  return {
    name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name : "upload.bin",
    type: typeof candidate.type === "string" ? candidate.type : "",
    size: candidate.size,
    arrayBuffer: () => arrayBuffer.call(value) as Promise<ArrayBuffer>
  };
}
