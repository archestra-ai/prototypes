import OllamaServer from "./OllamaServer";
import OllamaModelsManager from "./OllamaModelsManager";

interface OllamaProps {}

export default function Ollama({}: OllamaProps) {
  return (
    <>
      <OllamaServer />
      <OllamaModelsManager />
    </>
  );
}
