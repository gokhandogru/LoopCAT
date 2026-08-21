import { installAnthropicProviderAdapter } from "./anthropic-provider-adapter.js";
import { installCohereProviderAdapter } from "./cohere-provider-adapter.js";
import { installGeminiProviderAdapter } from "./gemini-provider-adapter.js";
import { installGroqProviderAdapter } from "./groq-provider-adapter.js";
import { installHostedProviderAdapters } from "./hosted-provider-adapters.js";
import { installNativeChatProviderAdapters } from "./native-chat-provider-adapters.js";
import { installNativeOpenAiProviderAdapters } from "./native-openai-provider-adapters.js";
import { installOllamaProviderAdapter } from "./ollama-provider-adapter.js";
import { installOpenAiCompatibleProviderAdapter } from "./openai-compatible-provider-adapter.js";
import { installOpusCatProviderAdapter } from "./opus-cat-provider-adapter.js";
import { installPerplexityProviderAdapter } from "./perplexity-provider-adapter.js";

export function installExtractedProviderAdapters(ai) {
  return Object.freeze([
    installOllamaProviderAdapter(ai),
    ...installNativeOpenAiProviderAdapters(ai),
    ...installNativeChatProviderAdapters(ai),
    installPerplexityProviderAdapter(ai),
    installGeminiProviderAdapter(ai),
    installAnthropicProviderAdapter(ai),
    installCohereProviderAdapter(ai),
    installGroqProviderAdapter(ai),
    ...installHostedProviderAdapters(ai),
    installOpenAiCompatibleProviderAdapter(ai),
    installOpusCatProviderAdapter(ai)
  ]);
}
