// NOTE: see this comment here https://github.com/ollama/ollama/issues/3922#issuecomment-2079189550
// as of this writing, this list of available models was pulled from https://ollama-models.zwz.workers.dev/
// because ollama does not expose a public API for listing available models

export interface OllamaModelTag {
  tag: string;
  context: string;
  size: string;
  inputs: string[];
}

export interface OllamaModel {
  name: string;
  description: string;
  labels: string[];
  tags: OllamaModelTag[];
}

export const AVAILABLE_MODELS: OllamaModel[] = [
  {
    name: "deepseek-r1",
    description: "DeepSeek-R1 is a family of open reasoning models with performance approaching that of leading models, such as O3 and Gemini 2.5 Pro",
    labels: ["tools", "thinking", "reasoning"],
    tags: [
      {
        tag: "1.5b",
        context: "128K",
        size: "1.1GB",
        inputs: ["Text"]
      },
      {
        tag: "7b",
        context: "128K",
        size: "4.7GB",
        inputs: ["Text"]
      },
      {
        tag: "8b",
        context: "128K",
        size: "5.2GB",
        inputs: ["Text"]
      },
      {
        tag: "14b",
        context: "128K",
        size: "9.0GB",
        inputs: ["Text"]
      },
      {
        tag: "32b",
        context: "128K",
        size: "20GB",
        inputs: ["Text"]
      },
      {
        tag: "70b",
        context: "128K",
        size: "43GB",
        inputs: ["Text"]
      },
      {
        tag: "671b",
        context: "160K",
        size: "404GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "llama3.2-vision",
    description: "Llama 3.2 Vision is a collection of multimodal large language models that understand both text and images",
    labels: ["vision", "multimodal", "meta"],
    tags: [
      {
        tag: "11b",
        context: "128K",
        size: "7.8GB",
        inputs: ["Text", "Image"]
      },
      {
        tag: "90b",
        context: "128K",
        size: "55GB",
        inputs: ["Text", "Image"]
      }
    ]
  },
  {
    name: "llama3.1",
    description: "Llama 3.1 is a new state-of-the-art model from Meta available in 8B, 70B and 405B parameter sizes",
    labels: ["tools", "meta", "general"],
    tags: [
      {
        tag: "8b",
        context: "128K",
        size: "4.9GB",
        inputs: ["Text"]
      },
      {
        tag: "70b",
        context: "128K",
        size: "43GB",
        inputs: ["Text"]
      },
      {
        tag: "405b",
        context: "128K",
        size: "243GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "qwen2.5-coder",
    description: "Qwen2.5-Coder is the latest series of Code-Specific Qwen large language models, specifically designed for coding tasks",
    labels: ["coding", "programming", "alibaba"],
    tags: [
      {
        tag: "0.5b",
        context: "32K",
        size: "398MB",
        inputs: ["Text"]
      },
      {
        tag: "1.5b",
        context: "32K",
        size: "986MB",
        inputs: ["Text"]
      },
      {
        tag: "3b",
        context: "32K",
        size: "1.9GB",
        inputs: ["Text"]
      },
      {
        tag: "7b",
        context: "32K",
        size: "4.7GB",
        inputs: ["Text"]
      },
      {
        tag: "14b",
        context: "32K",
        size: "9.0GB",
        inputs: ["Text"]
      },
      {
        tag: "32b",
        context: "32K",
        size: "20GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "mixtral",
    description: "A sparse mixture of experts (MoE) model with open weights by Mistral AI",
    labels: ["moe", "mistral", "efficient"],
    tags: [
      {
        tag: "8x7b",
        context: "32K",
        size: "26GB",
        inputs: ["Text"]
      },
      {
        tag: "8x22b",
        context: "64K",
        size: "80GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "gemma3n",
    description: "Gemma 3n models are designed for efficient execution on everyday devices such as laptops, tablets or phones",
    labels: ["efficient", "google", "mobile"],
    tags: [
      {
        tag: "e2b",
        context: "8K",
        size: "1.7GB",
        inputs: ["Text"]
      },
      {
        tag: "e4b",
        context: "8K",
        size: "2.6GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "gemma3",
    description: "The current, most capable model that runs on a single GPU",
    labels: ["vision", "efficient", "google"],
    tags: [
      {
        tag: "1b",
        context: "8K",
        size: "731MB",
        inputs: ["Text"]
      },
      {
        tag: "4b",
        context: "8K",
        size: "2.5GB",
        inputs: ["Text"]
      },
      {
        tag: "12b",
        context: "8K",
        size: "7.6GB",
        inputs: ["Text"]
      },
      {
        tag: "27b",
        context: "8K",
        size: "17GB",
        inputs: ["Text", "Image"]
      }
    ]
  },
  {
    name: "phi3",
    description: "Phi-3 Mini is a lightweight, state-of-the-art open model by Microsoft",
    labels: ["microsoft", "efficient", "lightweight"],
    tags: [
      {
        tag: "3.8b",
        context: "128K",
        size: "2.3GB",
        inputs: ["Text"]
      },
      {
        tag: "14b",
        context: "128K",
        size: "7.9GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "mistral",
    description: "The 7B model released by Mistral AI, updated to version 0.3",
    labels: ["mistral", "general", "efficient"],
    tags: [
      {
        tag: "7b",
        context: "32K",
        size: "4.1GB",
        inputs: ["Text"]
      }
    ]
  },
  {
    name: "codellama",
    description: "A large language model that can use text prompts to generate and discuss code",
    labels: ["coding", "meta", "programming"],
    tags: [
      {
        tag: "7b",
        context: "16K",
        size: "3.8GB",
        inputs: ["Text"]
      },
      {
        tag: "13b",
        context: "16K",
        size: "7.4GB",
        inputs: ["Text"]
      },
      {
        tag: "34b",
        context: "16K",
        size: "19GB",
        inputs: ["Text"]
      },
      {
        tag: "70b",
        context: "16K",
        size: "39GB",
        inputs: ["Text"]
      }
    ]
  }
];
