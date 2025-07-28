import { ChevronDown, Wrench } from 'lucide-react';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChatInteraction } from '@/types';

interface ToolInteractionProps {
  interaction: ChatInteraction;
}

export default function ToolInteraction({ interaction }: ToolInteractionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const contentLength = interaction.content.length;
  const shouldCollapse = contentLength > 500;

  if (!shouldCollapse) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Tool Result</span>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="text-sm whitespace-pre-wrap font-mono break-all overflow-wrap-anywhere overflow-hidden max-w-full">
            {interaction.content}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Tool Result</span>
          <CollapsibleTrigger className="ml-auto flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200">
            <span>
              {isOpen ? 'Hide' : 'Show'} ({contentLength} chars)
            </span>
            <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </CollapsibleTrigger>
        </div>

        {!isOpen && (
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-sm whitespace-pre-wrap font-mono break-all overflow-wrap-anywhere overflow-hidden max-w-full">
              {interaction.content.slice(0, 200)}...
            </div>
          </div>
        )}

        <CollapsibleContent>
          <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div className="text-xs text-gray-400 whitespace-pre-wrap font-mono break-all overflow-wrap-anywhere overflow-hidden max-w-full">
              {interaction.content}
            </div>
            <CollapsibleTrigger className="mt-3 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-200 cursor-pointer">
              <span>Collapse</span>
              <ChevronDown className="h-3 w-3 rotate-180" />
            </CollapsibleTrigger>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
