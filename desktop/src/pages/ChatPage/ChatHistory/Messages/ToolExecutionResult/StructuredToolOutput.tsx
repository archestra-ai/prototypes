import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ToolContent } from '@/types';

interface StructuredToolOutputProps {
  content: ToolContent[];
}

export default function StructuredToolOutput({ content }: StructuredToolOutputProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!content || content.length === 0) {
    return null;
  }

  // Count different types of content
  const textCount = content.filter((item) => item.type === 'text').length;
  const imageCount = content.filter((item) => item.type === 'image').length;

  const getContentSummary = () => {
    const parts = [];
    if (textCount > 0) parts.push(`${textCount} text${textCount > 1 ? 's' : ''}`);
    if (imageCount > 0) parts.push(`${imageCount} image${imageCount > 1 ? 's' : ''}`);
    return parts.join(', ');
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-6 p-0 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3 mr-1" /> : <ChevronRight className="h-3 w-3 mr-1" />}
          Structured Output ({getContentSummary()})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 space-y-2">
          {content.map((item, idx) => {
            if (item.type === 'text') {
              return (
                <div key={idx} className="text-sm">
                  {item.annotations && (
                    <div className="text-xs text-muted-foreground mb-1">
                      {Object.entries(item.annotations).map(([key, value]) => (
                        <span key={key} className="mr-2">
                          {key}: {JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap break-all text-muted-foreground overflow-x-hidden max-w-full bg-muted/50 p-2 rounded">
                    {item.text}
                  </p>
                </div>
              );
            } else if (item.type === 'image') {
              return (
                <div key={idx} className="space-y-1">
                  {item.annotations && (
                    <div className="text-xs text-muted-foreground">
                      {Object.entries(item.annotations).map(([key, value]) => (
                        <span key={key} className="mr-2">
                          {key}: {JSON.stringify(value)}
                        </span>
                      ))}
                    </div>
                  )}
                  <img
                    src={`data:${item.mimeType};base64,${item.data}`}
                    alt="Tool output"
                    className="max-w-full rounded border"
                  />
                </div>
              );
            }
            return null;
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
