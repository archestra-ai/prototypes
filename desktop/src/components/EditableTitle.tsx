import { Pencil } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

import { TypewriterText } from './TypewriterText';

interface EditableTitleProps {
  title?: string | null;
  defaultTitle?: string;
  isAnimated?: boolean;
  onSave: (newTitle: string | null) => Promise<void>;
  className?: string;
}

export function EditableTitle({
  title,
  defaultTitle = 'New Chat',
  isAnimated = false,
  onSave,
  className = '',
}: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title || defaultTitle);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEditedTitle(title || defaultTitle);
  }, [title, defaultTitle]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const newTitle = editedTitle.trim() || null;
      await onSave(newTitle);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to update title:', error);
      // Reset to original title on error
      setEditedTitle(title || defaultTitle);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setEditedTitle(title || defaultTitle);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <Input
        ref={inputRef}
        value={editedTitle}
        onChange={(e) => setEditedTitle(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className={`h-6 px-1 py-0 text-sm ${className}`}
      />
    );
  }

  const displayTitle = title || defaultTitle;

  return (
    <div
      className={`cursor-pointer hover:bg-accent/50 rounded px-1 -mx-1 flex items-center gap-1 ${className}`}
      onClick={() => setIsEditing(true)}
    >
      <span className="truncate">
        {isAnimated && title ? <TypewriterText text={displayTitle} speed={20} /> : displayTitle}
      </span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
    </div>
  );
}
