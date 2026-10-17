const pool = require("./db");
const { email, str } = require("./domain/rules");
const { passwordHash } = require("./domain/auth");
(async () => {
  const address = email(process.env.ADMIN_EMAIL),
    password = str(process.env.ADMIN_PASSWORD, "Jelszó", 256);
  if (password.length < 12)
    throw Error("Legalább 12 karakteres admin jelszó szükséges.");
  await pool.query(
    "INSERT INTO admins(email,password_hash) VALUES($1,$2) ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash",
    [address, await passwordHash(password)],
  );
  await pool.query(
    "DELETE FROM sessions WHERE admin_id=(SELECT id FROM admins WHERE email=$1)",
    [address],
  );
  console.log("Admin mentve.");
})()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
