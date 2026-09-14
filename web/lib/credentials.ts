import type { Provider } from "./types.ts";

/**
 * Keys live in server env vars and never reach the browser — the whole reason
 * the Streamlit app had those sidebar password boxes (and the autofill hack
 * that propped them up) is gone. The client is told only which providers are
 * usable, as booleans.
 *
 * Both spellings are accepted so the repo's existing .env works unchanged.
 */
export function credentials() {
  const massive = process.env.MASSIVE_API_KEY || process.env.POLYGON_API_KEY || "";
  const alpacaKey = process.env.ALPACA_API_KEY || process.env.ALPACA_KEY || "";
  const alpacaSecret = process.env.ALPACA_SECRET_KEY || process.env.ALPACA_SECRET || "";
  return { massive, alpacaKey, alpacaSecret };
}

/** Massive first — it's the better source, so it wins the default. */
export function availableProviders(): Provider[] {
  const { massive, alpacaKey, alpacaSecret } = credentials();
  const out: Provider[] = [];
  if (massive) out.push("massive");
  if (alpacaKey && alpacaSecret) out.push("alpaca");
  return out;
}
