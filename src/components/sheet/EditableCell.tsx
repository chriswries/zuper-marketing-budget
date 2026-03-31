import { useState, useRef, useEffect, useCallback, KeyboardEvent, forwardRef, useImperativeHandle } from 'react';
import { TableCell } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface EditableCellHandle {
  startEditing: () => void;
}

export type NavigateDirection = 'right' | 'left' | 'down' | 'up';

interface EditableCellProps {
  value: number;
  formatted: string;
  onSave: (newValue: number) => void;
  onNavigate?: (direction: NavigateDirection) => void;
  className?: string;
}

export const EditableCell = forwardRef<EditableCellHandle, EditableCellProps>(
  function EditableCell({ value, formatted, onSave, onNavigate, className }, ref) {
    const [isEditing, setIsEditing] = useState(false);
    const [inputValue, setInputValue] = useState(value.toString());
    const inputRef = useRef<HTMLInputElement>(null);
    // Track whether blur should be suppressed (navigation already handled save)
    const suppressBlurRef = useRef(false);

    useImperativeHandle(ref, () => ({
      startEditing: () => {
        setInputValue(value.toString());
        setIsEditing(true);
      },
    }), [value]);

    useEffect(() => {
      if (isEditing && inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, [isEditing]);

    const saveValue = useCallback(() => {
      const parsed = parseFloat(inputValue);
      const newValue = isNaN(parsed) ? 0 : Math.max(0, parsed);
      if (newValue !== value) {
        onSave(newValue);
      }
    }, [inputValue, value, onSave]);

    const handleClick = () => {
      setInputValue(value.toString());
      setIsEditing(true);
    };

    const handleSave = () => {
      setIsEditing(false);
      saveValue();
    };

    const handleCancel = () => {
      setIsEditing(false);
      setInputValue(value.toString());
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        suppressBlurRef.current = true;
        saveValue();
        setIsEditing(false);
        onNavigate?.(e.shiftKey ? 'left' : 'right');
      } else if (e.key === 'Enter') {
        e.preventDefault();
        suppressBlurRef.current = true;
        saveValue();
        setIsEditing(false);
        onNavigate?.('down');
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    const handleBlur = () => {
      if (suppressBlurRef.current) {
        suppressBlurRef.current = false;
        return;
      }
      handleSave();
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      if (val === '' || /^[0-9]*\.?[0-9]*$/.test(val)) {
        setInputValue(val);
      }
    };

    if (isEditing) {
      return (
        <TableCell className={cn("relative z-0 text-right p-0 bg-background group-hover:bg-muted", className)}>
          <Input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={inputValue}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="h-8 w-full text-right text-sm border-primary focus-visible:ring-1"
          />
        </TableCell>
      );
    }

    return (
      <TableCell
        className={cn(
          "relative z-0 text-right tabular-nums cursor-pointer bg-background group-hover:bg-muted hover:bg-muted transition-colors",
          className
        )}
        onClick={handleClick}
      >
        {formatted}
      </TableCell>
    );
  }
);
