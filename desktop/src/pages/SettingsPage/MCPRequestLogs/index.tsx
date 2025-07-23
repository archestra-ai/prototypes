import {
  Activity,
  AlertCircle,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Filter,
  RefreshCw,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  type LogFilters,
  type MCPRequestLog,
  formatDuration,
  formatTimestamp,
  getStatusColor,
  getStatusLabel,
  useMCPLogsStore,
} from '@/stores/mcp-logs-store';

interface LogDetailModalProps {
  log: MCPRequestLog;
  isOpen: boolean;
  onClose: () => void;
}

function LogDetailModal({ log, isOpen, onClose }: LogDetailModalProps) {
  const { parseClientInfo, parseHeaders } = useMCPLogsStore();

  const clientInfo = parseClientInfo(log.client_info);
  const requestHeaders = parseHeaders(log.request_headers);
  const responseHeaders = parseHeaders(log.response_headers);

  const formatJson = (jsonString?: string) => {
    if (!jsonString) return 'N/A';
    try {
      return JSON.stringify(JSON.parse(jsonString), null, 2);
    } catch {
      return jsonString;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-full h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Request Details - {log.request_id}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Overview Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Overview</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Server Name</Label>
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  {log.server_name}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Badge variant="outline">{log.method || 'N/A'}</Badge>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Badge className={getStatusColor(log.status_code)}>
                  {log.status_code} - {getStatusLabel(log.status_code)}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {formatDuration(log.duration_ms)}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Timestamp</Label>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  {formatTimestamp(log.timestamp)}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Session ID</Label>
                <code className="text-sm">{log.session_id || 'N/A'}</code>
              </div>
            </div>

            {log.mcp_session_id && (
              <div className="space-y-2">
                <Label>MCP Session ID</Label>
                <code className="text-sm">{log.mcp_session_id}</code>
              </div>
            )}

            {clientInfo && (
              <div className="space-y-2">
                <Label>Client Info</Label>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md text-sm">
                  {clientInfo.client_name && (
                    <div>
                      <strong>Client:</strong> {clientInfo.client_name}
                    </div>
                  )}
                  {clientInfo.client_version && (
                    <div>
                      <strong>Version:</strong> {clientInfo.client_version}
                    </div>
                  )}
                  {clientInfo.client_platform && (
                    <div>
                      <strong>Platform:</strong> {clientInfo.client_platform}
                    </div>
                  )}
                  {clientInfo.user_agent && (
                    <div>
                      <strong>User Agent:</strong> {clientInfo.user_agent}
                    </div>
                  )}
                </div>
              </div>
            )}

            {log.error_message && (
              <div className="space-y-2">
                <Label className="text-red-600 dark:text-red-400">Error Message</Label>
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md text-sm text-red-700 dark:text-red-300">
                  {log.error_message}
                </div>
              </div>
            )}
          </div>

          {/* Request Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Request</h3>
            <div>
              <Label>Request Headers</Label>
              <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm overflow-auto max-h-48 mt-2">
                {requestHeaders ? JSON.stringify(requestHeaders, null, 2) : 'N/A'}
              </pre>
            </div>
            <div>
              <Label>Request Body</Label>
              <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm overflow-auto max-h-64 mt-2">
                {formatJson(log.request_body)}
              </pre>
            </div>
          </div>

          {/* Response Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Response</h3>
            <div>
              <Label>Response Headers</Label>
              <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm overflow-auto max-h-48 mt-2">
                {responseHeaders ? JSON.stringify(responseHeaders, null, 2) : 'N/A'}
              </pre>
            </div>
            <div>
              <Label>Response Body</Label>
              <pre className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm overflow-auto max-h-64 mt-2">
                {formatJson(log.response_body)}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface FilterBarProps {
  filters: LogFilters;
  onFiltersChange: (filters: LogFilters) => void;
  onReset: () => void;
}

function FilterBar({ filters, onFiltersChange, onReset }: FilterBarProps) {
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

export default function MCPRequestLogs() {
  const {
    logs,
    totalPages,
    currentPage,
    pageSize,
    filters,
    stats,
    isLoading,
    error,
    selectedLogId,
    selectedLog,
    autoRefresh,
    refreshInterval,
    setFilters,
    setPage,
    setPageSize,
    setSelectedLogId,
    setAutoRefresh,
    setRefreshInterval,
    clearLogs,
    refresh,
    resetFilters,
  } = useMCPLogsStore();

  const [isOpen, setIsOpen] = useState(false);
  const [showClearDialog, setShowClearDialog] = useState(false);

  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen, refresh]);

  const handleClearLogs = async () => {
    await clearLogs(true);
    setShowClearDialog(false);
  };

  const getStatusIcon = (statusCode: number) => {
    if (statusCode >= 200 && statusCode < 300)
      return <CheckCircle className="h-4 w-4 text-green-500 dark:text-green-400" />;
    if (statusCode >= 400 && statusCode < 500)
      return <AlertCircle className="h-4 w-4 text-yellow-500 dark:text-yellow-400" />;
    if (statusCode >= 500) return <XCircle className="h-4 w-4 text-red-500 dark:text-red-400" />;
    return <AlertCircle className="h-4 w-4 text-gray-500 dark:text-gray-400" />;
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  MCP Request Logs
                </CardTitle>
                <CardDescription>Monitor and analyze all MCP server requests and responses</CardDescription>
              </div>
              {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Stats Overview */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
                  <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Requests</div>
                  <div className="text-xl font-bold text-blue-900 dark:text-blue-100">{stats.total_requests}</div>
                </div>
                <div className="bg-green-50 dark:bg-green-950 p-3 rounded-lg">
                  <div className="text-sm text-green-600 dark:text-green-400 font-medium">Success Rate</div>
                  <div className="text-xl font-bold text-green-900 dark:text-green-100">
                    {stats.total_requests > 0
                      ? `${((stats.success_count / stats.total_requests) * 100).toFixed(1)}%`
                      : '0%'}
                  </div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
                  <div className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Avg Duration</div>
                  <div className="text-xl font-bold text-yellow-900 dark:text-yellow-100">
                    {formatDuration(Math.round(stats.avg_duration_ms))}
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-950 p-3 rounded-lg">
                  <div className="text-sm text-purple-600 dark:text-purple-400 font-medium">Active Servers</div>
                  <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
                    {Object.keys(stats.requests_per_server).length}
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-4 justify-between">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => refresh()}
                  variant="outline"
                  size="sm"
                  disabled={isLoading}
                  className="flex items-center gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>

                <div className="flex items-center gap-2">
                  <Switch id="auto-refresh" checked={autoRefresh} onCheckedChange={setAutoRefresh} />
                  <Label htmlFor="auto-refresh" className="text-sm">
                    Auto-refresh ({refreshInterval}s)
                  </Label>
                </div>

                <Select
                  value={refreshInterval.toString()}
                  onValueChange={(value) => setRefreshInterval(parseInt(value))}
                >
                  <SelectTrigger className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10s</SelectItem>
                    <SelectItem value="30">30s</SelectItem>
                    <SelectItem value="60">60s</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2">
                <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Trash2 className="h-4 w-4" />
                      Clear All Logs
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Clear All Logs</DialogTitle>
                    </DialogHeader>
                    <p>This will remove ALL request logs from the database. This action cannot be undone.</p>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" onClick={() => setShowClearDialog(false)}>
                        Cancel
                      </Button>
                      <Button variant="destructive" onClick={handleClearLogs}>
                        Clear Logs
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Filters */}
            <FilterBar filters={filters} onFiltersChange={setFilters} onReset={resetFilters} />

            {error && (
              <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Logs Table */}
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Session</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Loading logs...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getStatusIcon(log.status_code)}
                            <span className={`text-sm ${getStatusColor(log.status_code)}`}>{log.status_code}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.server_name || 'Unknown'}</Badge>
                        </TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {log.method || 'N/A'}
                          </code>
                        </TableCell>
                        <TableCell>{formatDuration(log.duration_ms)}</TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {log.session_id && (
                              <div className="text-xs font-mono text-gray-600 dark:text-gray-300">
                                {log.session_id.substring(0, 8)}...
                              </div>
                            )}
                            {log.mcp_session_id && (
                              <div className="text-xs font-mono text-blue-600 dark:text-blue-400">
                                MCP: {log.mcp_session_id.substring(0, 8)}...
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{formatTimestamp(log.timestamp)}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedLogId(log.id)}
                            className="flex items-center gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    Page {currentPage + 1} of {totalPages}
                  </span>
                  <Select value={pageSize.toString()} onValueChange={(value) => setPageSize(parseInt(value))}>
                    <SelectTrigger className="w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(currentPage - 1)}
                    disabled={currentPage === 0}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}

            {/* Log Detail Modal */}
            {selectedLog && (
              <LogDetailModal
                log={selectedLog}
                isOpen={selectedLogId !== null}
                onClose={() => setSelectedLogId(null)}
              />
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
