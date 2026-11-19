import "server-only";
import { unstable_cache } from "next/cache";
import { getPrices } from "./billing";

/** Live plan prices for the public pages, refreshed from Stripe at most once an hour. */
export const getPublicPrices = unstable_cache(getPrices, ["public-prices"], { revalidate: 3600 });
