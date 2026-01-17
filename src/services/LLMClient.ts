import axios from 'axios';

export class LLMClient {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl = 'http://localhost:11434', model = 'llama3') {
        this.baseUrl = baseUrl;
        this.model = model;
    }


    async generate(prompt: string, systemPrompt?: string, provider: 'local' | 'gemini' = 'local', apiKey?: string, model?: string, logger?: any, signal?: AbortSignal): Promise<string> {
        if (provider === 'gemini') {
            return this.generateGemini(prompt, systemPrompt, apiKey, model, logger, signal);
        }
        // For local, use the passed model or fall back to constructor model
        if (model) this.model = model;
        return this.generateOllama(prompt, systemPrompt, signal);
    }

    async listOllamaModels(): Promise<string[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) return ['llama3']; // Fallback

            const data = await response.json();
            // Expected format: { models: [ { name: "llama3:latest" }, ... ] }
            return data.models.map((m: any) => m.name);
        } catch (e) {
            console.warn("Failed to fetch Ollama models:", e);
            return ['llama3']; // Fallback
        }
    }

    /**
     * List available Gemini models from the API.
     */
    async listGeminiModels(apiKey: string): Promise<{ name: string, displayName: string, description: string }[]> {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
            const response = await axios.get(url);

            // Filter to only text generation models that support generateContent
            const models = response.data.models
                .filter((m: any) =>
                    m.supportedGenerationMethods?.includes('generateContent') &&
                    m.name.includes('gemini')
                )
                .map((m: any) => ({
                    name: m.name.replace('models/', ''),
                    displayName: m.displayName || m.name,
                    description: m.description || ''
                }));

            return models;
        } catch (e) {
            console.warn("Failed to fetch Gemini models:", e);
            // Return sensible defaults
            return [
                { name: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', description: 'Fast, cost-effective' },
                { name: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro', description: 'Best quality reasoning' }
            ];
        }
    }

    private async generateOllama(prompt: string, systemPrompt?: string, signal?: AbortSignal): Promise<string> {
        try {
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model: this.model,
                prompt: prompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: 0.1
                }
            }, { signal });
            return response.data.response;
        } catch (error) {
            if (axios.isCancel(error)) throw new Error("Ollama request cancelled");
            console.error('Ollama Generation Error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to connect to Local LLM at ${this.baseUrl}. details: ${error.message}`);
            }
            throw new Error(`Failed to communicate with Local LLM: ${error}`);
        }
    }

    /**
     * Generate with images (multimodal) - Gemini only
     * @param prompt Text prompt
     * @param images Array of image buffers (PNG/JPEG)
     * @param systemPrompt Optional system context
     * @param apiKey Gemini API key
     * @param modelName Model to use (default: gemini-2.0-flash)
     */
    async generateWithImages(
        prompt: string,
        images: Buffer[],
        systemPrompt?: string,
        apiKey?: string,
        modelName = 'gemini-2.0-flash',
        signal?: AbortSignal
    ): Promise<string> {
        if (!apiKey) throw new Error("API Key required for multimodal generation");

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        // Build parts array: system prompt + images + user prompt
        const parts: any[] = [];

        if (systemPrompt) {
            parts.push({ text: systemPrompt + '\n\n' });
        }

        // Add images as inline_data
        for (const img of images) {
            parts.push({
                inline_data: {
                    mime_type: 'image/png',
                    data: img.toString('base64')
                }
            });
        }

        parts.push({ text: prompt });

        try {
            const response = await axios.post(url, {
                contents: [{ parts }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "text/plain"
                }
            }, { signal });

            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Empty response from Gemini multimodal");

            return text.replace(/```yaml\n/g, '').replace(/```/g, '').trim();
        } catch (error) {
            if (axios.isCancel(error)) throw new Error("Gemini request cancelled");
            console.error('Gemini Multimodal Error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Gemini multimodal API failed: ${error.response?.data?.error?.message || error.message}`);
            }
            throw error;
        }
    }

    private async retryWithBackoff<T>(fn: () => Promise<T>, retries = 10, initialDelay = 5000, logger?: any, signal?: AbortSignal): Promise<T> {
        let attempt = 0;
        while (attempt < retries) {
            if (signal?.aborted) throw new Error("Operation cancelled");
            try {
                return await fn();
            } catch (error: any) {
                if (axios.isCancel(error)) throw error;
                if (axios.isAxiosError(error) && error.response?.status === 429) {
                    attempt++;
                    let delay = initialDelay * Math.pow(2, attempt - 1); // Exponential: 5s, 10s, 20s...

                    // Try to parse delay from message "Please retry in 14.12s"
                    const message = error.response?.data?.error?.message || "";
                    const match = message.match(/retry in (\d+(\.\d+)?)s/);
                    if (match && match[1]) {
                        delay = Math.ceil(parseFloat(match[1]) * 1000) + 1000; // Add 1s buffer
                    }

                    const retryMsg = `Rate limited. Retrying in ${(delay / 1000).toFixed(1)}s... (Attempt ${attempt}/${retries})`;
                    console.warn(`[LLMClient] ${retryMsg}`);
                    if (logger?.warn) {
                        logger.warn(`[Gemini] ${retryMsg}`);
                        if (attempt >= 3) {
                            logger.log(`[Tip] If you are frequently hitting rate limits, consider switching to "Local (Ollama)" in the AI Settings.`);
                        }
                    }

                    // Await with signal awareness
                    if (signal) {
                        await new Promise((resolve, reject) => {
                            const timer = setTimeout(resolve, delay);
                            signal.addEventListener('abort', () => {
                                clearTimeout(timer);
                                reject(new Error("Operation cancelled"));
                            }, { once: true });
                        });
                    } else {
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } else {
                    throw error;
                }
            }
        }
        throw new Error("Max retries exceeded for Gemini API");
    }

    private async generateGemini(prompt: string, systemPrompt?: string, apiKey?: string, modelName = 'gemini-2.0-flash', logger?: any, signal?: AbortSignal): Promise<string> {
        if (!apiKey) throw new Error("API Key required for Gemini");

        // List of models to try in order if the primary fails
        const fallbackModels = [
            'gemini-2.5-flash',
            'gemini-2.0-flash-lite',
            'gemini-2.0-flash-001'
        ];

        // Ensure we don't retry the primary model immediately if it's already in the list
        const modelsToTry = [modelName, ...fallbackModels.filter(m => m !== modelName)];

        let lastError: any = null;

        for (const model of modelsToTry) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

            try {
                if (logger?.log && model !== modelName) {
                    logger.log(`[Gemini] Falling back to model: ${model}`);
                }

                return await this.retryWithBackoff(async () => {
                    try {
                        const response = await axios.post(url, {
                            contents: [{
                                parts: [{ text: fullPrompt }]
                            }],
                            generationConfig: {
                                temperature: 0.1,
                                responseMimeType: "text/plain"
                            }
                        }, { signal });

                        const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
                        if (!text) throw new Error("Empty response from Gemini");

                        return text.replace(/```yaml\n/g, '').replace(/```/g, '').trim();

                    } catch (error: any) {
                        if (axios.isCancel(error)) throw error;

                        // If it's a 429, rethrow to trigger retryWithBackoff
                        if (axios.isAxiosError(error) && error.response?.status === 429) {
                            throw error;
                        }

                        // If 404 (Model not found), allow breaking out of retryWithBackoff to try next model
                        if (axios.isAxiosError(error) && error.response?.status === 404) {
                            throw new Error(`MODEL_NOT_FOUND`);
                        }

                        // Log real error
                        // console.error('Gemini Generation Error:', error);
                        if (axios.isAxiosError(error)) {
                            throw new Error(`Gemini API connection failed: ${error.response?.data?.error?.message || error.message}`);
                        }
                        throw error;
                    }
                }, 3, 2000, logger, signal); // Reduced retries per model to allow fallbacks faster

            } catch (error: any) {
                lastError = error;
                if (error.message === 'MODEL_NOT_FOUND' || error.message.includes('404')) {
                    continue; // Try next model
                }

                // If it was a rate limit that exhausted retries, try next model which might have different quota
                if (error.message.includes('Rate limited') || error.message.includes('429')) {
                    continue;
                }

                // If cancelled, stop
                if (axios.isCancel(error) || error.message === 'Operation cancelled') {
                    throw error;
                }

                // Other errors, continue to next model just in case (e.g. 500s)
                continue;
            }
        }

        throw lastError || new Error("All Gemini models failed");
    }
}

