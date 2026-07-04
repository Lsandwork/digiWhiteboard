import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npx tsx scripts/hash-admin-password.ts <password>");
  process.exit(1);
}

console.log(bcrypt.hashSync(password, 12));
