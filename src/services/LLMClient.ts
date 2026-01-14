import axios from 'axios';

export class LLMClient {
    private baseUrl: string;
    private model: string;

    constructor(baseUrl = 'http://localhost:11434', model = 'llama3') {
        this.baseUrl = baseUrl;
        this.model = model;
    }


    async generate(prompt: string, systemPrompt?: string, provider: 'local' | 'gemini' = 'local', apiKey?: string, model?: string): Promise<string> {
        if (provider === 'gemini') {
            return this.generateGemini(prompt, systemPrompt, apiKey, model);
        }
        // For local, use the passed model or fall back to constructor model
        if (model) this.model = model;
        return this.generateOllama(prompt, systemPrompt);
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

    private async generateOllama(prompt: string, systemPrompt?: string): Promise<string> {
        try {
            const response = await axios.post(`${this.baseUrl}/api/generate`, {
                model: this.model,
                prompt: prompt,
                system: systemPrompt,
                stream: false,
                options: {
                    temperature: 0.1
                }
            });
            return response.data.response;
        } catch (error) {
            console.error('Ollama Generation Error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Failed to connect to Local LLM at ${this.baseUrl}. details: ${error.message}`);
            }
            throw new Error(`Failed to communicate with Local LLM: ${error}`);
        }
    }

    private async generateGemini(prompt: string, systemPrompt?: string, apiKey?: string, modelName = 'gemini-2.0-flash'): Promise<string> {
        if (!apiKey) throw new Error("API Key required for Gemini");

        // Use v1beta endpoint with the model name
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

        const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

        try {
            const response = await axios.post(url, {
                contents: [{
                    parts: [{ text: fullPrompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    responseMimeType: "text/plain"
                }
            });

            // Extract text from Gemini response structure
            const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error("Empty response from Gemini");

            // Cleanup markdown code blocks if present
            return text.replace(/```yaml\n/g, '').replace(/```/g, '').trim();

        } catch (error) {
            console.error('Gemini Generation Error:', error);
            if (axios.isAxiosError(error)) {
                throw new Error(`Gemini API connection failed: ${error.response?.data?.error?.message || error.message}`);
            }
            throw error;
        }
    }
}

