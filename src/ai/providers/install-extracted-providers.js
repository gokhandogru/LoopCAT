import { installGroqProviderAdapter } from "./groq-provider-adapter.js";
import { installHostedProviderAdapters } from "./hosted-provider-adapters.js";
import { installNativeOpenAiProviderAdapters } from "./native-openai-provider-adapters.js";

installNativeOpenAiProviderAdapters(globalThis.window?.CatHan?.ai);
installGroqProviderAdapter(globalThis.window?.CatHan?.ai);
installHostedProviderAdapters(globalThis.window?.CatHan?.ai);
