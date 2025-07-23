'use client';

import { Loader2Icon, SendIcon, SquareIcon, XIcon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes, KeyboardEventHandler } from 'react';
import React, { Children, useCallback, useEffect, useRef } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatToolName } from '@/lib/format-tool-name';
import { cn } from '@/lib/utils';

type UseAutoResizeTextareaProps = {
  minHeight: number;
  maxHeight?: number;
};

const useAutoResizeTextarea = ({ minHeight, maxHeight }: UseAutoResizeTextareaProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }
      if (reset) {
        textarea.style.height = `${minHeight}px`;
        return;
      }
      // Temporarily shrink to get the right scrollHeight
      textarea.style.height = `${minHeight}px`;
      // Calculate new height
      const newHeight = Math.max(minHeight, Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY));
      textarea.style.height = `${newHeight}px`;
    },
    [minHeight, maxHeight]
  );
  useEffect(() => {
    // Set initial height
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = `${minHeight}px`;
    }
  }, [minHeight]);
  // Adjust height on window resize
  useEffect(() => {
    const handleResize = () => adjustHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [adjustHeight]);
  return { textareaRef, adjustHeight };
};

export type AIInputProps = HTMLAttributes<HTMLFormElement>;
export const AIInput = ({ className, ...props }: AIInputProps) => (
  <form className={cn('w-full overflow-hidden rounded-xl border bg-background shadow-sm', className)} {...props} />
);

export type AIInputTextareaProps = ComponentProps<typeof Textarea> & {
  minHeight?: number;
  maxHeight?: number;
};
export const AIInputTextarea = ({
  onChange,
  className,
  placeholder = 'What would you like to know?',
  minHeight = 48,
  maxHeight = 164,
  ...props
}: AIInputTextareaProps) => {
  const { textareaRef, adjustHeight } = useAutoResizeTextarea({
    minHeight,
    maxHeight,
  });
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      const form = e.currentTarget.form;
      if (form) {
        form.requestSubmit();
      }
    }
  };
  return (
    <Textarea
      className={cn(
        'w-full resize-none rounded-none border-none p-3 shadow-none outline-none ring-0',
        'bg-transparent dark:bg-transparent',
        'focus-visible:ring-0',
        className
      )}
      name="message"
      onChange={(e) => {
        adjustHeight();
        onChange?.(e);
      }}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      ref={textareaRef}
      {...props}
    />
  );
};

export type AIInputToolbarProps = HTMLAttributes<HTMLDivElement>;
export const AIInputToolbar = ({ className, ...props }: AIInputToolbarProps) => (
  <div className={cn('flex items-center justify-between p-1', className)} {...props} />
);

export type AIInputToolsProps = HTMLAttributes<HTMLDivElement>;
export const AIInputTools = ({ className, ...props }: AIInputToolsProps) => (
  <div className={cn('flex items-center gap-1', '[&_button:first-child]:rounded-bl-xl', className)} {...props} />
);

export type AIInputButtonProps = ComponentProps<typeof Button>;
export const AIInputButton = React.forwardRef<HTMLButtonElement, AIInputButtonProps>(
  ({ variant = 'ghost', className, size, ...props }, ref) => {
    const newSize = (size ?? Children.count(props.children) > 1) ? 'default' : 'icon';
    return (
      <Button
        className={cn(
          'shrink-0 gap-1.5 rounded-lg',
          variant === 'ghost' && 'text-muted-foreground',
          newSize === 'default' && 'px-3',
          className
        )}
        size={newSize}
        type="button"
        variant={variant}
        ref={ref}
        {...props}
      />
    );
  }
);
AIInputButton.displayName = 'AIInputButton';

export type AIInputSubmitProps = ComponentProps<typeof Button> & {
  status?: 'submitted' | 'streaming' | 'ready' | 'error';
};
export const AIInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon',
  status,
  children,
  ...props
}: AIInputSubmitProps) => {
  let Icon = <SendIcon />;
  if (status === 'submitted') {
    Icon = <Loader2Icon className="animate-spin" />;
  } else if (status === 'streaming') {
    Icon = <SquareIcon />;
  } else if (status === 'error') {
    Icon = <XIcon />;
  }
  return (
    <Button
      className={cn('gap-1.5 rounded-lg rounded-br-xl', className)}
      size={size}
      type="submit"
      variant={variant}
      {...props}
    >
      {children ?? Icon}
    </Button>
  );
};

export type AIInputModelSelectProps = ComponentProps<typeof Select>;
export const AIInputModelSelect = (props: AIInputModelSelectProps) => <Select {...props} />;

export type AIInputModelSelectTriggerProps = ComponentProps<typeof SelectTrigger>;
export const AIInputModelSelectTrigger = ({ className, ...props }: AIInputModelSelectTriggerProps) => (
  <SelectTrigger
    className={cn(
      'border-none bg-transparent font-medium text-muted-foreground shadow-none transition-colors',
      'hover:bg-accent hover:text-foreground [&[aria-expanded="true"]]:bg-accent [&[aria-expanded="true"]]:text-foreground',
      className
    )}
    {...props}
  />
);

export type AIInputModelSelectContentProps = ComponentProps<typeof SelectContent>;
export const AIInputModelSelectContent = ({ className, ...props }: AIInputModelSelectContentProps) => (
  <SelectContent className={cn(className)} {...props} />
);

export type AIInputModelSelectItemProps = ComponentProps<typeof SelectItem>;
export const AIInputModelSelectItem = ({ className, ...props }: AIInputModelSelectItemProps) => (
  <SelectItem className={cn(className)} {...props} />
);

export type AIInputModelSelectValueProps = ComponentProps<typeof SelectValue>;
export const AIInputModelSelectValue = ({ className, ...props }: AIInputModelSelectValueProps) => (
  <SelectValue className={cn(className)} {...props} />
);

export interface ToolContext {
  serverName: string;
  toolName: string;
  enabled?: boolean;
}

export type AIInputContextPillsProps = HTMLAttributes<HTMLDivElement> & {
  tools: ToolContext[];
  onRemoveTool: (tool: ToolContext) => void;
};
export const AIInputContextPills = ({ className, tools, onRemoveTool, ...props }: AIInputContextPillsProps) => {
  if (tools.length === 0) return null;

  const getServerIcon = (serverName: string) => {
    switch (serverName.toLowerCase()) {
      case 'gmail':
        return (
          <div className="w-3 h-3 bg-red-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">M</span>
          </div>
        );
      case 'slack':
        return (
          <div className="w-3 h-3 bg-purple-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">#</span>
          </div>
        );
      default:
        return (
          <div className="w-3 h-3 bg-blue-500 rounded-sm flex items-center justify-center">
            <span className="text-white text-[8px] font-bold">{serverName.charAt(0).toUpperCase()}</span>
          </div>
        );
    }
  };

  const getStatusDot = (enabled?: boolean) => {
    if (enabled === false) {
      return <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />;
    }
    // Default to enabled (green) if not specified
    return <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />;
  };

  return (
    <div className={cn('flex flex-wrap gap-2 p-3 pb-0', className)} {...props}>
      {tools.map((tool, index) => (
        <Badge
          key={`${tool.serverName}-${tool.toolName}-${index}`}
          variant="secondary"
          className="flex items-center gap-1.5 px-2 py-1 text-xs"
        >
          {getServerIcon(tool.serverName)}
          {getStatusDot(tool.enabled)}
          <span>{formatToolName(tool.toolName)}</span>
          <button
            onClick={() => onRemoveTool(tool)}
            className="ml-1 hover:bg-muted-foreground/20 rounded-full p-0.5"
            type="button"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
};
