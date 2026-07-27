import path from "path";
import { config } from "dotenv";

// override: true — this shell's environment already has DATABASE_URL/etc.
// exported from .env (see the "env: load .env" lines other commands in
// this project print), and dotenv's default is to NOT clobber an existing
// process.env value. Without override, .env.test would be silently ignored
// and tests would run against the real dev database.
config({ path: path.resolve(__dirname, "../.env.test"), override: true });
