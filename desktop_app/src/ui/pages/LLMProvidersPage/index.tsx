import { Tabs, TabsContent, TabsList, TabsTrigger } from '@ui/components/ui/tabs';

import CloudProviders from './CloudProviders';
import Ollama from './Ollama';

interface LLMProvidersPageProps {
  activeProvider?: 'ollama' | 'cloud';
}

export default function LLMProvidersPage({ activeProvider = 'ollama' }: LLMProvidersPageProps) {
  return (
    <Tabs defaultValue={activeProvider}>
      <TabsList>
        <TabsTrigger value="ollama">Local (Ollama)</TabsTrigger>
        <TabsTrigger value="cloud">Cloud Providers</TabsTrigger>
      </TabsList>
      <TabsContent value="ollama">
        <Ollama />
      </TabsContent>
      <TabsContent value="cloud">
        <CloudProviders />
      </TabsContent>
    </Tabs>
  );
}
