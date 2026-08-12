import { installGroqProviderAdapter } from "./groq-provider-adapter.js";
import { installHostedProviderAdapters } from "./hosted-provider-adapters.js";

installGroqProviderAdapter(globalThis.window?.CatHan?.ai);
installHostedProviderAdapters(globalThis.window?.CatHan?.ai);
