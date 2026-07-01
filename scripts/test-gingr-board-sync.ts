import { loadEnvConfig } from "@next/env";
import { fetchGingrBackOfHouse } from "../lib/gingr-board-sync";

loadEnvConfig(process.cwd());

async function main() {
  const board = await fetchGingrBackOfHouse();
  console.log(
    JSON.stringify(
      {
        source: board.source,
        checking_in: board.checking_in.length,
        checking_out: board.checking_out.length,
        sample_in: board.checking_in[0]?.a_first ?? null,
        sample_out: board.checking_out[0]?.a_first ?? null
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
