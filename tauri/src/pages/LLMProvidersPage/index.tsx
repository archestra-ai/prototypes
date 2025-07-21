import Ollama from './Ollama';

interface LLMProvidersPageProps {
  activeProvider: 'ollama';
}

export default function LLMProvidersPage({
  activeProvider,
}: LLMProvidersPageProps) {
  return <>{activeProvider === 'ollama' && <Ollama />}</>;
}
