import type { InventoryDatabase } from "../lib/database";
let database:InventoryDatabase|undefined;
export function setTestDatabase(value:InventoryDatabase|undefined){database=value;}
export function getDatabase(){if(!database)throw Error("Test database not initialized");return database;}
