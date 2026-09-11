declare module "qrcode" {
  const QRCode: {
    toString: (
      text: string,
      options: {
        type?: string;
        margin?: number;
        width?: number;
        color?: { dark: string; light: string };
        errorCorrectionLevel?: string;
      }
    ) => Promise<string>;
  };
  export default QRCode;
}

declare module "bwip-js" {
  export function toBuffer(options: Record<string, unknown>): Promise<Buffer>;
}
