import { prisma } from "./src/lib/prisma";
async function main() {
  await prisma.$executeRawUnsafe("UPDATE appointments SET staff_id = NULL");
  await prisma.$executeRawUnsafe("UPDATE kartes SET staff_id = NULL");
  console.log("Updated!");
}
main().catch(console.error).finally(() => process.exit(0));
