import { Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

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
import { installMcpServer } from '@ui/lib/clients/archestra/api/gen';
import { useMcpServersStore } from '@ui/stores/mcp-servers-store';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * NOTE: this is the exact same schema as McpServerConfigSchema from @anthropic-ai/dxt
 * (https://github.com/anthropics/dxt/blob/main/src/schemas.ts#L3C14-L7)
 *
 * We could just use zod.extend, BUT for some reason this👇 just doesn't work (typescript complains)
 *
 * const FormSchema = z.object({
 *   name: z.string().min(1, 'Name is required'), <-- Type 'ZodString' is missing the following properties from type 'ZodType
 *   command: z.string().min(1, 'Command is required'),
 *   args: z.string(),
 *   env: z.string(),
 * });
 *
 * See also:
 * https://github.com/archestra-ai/website/blob/fd34cd6400031011a94562785691547fbf152059/app/src/schemas.ts#L106
 */
const FormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  command: z.string().min(1, 'Command is required'),
  args: z.string(),
  env: z.string(),
});

type FormData = z.infer<typeof FormSchema>;

const defaultFormData: FormData = {
  name: 'My Cool Custom MCP Server',
  command: 'node',
  args: '/path/to/server.js --verbose',
  env: 'API_KEY=your-key\nPORT=3000',
};

export default function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { loadInstalledMcpServers } = useMcpServersStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState<FormData>(defaultFormData);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Validate form data
      const validated = FormSchema.parse(formData);

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
      const { error } = await installMcpServer({
        body: {
          displayName: validated.name,
          serverConfig: {
            command: validated.command,
            args,
            env,
          },
        },
      });

      if (error) {
        setError(`There was an error installing the MCP server: ${error}`);
      } else {
        // Refresh the list and close dialog
        await loadInstalledMcpServers();
        onOpenChange(false);
        setFormData(defaultFormData);
      }
    } catch (err) {
      if (err instanceof z.ZodError || err instanceof Error) {
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
