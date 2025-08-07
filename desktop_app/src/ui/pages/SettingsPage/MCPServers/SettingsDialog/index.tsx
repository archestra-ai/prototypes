import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

import { installCustomMcpServer } from '@clients/archestra/api/gen';
import { Button } from '@ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/components/ui/dialog';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import { Textarea } from '@ui/components/ui/textarea';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Validation schema
/**
 * TODO: see if there is a way that we can EXTEND the fields in McpServerServerConfigSchema, such that
 * we can add "validation messages" like the below
 */
// const serverConfigSchema = McpServerServerConfigSchema.extend({
//   mcp_config: z.object({
//     command: z.string().min(1, 'Command is required'),
//     args: z.string(),
//     env: z.string(),
//   }),
//   name: z.string().min(1, 'Name is required'),
//   command: z.string().min(1, 'Command is required'),
//   args: z.string(),
//   env: z.string(),
// });

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { loadInstalledMcpServers } = useMcpServersStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    command: '',
    args: '',
    env: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate form data
      const validated = serverConfigSchema.parse(formData);

      // Parse args and env
      const args = validated.args
        .split('\n')
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0);

      const envPairs = validated.env
        .split('\n')
        .map((pair) => pair.trim())
        .filter((pair) => pair.length > 0)
        .map((pair) => {
          const [key, value] = pair.split('=');
          return { key: key?.trim(), value: value?.trim() };
        });

      // Validate env pairs
      for (const { key, value } of envPairs) {
        if (!key || !value) {
          throw new Error('Invalid environment variable format. Use KEY=value format.');
        }
      }

      const env = Object.fromEntries(envPairs.map(({ key, value }) => [key, value]));

      // Submit to API
      const response = await installCustomMcpServer({
        body: {
          name: validated.name,
          serverConfig: {
            command: validated.command,
            args,
            env,
          },
        },
      });

      if ('error' in response) {
        throw new Error(response.error);
      }

      // Refresh the list and close dialog
      await loadInstalledMcpServers();
      onOpenChange(false);

      // Reset form
      setFormData({
        name: '',
        command: '',
        args: '',
        env: '',
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to install MCP server');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange =
    (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFormData((prev) => ({
        ...prev,
        [field]: e.target.value,
      }));
    };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Install Custom MCP Server
          </DialogTitle>
          <DialogDescription>
            Configure a custom MCP server by providing the command and configuration details.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="my-custom-server"
              value={formData.name}
              onChange={handleInputChange('name')}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">A unique name to identify this server</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="command">Command</Label>
            <Input
              id="command"
              placeholder="node"
              value={formData.command}
              onChange={handleInputChange('command')}
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">The executable command to run</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="args">Arguments (one per line)</Label>
            <Textarea
              id="args"
              placeholder="/path/to/server.js&#10;--verbose"
              value={formData.args}
              onChange={handleInputChange('args')}
              disabled={isSubmitting}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Command line arguments, one per line</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="env">Environment Variables (KEY=value format)</Label>
            <Textarea
              id="env"
              placeholder="API_KEY=your-key&#10;PORT=3000"
              value={formData.env}
              onChange={handleInputChange('env')}
              disabled={isSubmitting}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">Environment variables in KEY=value format, one per line</p>
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Installing...
                </>
              ) : (
                'Install Server'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
