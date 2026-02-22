import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getDB() {
  return (getCloudflareContext().env as CloudflareEnv).DB;
}

export function getKV() {
  return (getCloudflareContext().env as CloudflareEnv).KV;
}
