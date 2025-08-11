import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Card } from '@ui/components/ui/card';
import { CloudProviderWithConfig } from '@ui/lib/clients/archestra/api/gen/types.gen';
import { useCloudProvidersStore } from '@ui/stores';

import CloudProviderConfigDialog from './CloudProviderConfigDialog';

export default function CloudProviders() {
  const { cloudProviders, deleteCloudProvider } = useCloudProvidersStore();
  const [selectedProvider, setSelectedProvider] = useState<CloudProviderWithConfig | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        {cloudProviders.map((provider) => (
          <Card key={provider.type} className="p-4">
            <h3 className="font-semibold">{provider.name}</h3>
            <div className="mt-2 text-sm text-muted-foreground">
              {provider.configured ? '✓ Configured' : 'Not configured'}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => setSelectedProvider(provider)}
                variant={provider.configured ? 'outline' : 'default'}
                size="sm"
              >
                {provider.configured ? 'Reconfigure' : 'Configure'}
              </Button>
              {provider.configured && (
                <Button
                  className="cursor-pointer"
                  onClick={() => deleteCloudProvider(provider.type)}
                  variant="destructive"
                  size="sm"
                >
                  Remove
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {selectedProvider && (
        <CloudProviderConfigDialog provider={selectedProvider} onClose={() => setSelectedProvider(null)} />
      )}
    </>
  );
}
