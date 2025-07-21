import OllamaServer from './OllamaServer';
import ModelsCatalog from './ModelsCatalog';
import InstalledModels from './InstalledModels';

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
