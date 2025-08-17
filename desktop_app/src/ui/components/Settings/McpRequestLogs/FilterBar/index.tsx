import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@ui/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@ui/components/ui/collapsible';
import { Input } from '@ui/components/ui/input';
import { Label } from '@ui/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/ui/select';
import { type McpRequestLogFilterStatus } from '@ui/lib/clients/archestra/api/gen';
import { type McpRequestLogFilters } from '@ui/types';

interface FilterBarProps {
  filters: McpRequestLogFilters;
  onFiltersChange: (filters: McpRequestLogFilters) => void;
  onReset: () => void;
}

export default function FilterBar({ filters, onFiltersChange, onReset }: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full justify-between cursor-pointer">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 mt-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label htmlFor="server-filter">Server Name</Label>
            <Input
              id="server-filter"
              placeholder="Filter by server..."
              value={filters?.serverName || ''}
              onChange={(e) => onFiltersChange({ ...filters, serverName: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method-filter">Method</Label>
            <Input
              id="method-filter"
              placeholder="Filter by method..."
              value={filters?.method || ''}
              onChange={(e) => onFiltersChange({ ...filters, method: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-filter">Session ID</Label>
            <Input
              id="session-filter"
              placeholder="Filter by session..."
              value={filters?.mcpSessionId || ''}
              onChange={(e) => onFiltersChange({ ...filters, mcpSessionId: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-filter">Status Code</Label>
            <Select
              value={filters?.status || 'all'}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  status: value === 'all' ? undefined : (value as McpRequestLogFilterStatus),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status Codes</SelectItem>
                <SelectItem value="HTTP 200">200 - Success</SelectItem>
                <SelectItem value="HTTP 40x">400 - Bad Request</SelectItem>
                <SelectItem value="HTTP 50x">500 - Server Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="cursor-pointer" onClick={onReset} variant="outline" size="sm">
            Reset Filters
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
