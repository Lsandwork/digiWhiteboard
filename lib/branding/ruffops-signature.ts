/**
 * RuffOps developer signature art and copy.
 * Safe for server + client bundles. Contains no secrets or environment values.
 */

export const RUFFOPS_TAGLINE = "SMARTER OPERATIONS. HAPPIER DOGS.";

/** Registered author / creator of the RuffOps platform. */
export const RUFFOPS_AUTHOR = "Lonnie Sandoval";
/** Legal entity that owns RuffOps. */
export const RUFFOPS_DIVISION = "A Division of SK9 LLC";
export const RUFFOPS_CREATOR_LINE = `${RUFFOPS_AUTHOR} · ${RUFFOPS_DIVISION}`;

export const RUFFOPS_WORDMARK_ASCII = `
██████╗ ██╗   ██╗███████╗███████╗ ██████╗ ██████╗ ███████╗
██╔══██╗██║   ██║██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝
██████╔╝██║   ██║█████╗  █████╗  ██║   ██║██████╔╝███████╗
██╔══██╗██║   ██║██╔══╝  ██╔══╝  ██║   ██║██╔═══╝ ╚════██║
██║  ██║╚██████╔╝██║     ██║     ╚██████╔╝██║     ███████║
╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝      ╚═════╝ ╚═╝     ╚══════╝
`.trim();

export const RUFFOPS_PAW_ASCII = `
               ●       ●
          ●                 ●

               ╭─────╮
             ╭─╯     ╰─╮
             │  ▄██▄   │
             │ ██████  │
             │  ▀██▀   │
             ╰─────────╯

            RUFFOPS CORE
`.trim();

/** Inert payload for View Page Source (type="text/plain" script). */
export const RUFFOPS_SOURCE_SIGNATURE = `
${RUFFOPS_WORDMARK_ASCII}


${RUFFOPS_PAW_ASCII}


        SMARTER OPERATIONS.
             HAPPIER DOGS.


     BUILD  •  MONITOR  •  TRACE
     DEBUG  •  VERIFY   •  IMPROVE


     RuffOps Operations Platform
     ${RUFFOPS_DIVISION}

     Author & Creator
     ${RUFFOPS_AUTHOR}

     Built with obsessive attention to operations.

     This signature is intentional.
     It is not an error and contains no credentials.
`.trim();

export const RUFFOPS_SOURCE_SIGNATURE_ELEMENT_ID = "ruffops-source-signature";

export const RUFFOPS_CONSOLE_STYLES = {
  wordmark:
    "font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:800;letter-spacing:0.08em;color:#7c3aed;background:linear-gradient(90deg,#2563eb,#7c3aed,#ec4899,#22d3ee);-webkit-background-clip:text;color:transparent;padding:4px 0;",
  tagline: "font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;font-weight:600;color:#64748b;letter-spacing:0.12em;",
  line: "font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:#334155;padding:1px 0;"
} as const;

export const RUFFOPS_CONSOLE_LINES = [
  "◆ Operations Platform",
  "◆ Observability",
  "◆ Route Intelligence",
  "◆ System Health",
  `◆ Author & Creator — ${RUFFOPS_AUTHOR}`,
  `◆ ${RUFFOPS_DIVISION}`
] as const;

export const RUFFOPS_META = {
  applicationName: "RuffOps",
  generator: "RuffOps Operations Platform",
  platformDescription: "RuffOps Operations Platform",
  author: RUFFOPS_AUTHOR,
  creator: RUFFOPS_AUTHOR,
  publisher: "SK9 LLC",
  division: RUFFOPS_DIVISION
} as const;
