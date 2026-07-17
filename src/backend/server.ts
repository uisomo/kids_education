import { loadConfig } from "./config";
import { makeApp } from "./api/routes";
import { makeRealClient } from "./services/claude-turn";

const config = loadConfig();
const app = makeApp({ config, claude: makeRealClient() });
app.listen(config.port, () => {
  console.log(`Talk Quest backend on http://localhost:${config.port} (model: ${config.model})`);
});
