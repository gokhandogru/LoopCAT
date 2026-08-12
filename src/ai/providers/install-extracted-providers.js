import { installGroqProviderAdapter } from "./groq-provider-adapter.js";
import { installHostedProviderAdapters } from "./hosted-provider-adapters.js";
import { installNativeChatProviderAdapters } from "./native-chat-provider-adapters.js";
import { installNativeOpenAiProviderAdapters } from "./native-openai-provider-adapters.js";
import { installPerplexityProviderAdapter } from "./perplexity-provider-adapter.js";

installNativeOpenAiProviderAdapters(globalThis.window?.CatHan?.ai);
installNativeChatProviderAdapters(globalThis.window?.CatHan?.ai);
installPerplexityProviderAdapter(globalThis.window?.CatHan?.ai);
installGroqProviderAdapter(globalThis.window?.CatHan?.ai);
installHostedProviderAdapters(globalThis.window?.CatHan?.ai);
