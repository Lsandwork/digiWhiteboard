import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

const LIBVIPS_PACKAGES = [
  "@img/sharp-libvips-linux-x64",
  "@img/sharp-libvips-linuxmusl-x64"
] as const;

function existingDir(dir: string) {
  return existsSync(dir) ? dir : null;
}

/** Put libvips next to sharp.node so Vercel/linux-x64 can dlopen it. */
export function ensureSharpLibvipsPath() {
  const dirs: string[] = [];

  for (const name of LIBVIPS_PACKAGES) {
    try {
      const pkg = dirname(require.resolve(`${name}/package.json`));
      const lib = join(pkg, "lib");
      if (existsSync(lib)) dirs.push(lib);
    } catch {
      /* package not in this serverless bundle */
    }
  }

  for (const name of LIBVIPS_PACKAGES) {
    const lib = existingDir(join(process.cwd(), "node_modules", name, "lib"));
    if (lib) dirs.push(lib);
  }

  const unique = [...new Set(dirs)];
  if (!unique.length) return unique;

  const current = process.env.LD_LIBRARY_PATH || "";
  const parts = current.split(":").filter(Boolean);
  const missing = unique.filter((dir) => !parts.includes(dir));
  if (missing.length) {
    process.env.LD_LIBRARY_PATH = [...missing, ...parts].join(":");
  }
  return unique;
}

export async function loadSharp() {
  ensureSharpLibvipsPath();
  try {
    const { default: sharp } = await import("sharp");
    return sharp;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load the "sharp" module using the linux-x64 runtime ${message}`, {
      cause: error
    });
  }
}
