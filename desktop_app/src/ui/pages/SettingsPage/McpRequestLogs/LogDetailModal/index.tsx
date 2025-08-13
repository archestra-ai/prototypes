import { Activity, Calendar, Clock, Server } from 'lucide-react';

import { Badge } from '@ui/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@ui/components/ui/dialog';
import { Label } from '@ui/components/ui/label';
import { type McpRequestLog } from '@ui/lib/clients/archestra/api/gen';

import { formatDuration, formatTimestamp, getStatusColor, getStatusLabel } from '../utils';

interface LogDetailModalProps {
  log: McpRequestLog;
  isOpen: boolean;
  onClose: () => void;
}

export default function LogDetailModal({ log, isOpen, onClose }: LogDetailModalProps) {
  const { clientInfo, requestHeaders, responseHeaders } = log;

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
      <DialogContent className="sm:max-w-[1200px] w-[90vw] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Request Details - {log.requestId}
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
                  {log.serverName}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Method</Label>
                <Badge variant="outline">{log.method || 'N/A'}</Badge>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Badge className={getStatusColor(log.statusCode)}>
                  {log.statusCode} - {getStatusLabel(log.statusCode)}
                </Badge>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {formatDuration(log.durationMs ?? undefined)}
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
                <code className="text-sm">{log.sessionId || 'N/A'}</code>
              </div>
            </div>

            {log.mcpSessionId && (
              <div className="space-y-2">
                <Label>MCP Session ID</Label>
                <code className="text-sm">{log.mcpSessionId}</code>
              </div>
            )}

            {clientInfo && (
              <div className="space-y-2">
                <Label>Client Info</Label>
                <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-md text-sm">
                  {clientInfo.clientName && (
                    <div>
                      <strong>Client:</strong> {clientInfo.clientName}
                    </div>
                  )}
                  {clientInfo.clientVersion && (
                    <div>
                      <strong>Version:</strong> {clientInfo.clientVersion}
                    </div>
                  )}
                  {clientInfo.clientPlatform && (
                    <div>
                      <strong>Platform:</strong> {clientInfo.clientPlatform}
                    </div>
                  )}
                  {clientInfo.userAgent && (
                    <div>
                      <strong>User Agent:</strong> {clientInfo.userAgent}
                    </div>
                  )}
                </div>
              </div>
            )}

            {log.errorMessage && (
              <div className="space-y-2">
                <Label className="text-red-600 dark:text-red-400">Error Message</Label>
                <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md text-sm text-red-700 dark:text-red-300">
                  {log.errorMessage}
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
                {formatJson(log.requestBody ?? undefined)}
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
                {formatJson(log.responseBody ?? undefined)}
              </pre>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
