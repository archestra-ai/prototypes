import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ui/components/ui/dialog';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import { CloudProviderWithConfig } from '@ui/lib/clients/archestra/api/gen/types.gen';
import { useCloudProvidersStore } from '@ui/stores/cloud-providers-store';

interface CloudProviderConfigDialogProps {
  provider: CloudProviderWithConfig;
  onClose: () => void;
}

export default function CloudProviderConfigDialog({ provider, onClose }: CloudProviderConfigDialogProps) {
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const { configureCloudProvider } = useCloudProvidersStore();

  const handleSave = async () => {
    setLoading(true);
    try {
      await configureCloudProvider(provider.type, apiKey);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Configure {provider.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder={provider.apiKeyPlaceholder}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>

          <a
            href={provider.apiKeyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-500 hover:underline"
          >
            Get API Key →
          </a>

          <div className="text-sm text-muted-foreground">
            Note: API keys are currently stored in the local database. Secure storage with OS-level encryption is coming
            soon.
          </div>

          <div className="flex justify-end gap-2">
            <Button className="cursor-pointer" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button className="cursor-pointer" onClick={handleSave} disabled={!apiKey || loading}>
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
