import { loadConfig } from "./config";
import { makeApp } from "./api/routes";
import { makeRealClient } from "./services/claude-turn";
import { makeMockClaude } from "./services/mock-claude";

const config = loadConfig();
const claude = process.env.MOCK_CLAUDE === "1" ? makeMockClaude() : makeRealClient();
const app = makeApp({ config, claude });
app.listen(config.port, () => {
  console.log(`Talk Quest backend on http://localhost:${config.port}` +
    ` (model: ${config.model}${process.env.MOCK_CLAUDE === "1" ? ", MOCKED" : ""})`);
});
