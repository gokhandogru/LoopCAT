// The test renderer intentionally uses the same dependency order as production.
// app.js activates its isolated characterization driver only for the test URL.
import "../testing/startup-diagnostics.js";
import "./production.js";
