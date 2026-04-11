// Shared Prisma client for the thermal-heatmap worker.
// Used by API route handlers, the background processor and the live poller.

import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg(new Pool({ connectionString: databaseUrl }));
export const prisma = new PrismaClient({ adapter });
