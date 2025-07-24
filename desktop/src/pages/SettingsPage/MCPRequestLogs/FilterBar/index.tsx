import { ChevronDown, ChevronUp, Filter } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { type McpRequestLogFilters } from '@/lib/api-client';

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
        <Button variant="outline" className="w-full justify-between">
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
              value={filters.server_name || ''}
              onChange={(e) => onFiltersChange({ ...filters, server_name: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="method-filter">Method</Label>
            <Input
              id="method-filter"
              placeholder="Filter by method..."
              value={filters.method || ''}
              onChange={(e) => onFiltersChange({ ...filters, method: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="session-filter">Session ID</Label>
            <Input
              id="session-filter"
              placeholder="Filter by session..."
              value={filters.session_id || ''}
              onChange={(e) => onFiltersChange({ ...filters, session_id: e.target.value || undefined })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status-filter">Status Code</Label>
            <Select
              value={filters.status_code?.toString() || 'all'}
              onValueChange={(value) =>
                onFiltersChange({
                  ...filters,
                  status_code: value === 'all' ? undefined : parseInt(value),
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status Codes</SelectItem>
                <SelectItem value="200">200 - Success</SelectItem>
                <SelectItem value="400">400 - Bad Request</SelectItem>
                <SelectItem value="500">500 - Server Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={onReset} variant="outline" size="sm">
            Reset Filters
          </Button>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
