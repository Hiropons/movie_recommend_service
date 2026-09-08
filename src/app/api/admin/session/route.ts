import { endpoint, json, requireAdmin } from "@/lib/request";
export async function GET() { return endpoint(async () => json({ admin: await requireAdmin(true) })); }
