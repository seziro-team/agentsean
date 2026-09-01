#!/usr/bin/env node
import { run } from "./cli.js";

const code = await run(process.argv);
process.exit(code);
