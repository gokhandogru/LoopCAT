// The test renderer intentionally uses the same dependency order as production.
// The renderer build composes the external lexical-scope characterization driver only into this graph.
import "../testing/startup-diagnostics.js";
import "./production.js";
