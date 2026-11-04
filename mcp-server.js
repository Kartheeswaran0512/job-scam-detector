import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./lib/mcpTools.js";
import { redactSecrets } from "./lib/redact.js";

// stdout carries the MCP protocol, so anything else written there would corrupt it. Logging goes to stderr,
// including any console.log from a dependency.
console.log = console.info = console.debug = console.error;

// MCP clients start the server from their own working directory: load .env from this project's folder.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, ".env"), quiet: true });

// Tool errors are already returned to the client (lib/mcpTools.js). Anything else is logged, not fatal.
process.on("uncaughtException", (err) => console.error("Uncaught error:", redactSecrets(err?.stack ?? err)));
process.on("unhandledRejection", (err) => console.error("Unhandled rejection:", redactSecrets(err?.stack ?? err)));

await createMcpServer().connect(new StdioServerTransport());
console.error("Job Scam Detector MCP server running on stdio");
