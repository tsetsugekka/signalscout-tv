import { env } from "cloudflare:workers";
export function catalogDb(){if(!env.DB)throw new Error("Catalog database unavailable");return env.DB;}
