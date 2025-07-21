import InstalledModels from './InstalledModels';
import ModelsCatalog from './ModelsCatalog';
import OllamaServer from './OllamaServer';

interface OllamaProps {}

export default function Ollama({}: OllamaProps) {
  return (
    <div className="space-y-6">
      <OllamaServer />
      <InstalledModels />
      <ModelsCatalog />
    </div>
  );
}
