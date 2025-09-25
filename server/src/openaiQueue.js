const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export class OpenAIRequestQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  enqueue({ apiKey, payload }) {
    return new Promise((resolve, reject) => {
      this.queue.push({ apiKey, payload, resolve, reject });
      this.#process();
    });
  }

  async #process() {
    if (this.processing) {
      return;
    }

    this.processing = true;
    while (this.queue.length) {
      const item = this.queue.shift();
      if (!item) {
        continue;
      }
      try {
        const response = await this.#sendRequest(item.apiKey, item.payload);
        item.resolve(response);
      } catch (error) {
        item.reject(error);
      }
    }
    this.processing = false;
  }

  async #sendRequest(apiKey, payload) {
    const response = await globalThis.fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;
    if (!message) {
      throw new Error("OpenAI response was missing a message");
    }

    return {
      content: message,
      raw: data
    };
  }
}
