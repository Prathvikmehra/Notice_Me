import { createGeminiClient } from '../../../scripts/gemini-client.js';

let sharedClient = null;

export function getGeminiClient(options = {}) {
  if (options.client) return options.client;
  if (!sharedClient) {
    sharedClient = createGeminiClient();
  }
  return sharedClient;
}

export function resetGeminiClient() {
  sharedClient = null;
}
